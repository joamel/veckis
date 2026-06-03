import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient } from '../../src/api/client';
import { RecurrencePicker } from '../../src/components/RecurrencePicker';
import { useHouseholdSocket } from '../../src/hooks/useHouseholdSocket';
import { useAuth } from '@clerk/clerk-expo';
import { DatePickerModal } from '../../src/components/DatePickerModal';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useMemberFilter } from '../../src/context/MemberFilterContext';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useSpotlightTip, useTipsReady } from '../../src/context/SpotlightTipContext';
import { useFirstActionTip } from '../../src/hooks/useFirstActionTip';
import { useOnceFlag } from '../../src/hooks/useOnceFlag';
import { useHaptics } from '../../src/hooks/useHaptics';
import { useTablet } from '../../src/hooks/useTablet';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState } from '../../src/components/EmptyState';
import { ConflictBanner } from '../../src/components/ConflictBanner';
import type { Chore, ChoreCompletion, ChoreFrequency, RecurrenceType, WeekDay } from '@veckis/shared';
import { occursOn, weekdayOf, computeCurrentTurn, computeTurnHistory, type RecurrencePattern } from '@veckis/shared';

type ChoreWithCompletion = Chore & { completions: ChoreCompletion[] };

const FREQ_LABELS: Record<ChoreFrequency, string> = {
  once: 'En gång',
  daily: 'Dagligen',
  weekly: 'Varje vecka',
  biweekly: 'Varannan vecka',
  monthly: 'Månadsvis',
};

const DAYS: { key: WeekDay; short: string }[] = [
  { key: 'mon', short: 'Mån' },
  { key: 'tue', short: 'Tis' },
  { key: 'wed', short: 'Ons' },
  { key: 'thu', short: 'Tor' },
  { key: 'fri', short: 'Fre' },
  { key: 'sat', short: 'Lör' },
  { key: 'sun', short: 'Sön' },
];

function daysSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Idag';
  if (days === 1) return 'Igår';
  return `${days} dagar sedan`;
}

// A once-chore is done if it has any completion (ever). A recurring chore is "fully done today"
// only if ALL its days have a completion for that specific day within the last 24h.
function isOnce(chore: ChoreWithCompletion): boolean {
  return chore.recurrenceType ? chore.recurrenceType === 'none' : chore.frequency === 'once';
}

function isFullyDone(chore: ChoreWithCompletion): boolean {
  if (isOnce(chore)) {
    return chore.completions.length > 0;
  }
  if (chore.days.length === 0) return false;
  const cutoff = Date.now() - 86400000;
  return chore.days.every(day =>
    chore.completions.some(c => c.day === day && new Date(c.completedAt).getTime() > cutoff)
  );
}

function isoDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "mån 23/6" for an occurrence's history row.
function formatOcc(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const short = DAYS.find(x => x.key === weekdayOf(d))?.short ?? '';
  return `${short} ${d.getDate()}/${d.getMonth() + 1}`;
}

function choreToPattern(c: ChoreWithCompletion): RecurrencePattern {
  return {
    recurrenceType: c.recurrenceType,
    recurrenceWeeks: c.recurrenceWeeks,
    recurrenceDays: c.days,
    monthlyType: c.monthlyType,
    recurrenceWeekOfMonth: c.recurrenceWeekOfMonth,
    startDate: c.startDate,
    endDate: c.endDate,
  };
}

// Which date a completion covers: explicit `date`, else the day it was logged.
function completionDate(comp: ChoreCompletion): string {
  return comp.date ?? isoDateStr(new Date(comp.completedAt));
}

interface ChoreOccurrence {
  date: string;
  done: boolean;
  isCurrent: boolean;
  completedBy: string | null;          // clerkUserId who pressed Klar
  performedByMemberId: string | null;  // who actually did it (may be a local profile)
}
interface RecurringStatus {
  occurrences: ChoreOccurrence[]; // ascending, recent window
  current: ChoreOccurrence | null; // latest occurrence on/before today
  nextDate: string | null; // first occurrence strictly after today
  state: 'done' | 'today' | 'overdue' | 'none';
  overdueDays: number;
}

// Forgiving model: the only actionable occurrence is the latest one on/before
// today (grace lasts until the next occurrence). Older un-done occurrences are
// silently "missed" — shown in history, no repeat reminders.
function recurringStatus(chore: ChoreWithCompletion, daysBack = 60): RecurringStatus {
  const pattern = choreToPattern(chore);
  const completionByDate = new Map(chore.completions.map(c => [completionDate(c), c]));
  const today = new Date();
  const todayStr = isoDateStr(today);
  const occurrences: ChoreOccurrence[] = [];
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    if (occursOn(pattern, d)) {
      const date = isoDateStr(d);
      const comp = completionByDate.get(date);
      occurrences.push({
        date,
        done: !!comp,
        isCurrent: false,
        completedBy: comp?.completedBy ?? null,
        performedByMemberId: comp?.performedByMemberId ?? null,
      });
    }
  }
  let current: ChoreOccurrence | null = null;
  for (let i = occurrences.length - 1; i >= 0; i--) {
    if (occurrences[i].date <= todayStr) { occurrences[i].isCurrent = true; current = occurrences[i]; break; }
  }
  let nextDate: string | null = null;
  for (let i = 1; i <= 90; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (occursOn(pattern, d)) { nextDate = isoDateStr(d); break; }
  }
  let state: RecurringStatus['state'] = 'none';
  let overdueDays = 0;
  if (current) {
    if (current.done) state = 'done';
    else if (current.date === todayStr) state = 'today';
    else {
      state = 'overdue';
      const cd = new Date(current.date + 'T00:00:00').getTime();
      const t0 = new Date(todayStr + 'T00:00:00').getTime();
      overdueDays = Math.round((t0 - cd) / 86400000);
    }
  }
  return { occurrences, current, nextDate, state, overdueDays };
}

type Member = { id: string; clerkUserId: string | null; displayName: string };

function toggleDay(days: WeekDay[], day: WeekDay): WeekDay[] {
  return days.includes(day) ? days.filter(d => d !== day) : [...days, day];
}

function DayPicker({ selected, onChange }: { selected: WeekDay[]; onChange: (days: WeekDay[]) => void }) {
  return (
    <View style={s.dayRow}>
      {DAYS.map(d => (
        <Pressable
          key={d.key}
          style={[s.dayOption, selected.includes(d.key) && s.dayOptionActive]}
          onPress={() => onChange(toggleDay(selected, d.key))}
        >
          <Text style={[s.dayOptionText, selected.includes(d.key) && s.dayOptionTextActive]}>
            {d.short}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

interface MultiMemberPickerProps {
  members: Member[];
  selected: string[];
  rotation: boolean;
  onChange: (ids: string[]) => void;
  onRotationChange: (v: boolean) => void;
}
function MultiMemberPicker({ members, selected, rotation, onChange, onRotationChange }: MultiMemberPickerProps) {
  if (members.length === 0) return null;
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else onChange([...selected, id]);
  };
  return (
    <>
      <Text style={s.label}>Tilldela person{selected.length > 1 ? 'er' : ''}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.memberChipRow}>
        <Pressable
          style={[s.memberChip, selected.length === 0 && s.memberChipActive]}
          onPress={() => onChange([])}
        >
          <Text style={[s.memberChipText, selected.length === 0 && s.memberChipTextActive]}>Ingen</Text>
        </Pressable>
        {members.map(m => {
          const isActive = selected.includes(m.id);
          return (
            <Pressable
              key={m.id}
              style={[s.memberChip, isActive && s.memberChipActive]}
              onPress={() => toggle(m.id)}
            >
              <Text style={[s.memberChipText, isActive && s.memberChipTextActive]}>{m.displayName}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {selected.length >= 2 ? (
        <Pressable
          style={s.rotationRow}
          onPress={() => onRotationChange(!rotation)}
          accessibilityRole="switch"
          accessibilityState={{ checked: rotation }}
        >
          <View style={[s.rotationBox, rotation && s.rotationBoxActive]}>
            {rotation ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rotationLabel}>Turas om automatiskt</Text>
            <Text style={s.rotationSub}>
              {rotation
                ? 'Tur byts efter varje avbockning — alla turas om i listan.'
                : 'Alla i listan är gemensamt ansvariga (ingen rotation).'}
            </Text>
          </View>
        </Pressable>
      ) : null}
    </>
  );
}

export default function ChoresScreen() {
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { getToken, userId } = useAuth();
  const { medium } = useHaptics();
  const { fs, sp } = useTablet();
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMessage, setToastMessage] = useState('');
  const { showError } = useToast();
  const confirm = useConfirm();
  const showTip = useSpotlightTip();
  const tipsReady = useTipsReady();
  // Historik-tipset wrap:as runt utfäll-knappens onPress — visas alltså bara
  // när användaren faktiskt fäller ut en återkommande syssla (där historiken
  // syns) istället för passivt vid fokus.
  const wrapExpandTip = useFirstActionTip('seen-forgiving-tip');
  // Rotation-tipset fyrar när användaren för första gången har 2+ medlemmar
  // valda i editorn — då dyker rotation-toggle:n upp och behöver förklaras.
  const rotationTip = useOnceFlag('seen-rotation-toggle-tip');
  // Intro-tip — vad fliken är till för. Fyrar EN gång, oavsett om det finns
  // sysslor inlagda (så användaren förstår syftet med fliken direkt).
  const choresIntroTip = useOnceFlag('seen-chores-intro-tip');
  const choresIntroTipShownRef = useRef(false);
  const filterTip = useOnceFlag('seen-filter-tip');
  const filterTipShownRef = useRef(false);
  const filterBtnRef = useRef<View>(null);
  const router = useRouter();
  const deeplinkParams = useLocalSearchParams<{ choreId?: string }>();
  const openedChoreParamRef = useRef<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }

  const [chores, setChores] = useState<ChoreWithCompletion[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  useHouseholdSocket(householdId, getToken, (msg) => {
    if (msg.type === 'chore_added') {
      setChores(prev => prev.some(c => c.id === msg.data.id) ? prev : [...prev, msg.data as never]);
    } else if (msg.type === 'chore_updated') {
      if (editingChore?.id === msg.data.id) setChoreConflict({ msg: `${msg.actor ?? 'Någon'} ändrade ${editingChore.title}`, latest: { ...editingChore, ...msg.data } });
      setChores(prev => prev.map(c => c.id === msg.data.id ? { ...c, ...msg.data } as never : c));
    } else if (msg.type === 'chore_deleted') {
      if (editingChore?.id === msg.data.id) { showToast(`${msg.actor ?? 'Någon'} tog bort ${editingChore.title}`); setEditingChore(null); }
      setChores(prev => prev.filter(c => c.id !== msg.data.id));
    } else if (msg.type === 'chore_completed') {
      setChores(prev => prev.map(c => c.id === msg.data.choreId
        ? { ...c, completions: c.completions.some(x => x.id === msg.data.id) ? c.completions : [msg.data, ...c.completions] }
        : c));
    } else if (msg.type === 'chore_uncompleted') {
      const { date, day } = msg.data;
      setChores(prev => prev.map(c => c.id === msg.data.id
        ? { ...c, completions: c.completions.filter(x => {
            if (date) return x.date !== date;
            return x.day !== day || (Date.now() - new Date(x.completedAt).getTime()) > 86_400_000;
          }) }
        : c));
    }
  });
  const [loading, setLoading] = useState(true);
  const { filterMemberIds, setFilterMemberIds } = useMemberFilter();
  const [showFilterModal, setShowFilterModal] = useState(false);
  // "Min tur"-snabbfilter: visa bara roterande sysslor där JAG har tur just nu.
  // Sysslor utan rotation där jag är med inkluderas alltid (de är "alla mina").
  const [myTurnOnly, setMyTurnOnly] = useState(false);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAssignedToMany, setNewAssignedToMany] = useState<string[]>([]);
  const [newRotation, setNewRotation] = useState(false);
  const [newRecurrenceType, setNewRecurrenceType] = useState<RecurrenceType>('none');
  const [newRecurrenceWeeks, setNewRecurrenceWeeks] = useState(1);
  const [newRecurrenceDays, setNewRecurrenceDays] = useState<WeekDay[]>([]);
  const [newMonthlyType, setNewMonthlyType] = useState<'day_of_month' | 'weekday_of_month'>('day_of_month');
  const [newRecurrenceWeekOfMonth, setNewRecurrenceWeekOfMonth] = useState(1);
  const [newMonthDay, setNewMonthDay] = useState(1);
  const [newWeekday, setNewWeekday] = useState<WeekDay>('mon');
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editingChore, setEditingChore] = useState<ChoreWithCompletion | null>(null);
  const [expandedChores, setExpandedChores] = useState<Set<string>>(new Set());
  const [choreConflict, setChoreConflict] = useState<{ msg: string; latest: ChoreWithCompletion } | null>(null);
  // Clear the conflict banner when the opened chore changes (open/switch/close);
  // a socket update to the same open chore keeps the id, so the banner survives.
  useEffect(() => { setChoreConflict(null); }, [editingChore?.id]);
  const [editTitle, setEditTitle] = useState('');
  const [editAssignedToMany, setEditAssignedToMany] = useState<string[]>([]);
  const [editRotation, setEditRotation] = useState(false);
  // Rotation-tipset: fyra när en av pickrarna passerar 2 medlemmar (då
  // rotation-toggle:n dyker upp).
  useEffect(() => {
    if (!tipsReady) return;
    if (rotationTip.seen !== false) return;
    const newHas2 = newAssignedToMany.length >= 2 && showCreate;
    const editHas2 = editAssignedToMany.length >= 2 && !!editingChore;
    if (!newHas2 && !editHas2) return;
    const shown = showTip({
      title: 'Turas om automatiskt',
      message: 'När 2 eller fler är tilldelade kan du slå på "Turas om" — då växlar turen mellan er per tillfälle. Lämna av om alla är gemensamt ansvariga.',
    });
    if (shown) rotationTip.markSeen();
  }, [tipsReady, rotationTip, newAssignedToMany.length, editAssignedToMany.length, showCreate, editingChore, showTip]);
  const [editRecurrenceType, setEditRecurrenceType] = useState<RecurrenceType>('none');
  const [editRecurrenceWeeks, setEditRecurrenceWeeks] = useState(1);
  const [editRecurrenceDays, setEditRecurrenceDays] = useState<WeekDay[]>([]);
  const [editMonthlyType, setEditMonthlyType] = useState<'day_of_month' | 'weekday_of_month'>('day_of_month');
  const [editRecurrenceWeekOfMonth, setEditRecurrenceWeekOfMonth] = useState(1);
  const [editMonthDay, setEditMonthDay] = useState(1);
  const [editWeekday, setEditWeekday] = useState<WeekDay>('mon');
  const [saving, setSaving] = useState(false);

  // Date range state
  const [newStartDate, setNewStartDate] = useState<string | null>(null);
  const [newEndDate, setNewEndDate] = useState<string | null>(null);
  const [showNewStartPicker, setShowNewStartPicker] = useState(false);
  const [showNewEndPicker, setShowNewEndPicker] = useState(false);
  const [editStartDate, setEditStartDate] = useState<string | null>(null);
  const [editEndDate, setEditEndDate] = useState<string | null>(null);
  const [showEditStartPicker, setShowEditStartPicker] = useState(false);
  const [showEditEndPicker, setShowEditEndPicker] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const [choreData, household] = await Promise.all([
        client.getChores(householdId),
        client.getHousehold(householdId),
      ]);
      setChores(choreData);
      setMembers(household.members);
    } catch {
      confirm({ title: 'Fel', message: 'Kunde inte ladda sysslor', buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Deep link from a tapped chore notification (L45): open that chore's edit
  // dialog once chores have loaded, then clear the param so it won't re-fire.
  useEffect(() => {
    const id = deeplinkParams.choreId;
    if (!id || chores.length === 0 || openedChoreParamRef.current === id) return;
    const chore = chores.find(c => c.id === id);
    if (chore) {
      openedChoreParamRef.current = id;
      openEdit(chore);
      router.setParams({ choreId: undefined });
    }
  }, [deeplinkParams.choreId, chores, router]);

  // Intro-tip: vad fliken är till för. Fyrar först av allt så användaren
  // förstår syftet direkt (även med tom lista).
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (choresIntroTip.seen !== false || choresIntroTipShownRef.current) return;
    const shown = showTip({
      title: 'Sysslor',
      message: 'Här strukturerar du återkommande sysslor — disk, sopor, dammsuga. Prova ett roterande schema så alla i hushållet turas om automatiskt, och bocka av allteftersom.',
    });
    if (shown) { choresIntroTipShownRef.current = true; choresIntroTip.markSeen(); }
  }, [tipsReady, choresIntroTip.seen, choresIntroTip.markSeen, showTip]));


  // Filter-tip i sysslor — useFocusEffect så det bara fyrar från aktiv flik.
  // Samma flagga som schedule så bara en av flikarna visar tipset.
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (filterTip.seen !== false || filterTipShownRef.current) return;
    if (members.length === 0) return;
    const shown = showTip({
      title: 'Filtrera på person',
      message: 'Tryck här för att bara visa sysslor (och aktiviteter) för en eller flera personer. Filtret gäller både sysslor-fliken och kalendern.',
      targetRef: filterBtnRef,
    });
    if (shown) { filterTipShownRef.current = true; filterTip.markSeen(); }
  }, [tipsReady, members.length, filterTip.seen, filterTip.markSeen, showTip]));

  // Completed chores sorted to the bottom, with optional member filter
  const sortedChores = useMemo(() => {
    // Multi-assign matchning: filter slår om någon i assignedToMany finns i
    // filtret. Fallback till legacy single assignedTo om many-arrayen är tom.
    const memberFilter = (c: ChoreWithCompletion) => {
      const ids = c.assignedToMany?.length ? c.assignedToMany : (c.assignedTo ? [c.assignedTo] : []);
      return filterMemberIds.length === 0 || ids.some(id => filterMemberIds.includes(id));
    };
    // "Min tur"-filter: bara rotation-sysslor där jag är aktuell turperson.
    // Icke-roterande sysslor jag är med i räknas också som "mina" och hänger
    // med. Sysslor jag inte är med i alls filtreras bort.
    const myMemberId = userId ? members.find(m => m.clerkUserId === userId)?.id ?? null : null;
    const turnFilter = (c: ChoreWithCompletion) => {
      if (!myTurnOnly) return true;
      if (!myMemberId) return false;
      const ids = c.assignedToMany?.length ? c.assignedToMany : (c.assignedTo ? [c.assignedTo] : []);
      if (!ids.includes(myMemberId)) return false;
      if (!c.rotation || ids.length < 2) return true;
      return computeCurrentTurn({ rotation: true, assignedToMany: ids }, c.completions.length) === myMemberId;
    };
    const filtered = chores.filter(c => memberFilter(c) && turnFilter(c));
    // Match the card's notion of "done": occurrence-based for recurring chores.
    const choreDone = (c: ChoreWithCompletion) => isOnce(c) ? isFullyDone(c) : recurringStatus(c).state === 'done';
    const done = filtered.filter(choreDone);
    const notDone = filtered.filter(c => !choreDone(c));
    return [...notDone, ...done];
  }, [chores, filterMemberIds, myTurnOnly, userId, members]);

  const completedOnce = useMemo(
    () => chores.filter(c => isOnce(c) && c.completions.length > 0),
    [chores]
  );

  function getMemberName(memberId: string | null) {
    if (!memberId) return null;
    return members.find(m => m.id === memberId)?.displayName ?? null;
  }

  // Etikett för "tilldelad" på syssla-kortet:
  //  - rotation=true + 2+ medlemmar → "Annas tur · Nästa: Bo"
  //  - flera utan rotation → "Anna · Bo · Carl" (kommatecken-separerad)
  //  - en medlem → "Anna"
  //  - ingen → null (visas inte)
  function buildAssignedLabel(chore: ChoreWithCompletion): string | null {
    const ids = chore.assignedToMany?.length ? chore.assignedToMany : (chore.assignedTo ? [chore.assignedTo] : []);
    if (ids.length === 0) return null;
    const names = ids.map(id => getMemberName(id) ?? '').filter(Boolean);
    if (names.length === 0) return null;
    if (chore.rotation && ids.length >= 2) {
      const currentId = computeCurrentTurn({ rotation: true, assignedToMany: ids }, chore.completions.length);
      const nextId = computeCurrentTurn({ rotation: true, assignedToMany: ids }, chore.completions.length + 1);
      const currentName = currentId ? getMemberName(currentId) : null;
      const nextName = nextId && nextId !== currentId ? getMemberName(nextId) : null;
      return currentName
        ? (nextName ? `${currentName}s tur · Nästa: ${nextName}` : `${currentName}s tur`)
        : names.join(' · ');
    }
    return names.join(' · ');
  }

  // Who completed an occurrence (completedBy is a clerkUserId; local profiles
  // can't complete so this is always a logged-in account).
  function memberNameByClerkId(clerkUserId: string | null) {
    if (!clerkUserId) return null;
    return members.find(m => m.clerkUserId === clerkUserId)?.displayName ?? null;
  }

  // For monthly recurrence we encode the user's chosen pattern in startDate so it
  // round-trips: day_of_month uses the chosen day, weekday_of_month resolves to the
  // Nth occurrence of the chosen weekday in the current month.
  function buildMonthlyStartDate(monthlyType: 'day_of_month' | 'weekday_of_month', dayOfMonth: number, weekday: WeekDay, weekOfMonth: number): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (monthlyType === 'day_of_month') {
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const d = Math.min(Math.max(1, dayOfMonth), daysInMonth);
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    const wIdx = ['sun','mon','tue','wed','thu','fri','sat'].indexOf(weekday);
    const firstWeekdayIdx = new Date(y, m, 1).getDay();
    const offset = (wIdx - firstWeekdayIdx + 7) % 7;
    const d = 1 + offset + (Math.max(1, weekOfMonth) - 1) * 7;
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function deriveMonthlyFromStartDate(startDate: string | null): { dayOfMonth: number; weekday: WeekDay } {
    if (!startDate) return { dayOfMonth: 1, weekday: 'mon' };
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
    if (!m) return { dayOfMonth: 1, weekday: 'mon' };
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const days: WeekDay[] = ['sun','mon','tue','wed','thu','fri','sat'];
    return { dayOfMonth: dt.getDate(), weekday: days[dt.getDay()] };
  }

  function resetCreateForm() {
    setNewTitle('');
    setNewAssignedToMany([]);
    setNewRotation(false);
    setNewRecurrenceType('none');
    setNewRecurrenceWeeks(1);
    setNewRecurrenceDays([]);
    setNewMonthlyType('day_of_month');
    setNewRecurrenceWeekOfMonth(1);
    setNewMonthDay(1);
    setNewWeekday('mon');
    setNewStartDate(null);
    setNewEndDate(null);
  }

  // Always open a fresh dialog so an abandoned (cancelled) syssla doesn't reappear.
  function openCreate() {
    resetCreateForm();
    setShowCreate(true);
  }

  async function createChore() {
    if (!householdId || !newTitle.trim()) return;
    setCreating(true);
    try {
      const days = newRecurrenceType === 'weekly' ? newRecurrenceDays : [];
      const startDate = newRecurrenceType === 'monthly' && !newStartDate
        ? buildMonthlyStartDate(newMonthlyType, newMonthDay, newWeekday, newRecurrenceWeekOfMonth)
        : newStartDate;
      const chore = await client.createChore({
        householdId,
        title: newTitle.trim(),
        assignedTo: newAssignedToMany[0] ?? null,
        assignedToMany: newAssignedToMany,
        rotation: newAssignedToMany.length >= 2 ? newRotation : false,
        days,
        startDate,
        endDate: newEndDate,
        recurrenceType: newRecurrenceType,
        recurrenceWeeks: newRecurrenceWeeks,
        monthlyType: newMonthlyType,
        recurrenceWeekOfMonth: newRecurrenceType === 'monthly' && newMonthlyType === 'weekday_of_month' ? newRecurrenceWeekOfMonth : null,
      });
      setChores(prev => prev.some(c => c.id === chore.id) ? prev : [...prev, { ...chore, completions: [] }]);
      setShowCreate(false);
      showToast('Syssla skapad');
      resetCreateForm();
    } catch (e) {
      showError(e, 'Kunde inte skapa syssla');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(chore: ChoreWithCompletion) {
    setEditingChore(chore);
    setEditTitle(chore.title);
    // Initiera från assignedToMany; fall tillbaka till legacy single assignedTo.
    setEditAssignedToMany(chore.assignedToMany?.length ? chore.assignedToMany : (chore.assignedTo ? [chore.assignedTo] : []));
    setEditRotation(!!chore.rotation);
    // Legacy fallback: derive recurrenceType from old `frequency` if backend didn't fill it.
    const rt: RecurrenceType = chore.recurrenceType
      ?? (chore.frequency === 'once' ? 'none'
        : chore.frequency === 'daily' ? 'daily'
        : chore.frequency === 'monthly' ? 'monthly'
        : 'weekly');
    setEditRecurrenceType(rt);
    setEditRecurrenceWeeks(chore.recurrenceWeeks ?? (chore.frequency === 'biweekly' ? 2 : 1));
    setEditRecurrenceDays([...chore.days]);
    setEditMonthlyType((chore.monthlyType as 'day_of_month' | 'weekday_of_month') ?? 'day_of_month');
    setEditRecurrenceWeekOfMonth(chore.recurrenceWeekOfMonth ?? 1);
    setEditStartDate(chore.startDate ?? null);
    setEditEndDate(chore.endDate ?? null);
    const derived = deriveMonthlyFromStartDate(chore.startDate ?? null);
    setEditMonthDay(derived.dayOfMonth);
    setEditWeekday(derived.weekday);
  }

  async function saveEdit() {
    if (!editingChore || !editTitle.trim()) return;
    setSaving(true);
    try {
      const days = editRecurrenceType === 'weekly' ? editRecurrenceDays : [];
      const startDate = editRecurrenceType === 'monthly'
        ? buildMonthlyStartDate(editMonthlyType, editMonthDay, editWeekday, editRecurrenceWeekOfMonth)
        : editStartDate;
      const updated = await client.updateChore(editingChore.id, {
        title: editTitle.trim(),
        assignedTo: editAssignedToMany[0] ?? null,
        assignedToMany: editAssignedToMany,
        rotation: editAssignedToMany.length >= 2 ? editRotation : false,
        days,
        startDate,
        endDate: editEndDate,
        recurrenceType: editRecurrenceType,
        recurrenceWeeks: editRecurrenceWeeks,
        monthlyType: editMonthlyType,
        recurrenceWeekOfMonth: editRecurrenceType === 'monthly' && editMonthlyType === 'weekday_of_month' ? editRecurrenceWeekOfMonth : null,
      });
      setChores(prev => prev.map(c => c.id === editingChore.id ? { ...c, ...updated } : c));
      setEditingChore(null);
      showToast('Syssla sparad');
    } catch (e) {
      showError(e, 'Kunde inte spara ändringarna');
    } finally {
      setSaving(false);
    }
  }

  async function deleteChore(choreId: string, title: string) {
    confirm({
      title: 'Ta bort syssla',
      message: `Ta bort "${title}"?`,
      buttons: [
      {
        label: 'Ta bort',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.deleteChore(choreId);
            setChores(prev => prev.filter(c => c.id !== choreId));
            setEditingChore(null);
          } catch (e) {
            showError(e, 'Kunde inte ta bort sysslan');
          }
        },
      },
      { label: 'Avbryt', style: 'cancel' },
      ],
    });
  }

  async function completeChore(chore: ChoreWithCompletion, performedByMemberId: string | null = null) {
    const fakeId = '__opt__';
    const fake: ChoreCompletion = { id: fakeId, choreId: chore.id, completedBy: '', performedByMemberId, completedAt: new Date().toISOString(), note: null, day: null, date: null };
    setChores(cs => cs.map(c => c.id === chore.id ? { ...c, completions: [fake, ...c.completions] } : c));
    try {
      const completion = await client.completeChore(chore.id, null, undefined, null, performedByMemberId);
      setChores(cs => cs.map(c => c.id === chore.id
        ? { ...c, completions: c.completions.map(comp => comp.id === fakeId ? completion : comp) }
        : c));
    } catch (e) {
      setChores(cs => cs.map(c => c.id === chore.id
        ? { ...c, completions: c.completions.filter(comp => comp.id !== fakeId) }
        : c));
      showError(e, 'Kunde inte markera sysslan');
    }
  }

  // Performer-picker — frågar vem som faktiskt utförde sysslan när det inte
  // är entydigt:
  //  - rotation=true + 2+ tilldelade → fråga alltid, defaulta på turperson
  //  - 2+ tilldelade utan rotation där minst en är lokal profil → fråga
  //  - 1 tilldelad lokal profil → fråga (gamla beteendet)
  //  - 1 tilldelad Clerk-user eller ingen tilldelad → skippa, kreditera tapparen
  function pickPerformer(chore: ChoreWithCompletion, onPick: (performedByMemberId: string | null) => void) {
    const assignedIds = chore.assignedToMany?.length ? chore.assignedToMany : (chore.assignedTo ? [chore.assignedTo] : []);
    const assignedMembers = assignedIds.map(id => members.find(m => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
    const hasLocalProfile = assignedMembers.some(m => m.clerkUserId === null);
    const isRotating = !!chore.rotation && assignedMembers.length >= 2;

    // Skip-fall: ingen tilldelad ELLER en enskild Clerk-user (utan rotation).
    if (assignedMembers.length === 0) { onPick(null); return; }
    if (!isRotating && !hasLocalProfile && assignedMembers.length === 1) { onPick(null); return; }

    const selfMember = userId ? members.find(m => m.clerkUserId === userId) : null;
    const turnId = isRotating
      ? computeCurrentTurn({ rotation: true, assignedToMany: assignedIds }, chore.completions.length)
      : null;

    // Bygg knappar: turperson överst (vid rotation), sen övriga tilldelade,
    // sen "jag" om jag inte redan är med, sen avbryt.
    const seen = new Set<string>();
    const buttons: Parameters<typeof confirm>[0]['buttons'] = [];
    const pushMember = (id: string, suffix = '') => {
      if (seen.has(id)) return;
      seen.add(id);
      const m = members.find(x => x.id === id);
      if (!m) return;
      buttons.push({ label: m.displayName + suffix, onPress: () => onPick(m.id) });
    };
    if (turnId) pushMember(turnId, ' (tur)');
    for (const m of assignedMembers) pushMember(m.id);
    if (selfMember) pushMember(selfMember.id, ' (du)');
    buttons.push({ label: 'Avbryt', style: 'cancel' });
    confirm({ title: `Vem gjorde "${chore.title}"?`, buttons });
  }

  // Forgiving model: complete/uncomplete a specific occurrence date.
  async function completeOccurrence(chore: ChoreWithCompletion, date: string, performedByMemberId: string | null = null) {
    const fakeId = '__occ__' + date;
    const fake: ChoreCompletion = { id: fakeId, choreId: chore.id, completedBy: '', performedByMemberId, completedAt: new Date().toISOString(), note: null, day: null, date };
    setChores(cs => cs.map(c => c.id === chore.id ? { ...c, completions: [fake, ...c.completions] } : c));
    try {
      const completion = await client.completeChore(chore.id, null, undefined, date, performedByMemberId);
      setChores(cs => cs.map(c => c.id === chore.id
        ? { ...c, completions: c.completions.map(comp => comp.id === fakeId ? completion : comp) }
        : c));
    } catch (e) {
      setChores(cs => cs.map(c => c.id === chore.id
        ? { ...c, completions: c.completions.filter(comp => comp.id !== fakeId) }
        : c));
      showError(e, 'Kunde inte markera sysslan');
    }
  }

  async function uncompleteOccurrence(chore: ChoreWithCompletion, date: string) {
    const saved = chore.completions;
    setChores(cs => cs.map(c => c.id === chore.id
      ? { ...c, completions: c.completions.filter(comp => completionDate(comp) !== date) }
      : c));
    try {
      await client.uncompleteChore(chore.id, undefined, date);
    } catch (e) {
      setChores(cs => cs.map(c => c.id === chore.id ? { ...c, completions: saved } : c));
      showError(e, 'Kunde inte ångra');
    }
  }

  async function uncompleteChore(chore: ChoreWithCompletion) {
    const saved = chore.completions;
    setChores(cs => cs.map(c => c.id === chore.id
      ? { ...c, completions: c.completions.filter(comp => comp.day !== null) }
      : c));
    try {
      await client.uncompleteChore(chore.id);
    } catch (e) {
      setChores(cs => cs.map(c => c.id === chore.id ? { ...c, completions: saved } : c));
      showError(e, 'Kunde inte avmarkera sysslan');
    }
  }

  async function clearCompleted() {
    if (completedOnce.length === 0) return;
    confirm({
      title: 'Rensa klara sysslor',
      message: `Ta bort ${completedOnce.length} avklarade engångssyssla${completedOnce.length > 1 ? 'r' : ''}?`,
      buttons: [
        {
          label: 'Rensa', style: 'destructive',
          onPress: async () => {
            await Promise.all(completedOnce.map(c => client.deleteChore(c.id).catch(() => {})));
            setChores(prev => prev.filter(c => !completedOnce.find(d => d.id === c.id)));
          },
        },
        { label: 'Avbryt', style: 'cancel' },
      ],
    });
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader
        title="Sysslor"
        actionNode={
          <View style={s.headerActions}>
            {completedOnce.length > 0 && (
              <Pressable style={s.clearBtn} onPress={clearCompleted}>
                <Ionicons name="trash-outline" size={14} color="#ef4444" />
                <Text style={s.clearBtnText}>Rensa klara ({completedOnce.length})</Text>
              </Pressable>
            )}
            {members.length > 0 && (
              <Pressable ref={filterBtnRef} style={[s.filterBtn, filterMemberIds.length > 0 && s.filterBtnActive]} onPress={() => setShowFilterModal(true)}>
                <Ionicons name="person-outline" size={14} color={filterMemberIds.length > 0 ? '#7c3aed' : '#6b7280'} />
                <Text style={[s.filterBtnText, filterMemberIds.length > 0 && s.filterBtnTextActive]}>Filter</Text>
                {filterMemberIds.length > 0 && (
                  <View style={s.filterBadge}>
                    <Text style={s.filterBadgeText}>{filterMemberIds.length}</Text>
                  </View>
                )}
              </Pressable>
            )}
            {chores.some(c => c.rotation && c.assignedToMany?.length >= 2) && (
              <Pressable
                style={[s.filterBtn, myTurnOnly && s.filterBtnActive]}
                onPress={() => setMyTurnOnly(v => !v)}
                accessibilityRole="switch"
                accessibilityState={{ checked: myTurnOnly }}
              >
                <Ionicons name="person-circle-outline" size={14} color={myTurnOnly ? '#7c3aed' : '#6b7280'} />
                <Text style={[s.filterBtnText, myTurnOnly && s.filterBtnTextActive]}>Min tur</Text>
              </Pressable>
            )}
          </View>
        }
      />

      <FlatList
        data={sortedChores}
        keyExtractor={item => item.id}
        contentContainerStyle={[s.list, sortedChores.length === 0 && s.listEmpty]}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          <EmptyState
            icon="checkmark-circle-outline"
            title="Inga sysslor än"
            subtitle="Lägg till en syssla så syns den här och i kalendern."
            actionLabel="Ny syssla"
            onAction={openCreate}
          />
        }
        renderItem={({ item }) => {
          const once = isOnce(item);
          const rec = once ? null : recurringStatus(item);
          const done = once ? isFullyDone(item) : rec!.state === 'done';
          // A recurring chore is never "finished" — it returns — so don't give it
          // the greyed/strikethrough look; only one-off chores get that.
          const finishedLook = once && done;
          const overdue = rec?.state === 'overdue';
          const assignedLabel = buildAssignedLabel(item);
          const expanded = expandedChores.has(item.id);
          // Kompakt rad: "vem · när". Resten (frekvens, dagar, fullständig
          // status) bor i utfällt läge.
          // När en återkommande syssla just klarmarkerats vill vi visa nästa
          // datum direkt — boxen ska kännas "klar och vidare", inte fastlåst.
          const dateLabel = once
            ? (item.completions[0] ? daysSince(item.completions[0].completedAt) : null)
            : (rec?.state === 'overdue' ? `förfallen ${rec.overdueDays} ${rec.overdueDays === 1 ? 'dag' : 'dagar'}`
              : rec?.state === 'done' && rec.nextDate ? `nästa ${formatOcc(rec.nextDate)}`
              : rec?.state === 'today' ? 'idag'
              : rec?.current ? formatOcc(rec.current.date)
              : rec?.nextDate ? `nästa ${formatOcc(rec.nextDate)}`
              : null);
          const compactMeta = [assignedLabel, dateLabel].filter(Boolean).join(' · ');
          const expandedMetaParts: (string | null)[] = [
            FREQ_LABELS[item.frequency],
            item.frequency !== 'daily' && item.days.length > 0
              ? item.days.map(d => DAYS.find(x => x.key === d)?.short).join(', ')
              : null,
          ];
          const expandedStatusText = rec
            ? (rec.state === 'overdue' ? `Förfallen sedan ${rec.overdueDays} ${rec.overdueDays === 1 ? 'dag' : 'dagar'}`
              : rec.state === 'today' ? 'Att göra idag'
              : rec.state === 'done' ? (rec.nextDate ? `Klar · nästa ${formatOcc(rec.nextDate)}` : 'Klar') : null)
            : null;
          const showCheck = once || !!rec?.current;
          // För återkommande: visa boxen tom även när tillfället är klart
          // — det signalerar att man är "vidare till nästa", men trycket
          // är fortfarande aktivt så man kan ångra (uncompleteOccurrence).
          const checkVisualDone = once ? done : false;
          const toggleExpand = wrapExpandTip(
            () => setExpandedChores(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; }),
            {
              title: 'Detaljer per syssla',
              message: 'Här ser du frekvens, full status och historik (klara/missade tillfällen). Härifrån når du också Redigera och Ta bort.',
            },
          );
          return (
            <View style={s.cardWrap}>
              <Pressable
                style={[s.card, { padding: sp(14), gap: sp(12) }, finishedLook && s.cardDone, overdue && s.cardOverdue]}
                onPress={toggleExpand}
              >
                <View style={s.cardIcon}>
                  <Ionicons name="sparkles-outline" size={fs(16)} color="#7c3aed" />
                </View>
                <View style={s.cardContent}>
                  <Text style={[s.cardTitle, { fontSize: fs(16) }, finishedLook && s.cardTitleDone]}>{item.title}</Text>
                  {compactMeta.length > 0 && (
                    <Text style={[s.cardMeta, { fontSize: fs(12) }, overdue && s.choreStatusOverdue]}>{compactMeta}</Text>
                  )}
                </View>
                <Pressable
                  onPress={toggleExpand}
                  hitSlop={8}
                  style={s.expandBtn}
                  accessibilityRole="button"
                  accessibilityLabel={expanded ? 'Dölj detaljer' : 'Visa detaljer'}
                >
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={fs(18)} color="#9ca3af" />
                </Pressable>
                {showCheck && (
                  <Pressable
                    style={[s.checkBtn, { width: sp(36), height: sp(36), borderRadius: sp(18) }, checkVisualDone && s.checkBtnDone]}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      if (once) {
                        if (done) uncompleteChore(item);
                        else pickPerformer(item, performer => completeChore(item, performer));
                      } else {
                        const cur = rec!.current!;
                        if (cur.done) uncompleteOccurrence(item, cur.date);
                        else pickPerformer(item, performer => completeOccurrence(item, cur.date, performer));
                      }
                    }}
                  >
                    {checkVisualDone && <Ionicons name="checkmark" size={fs(20)} color="#fff" />}
                  </Pressable>
                )}
              </Pressable>
              {expanded && (
                <View style={s.historyBox}>
                  {(expandedMetaParts.filter(Boolean).length > 0 || expandedStatusText) && (
                    <View style={s.expandedHeader}>
                      {expandedMetaParts.filter(Boolean).length > 0 && (
                        <Text style={[s.expandedMeta, { fontSize: fs(12) }]}>
                          {expandedMetaParts.filter(Boolean).join(' · ')}
                        </Text>
                      )}
                      {expandedStatusText && (
                        <Text style={[s.choreStatus, { fontSize: fs(12) }, overdue && s.choreStatusOverdue, rec?.state === 'done' && s.choreStatusDone]}>
                          {expandedStatusText}
                        </Text>
                      )}
                    </View>
                  )}
                  {rec && (rec.occurrences.length === 0 ? (
                    <Text style={s.historyEmpty}>Inga tillfällen den senaste tiden</Text>
                  ) : (() => {
                    // För rotation: vems tur vid varje historisk occurrence.
                    // Helper:n i shared räknar likadant både här och i tester.
                    const isRotating = !!item.rotation && (item.assignedToMany?.length ?? 0) >= 2;
                    const turnByDate = isRotating
                      ? computeTurnHistory({ rotation: true, assignedToMany: item.assignedToMany }, rec.occurrences)
                      : new Map<string, string>();
                    return [...rec.occurrences].reverse().slice(0, 8).map(o => {
                      const performerName = o.performedByMemberId
                        ? (members.find(m => m.id === o.performedByMemberId)?.displayName ?? null)
                        : memberNameByClerkId(o.completedBy);
                      const turnId = turnByDate.get(o.date);
                      const turnName = turnId ? (members.find(m => m.id === turnId)?.displayName ?? null) : null;
                      const isHopIn = o.done && turnName && performerName && performerName !== turnName;
                      return (
                      <View key={o.date} style={s.historyRow}>
                        <Ionicons
                          name={o.done ? 'checkmark-circle' : o.isCurrent ? 'ellipse-outline' : 'close-circle-outline'}
                          size={fs(15)}
                          color={o.done ? '#10b981' : o.isCurrent ? '#7c3aed' : '#d1d5db'}
                        />
                        <Text style={[s.historyDate, { fontSize: fs(13) }, !o.done && !o.isCurrent && s.historyMissed]}>
                          {formatOcc(o.date)}{o.done
                            ? (isHopIn
                              ? ` · ${performerName} (hoppade in för ${turnName})`
                              : performerName
                                ? ` · ${performerName}`
                                : '')
                            : o.isCurrent
                              ? (turnName ? ` · ${turnName}s tur` : ' · att göra')
                              : (turnName ? ` · ${turnName} missade` : ' · missad')}
                        </Text>
                      </View>
                      );
                    });
                  })())}
                  <View style={s.expandedActions}>
                    <Pressable style={s.expandedActionBtn} onPress={() => openEdit(item)}>
                      <Ionicons name="create-outline" size={fs(16)} color="#4f46e5" />
                      <Text style={[s.expandedActionText, { fontSize: fs(13) }]}>Redigera</Text>
                    </Pressable>
                    <Pressable style={s.expandedActionBtn} onPress={() => deleteChore(item.id, item.title)}>
                      <Ionicons name="trash-outline" size={fs(16)} color="#ef4444" />
                      <Text style={[s.expandedActionText, { fontSize: fs(13), color: '#ef4444' }]}>Ta bort</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        }}
      />

      <Pressable style={[s.fab, { width: sp(56), height: sp(56), borderRadius: sp(28) }]} onPress={openCreate}>
        <Ionicons name="add" size={fs(30)} color="#fff" />
      </Pressable>

      <Animated.View style={[s.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={s.toastText}>{toastMessage}</Text>
      </Animated.View>

      <Modal visible={showFilterModal} transparent animationType="fade" onRequestClose={() => setShowFilterModal(false)}>
        <Pressable style={s.overlay} onPress={() => setShowFilterModal(false)} />
        <View style={s.filterSheet}>
          <View style={s.sheetHandle} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={s.sheetTitle}>Filtrera på person</Text>
            {filterMemberIds.length > 0 && (
              <Pressable onPress={() => setFilterMemberIds([])} hitSlop={8}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#7c3aed' }}>Rensa</Text>
              </Pressable>
            )}
          </View>
          <Pressable
            style={s.filterMemberRow}
            onPress={() => setFilterMemberIds([])}
          >
            <Text style={[s.filterMemberName, filterMemberIds.length === 0 && s.filterMemberNameActive]}>Alla</Text>
            <Ionicons
              name={filterMemberIds.length === 0 ? 'checkbox' : 'square-outline'}
              size={22}
              color={filterMemberIds.length === 0 ? '#7c3aed' : '#d1d5db'}
            />
          </Pressable>
          {members.map(m => {
            const active = filterMemberIds.includes(m.id);
            return (
              <Pressable
                key={m.id}
                style={s.filterMemberRow}
                onPress={() => setFilterMemberIds(prev =>
                  active ? prev.filter(id => id !== m.id) : [...prev, m.id]
                )}
              >
                <Text style={[s.filterMemberName, active && s.filterMemberNameActive]}>{m.displayName}</Text>
                <Ionicons
                  name={active ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={active ? '#7c3aed' : '#d1d5db'}
                />
              </Pressable>
            );
          })}
        </View>
      </Modal>

      {/* Create modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={s.overlay} onPress={() => setShowCreate(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Ny syssla</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetScroll}>
            <TextInput
              style={s.input}
              placeholder="Sysslans namn, t.ex. Damma"
              placeholderTextColor="#9ca3af"
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
              returnKeyType="done"
            />

            <MultiMemberPicker
              members={members}
              selected={newAssignedToMany}
              rotation={newRotation}
              onChange={setNewAssignedToMany}
              onRotationChange={setNewRotation}
            />

            {newRecurrenceType === 'none' && (
              <>
                <Text style={s.label}>Datum (valfritt)</Text>
                <Pressable style={[s.dateBtn, newStartDate && s.dateBtnSet]} onPress={() => setShowNewStartPicker(true)}>
                  <Ionicons name="calendar-outline" size={14} color={newStartDate ? '#4f46e5' : '#9ca3af'} />
                  <Text style={[s.dateBtnText, newStartDate && s.dateBtnTextSet]}>{newStartDate ?? 'Välj datum'}</Text>
                </Pressable>
              </>
            )}

            <RecurrencePicker
              recurrenceType={newRecurrenceType}
              recurrenceWeeks={newRecurrenceWeeks}
              recurrenceDays={newRecurrenceDays}
              monthlyType={newMonthlyType}
              recurrenceWeekOfMonth={newRecurrenceWeekOfMonth}
              endDate={newEndDate}
              dayOfMonth={newMonthDay}
              onChangeDayOfMonth={setNewMonthDay}
              weekday={newWeekday}
              onChangeWeekday={setNewWeekday}
              onChangeType={setNewRecurrenceType}
              onChangeWeeks={setNewRecurrenceWeeks}
              onChangeDays={setNewRecurrenceDays}
              onChangeMonthlyType={setNewMonthlyType}
              onChangeWeekOfMonth={setNewRecurrenceWeekOfMonth}
              onChangeEndDate={setNewEndDate}
              onOpenEndPicker={() => setShowNewEndPicker(true)}
            />

            {newRecurrenceType !== 'none' && (
              <>
                <Text style={s.label}>Startdatum (valfritt)</Text>
                <Pressable style={[s.dateBtn, newStartDate && s.dateBtnSet]} onPress={() => setShowNewStartPicker(true)}>
                  <Ionicons name="calendar-outline" size={14} color={newStartDate ? '#4f46e5' : '#9ca3af'} />
                  <Text style={[s.dateBtnText, newStartDate && s.dateBtnTextSet]}>{newStartDate ?? 'Välj startdatum'}</Text>
                </Pressable>
              </>
            )}

            <Pressable
              style={[s.button, !newTitle.trim() && s.buttonDisabled]}
              onPress={createChore}
              disabled={creating || !newTitle.trim()}
            >
              {creating
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.buttonText}>Lägg till syssla</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <DatePickerModal value={newStartDate} onChange={setNewStartDate} onClose={() => setShowNewStartPicker(false)} title="Startdatum" visible={showNewStartPicker} />
      <DatePickerModal value={newEndDate} onChange={setNewEndDate} onClose={() => setShowNewEndPicker(false)} title="Slutdatum" visible={showNewEndPicker} />
      <DatePickerModal value={editStartDate} onChange={setEditStartDate} onClose={() => setShowEditStartPicker(false)} title="Startdatum" visible={showEditStartPicker} />
      <DatePickerModal value={editEndDate} onChange={setEditEndDate} onClose={() => setShowEditEndPicker(false)} title="Slutdatum" visible={showEditEndPicker} />

      {/* Edit modal */}
      <Modal visible={!!editingChore} transparent animationType="slide" onRequestClose={() => setEditingChore(null)}>
        <Pressable style={s.overlay} onPress={() => setEditingChore(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Redigera syssla</Text>
          <ConflictBanner
            message={choreConflict?.msg ?? null}
            onShowLatest={choreConflict ? () => { openEdit(choreConflict.latest); setChoreConflict(null); } : undefined}
          />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetScroll}>
            <TextInput
              style={s.input}
              placeholder="Sysslans namn"
              placeholderTextColor="#9ca3af"
              value={editTitle}
              onChangeText={setEditTitle}
              returnKeyType="done"
            />

            <MultiMemberPicker
              members={members}
              selected={editAssignedToMany}
              rotation={editRotation}
              onChange={setEditAssignedToMany}
              onRotationChange={setEditRotation}
            />

            {editRecurrenceType === 'none' && (
              <>
                <Text style={s.label}>Datum (valfritt)</Text>
                <Pressable style={[s.dateBtn, editStartDate && s.dateBtnSet]} onPress={() => setShowEditStartPicker(true)}>
                  <Ionicons name="calendar-outline" size={14} color={editStartDate ? '#4f46e5' : '#9ca3af'} />
                  <Text style={[s.dateBtnText, editStartDate && s.dateBtnTextSet]}>{editStartDate ?? 'Välj datum'}</Text>
                </Pressable>
              </>
            )}

            <RecurrencePicker
              recurrenceType={editRecurrenceType}
              recurrenceWeeks={editRecurrenceWeeks}
              recurrenceDays={editRecurrenceDays}
              monthlyType={editMonthlyType}
              recurrenceWeekOfMonth={editRecurrenceWeekOfMonth}
              endDate={editEndDate}
              dayOfMonth={editMonthDay}
              onChangeDayOfMonth={setEditMonthDay}
              weekday={editWeekday}
              onChangeWeekday={setEditWeekday}
              onChangeType={setEditRecurrenceType}
              onChangeWeeks={setEditRecurrenceWeeks}
              onChangeDays={setEditRecurrenceDays}
              onChangeMonthlyType={setEditMonthlyType}
              onChangeWeekOfMonth={setEditRecurrenceWeekOfMonth}
              onChangeEndDate={setEditEndDate}
              onOpenEndPicker={() => setShowEditEndPicker(true)}
            />

            {editRecurrenceType !== 'none' && (
              <>
                <Text style={s.label}>Startdatum (valfritt)</Text>
                <Pressable style={[s.dateBtn, editStartDate && s.dateBtnSet]} onPress={() => setShowEditStartPicker(true)}>
                  <Ionicons name="calendar-outline" size={14} color={editStartDate ? '#4f46e5' : '#9ca3af'} />
                  <Text style={[s.dateBtnText, editStartDate && s.dateBtnTextSet]}>{editStartDate ?? 'Välj startdatum'}</Text>
                </Pressable>
              </>
            )}

            <Pressable
              style={[s.button, !editTitle.trim() && s.buttonDisabled]}
              onPress={saveEdit}
              disabled={saving || !editTitle.trim()}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.buttonText}>Spara ändringar</Text>}
            </Pressable>

            <Pressable
              style={s.deleteBtn}
              onPress={() => editingChore && deleteChore(editingChore.id, editingChore.title)}
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={s.deleteBtnText}>Ta bort syssla</Text>
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff5f5' },
  clearBtnText: { fontSize: 12, color: '#ef4444', fontWeight: '500' },
  list: { padding: 16, gap: 10 },
  listEmpty: { flex: 1 },
  cardWrap: { position: 'relative' },
  cardDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: '#fff', borderRadius: 11 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', paddingHorizontal: 32, paddingVertical: 14, backgroundColor: '#111827', borderRadius: 24, zIndex: 20 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#c4b5fd', padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardDone: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' },
  cardIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardTitleDone: { textDecorationLine: 'line-through', color: '#9ca3af' },
  cardMeta: { fontSize: 12, color: '#6b7280', marginTop: 4, flexWrap: 'wrap' },
  cardOverdue: { borderLeftColor: '#f59e0b' },
  choreStatus: { fontSize: 12, fontWeight: '600', marginTop: 3, color: '#6b7280' },
  choreStatusOverdue: { color: '#b45309' },
  choreStatusDone: { color: '#10b981' },
  expandBtn: { padding: 4, flexShrink: 0 },
  historyBox: { backgroundColor: '#fafafa', borderRadius: 12, marginTop: 6, marginHorizontal: 4, paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderWidth: 1, borderColor: '#f3f4f6' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyDate: { fontSize: 13, color: '#374151', flex: 1 },
  historyMissed: { color: '#9ca3af' },
  historyEmpty: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },
  expandedHeader: { gap: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', marginBottom: 4 },
  expandedMeta: { fontSize: 12, color: '#6b7280' },
  expandedActions: { flexDirection: 'row', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  expandedActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f9fafb' },
  expandedActionText: { fontSize: 13, fontWeight: '600', color: '#4f46e5' },
  historyDoBtn: { backgroundColor: '#7c3aed', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  historyDoBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  checkBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#d1d5db', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkBtnDone: { backgroundColor: '#10b981', borderColor: '#10b981' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 0, maxHeight: '92%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  sheetScroll: { gap: 14, paddingBottom: 40 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 16, backgroundColor: '#f9fafb' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqRowNoWrap: { flexDirection: 'row', gap: 8 },
  freqOption: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', flexShrink: 0, overflow: 'visible' },
  freqOptionActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  freqOptionText: { fontSize: 13, color: '#6b7280' },
  freqOptionTextActive: { color: '#4f46e5', fontWeight: '600' },
  freqChevron: { fontSize: 9 },
  memberChipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  memberChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', flexShrink: 0 },
  memberChipActive: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  memberChipText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  memberChipTextActive: { color: '#7c3aed', fontWeight: '600' },
  rotationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, marginTop: 8 },
  rotationBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  rotationBoxActive: { borderColor: '#7c3aed', backgroundColor: '#7c3aed' },
  rotationLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rotationSub: { fontSize: 12, color: '#6b7280', marginTop: 2, lineHeight: 17 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  dayOptionActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  dayOptionText: { fontSize: 12, color: '#6b7280' },
  dayOptionTextActive: { color: '#4f46e5', fontWeight: '600' },
  button: { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  toast: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#34d399', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  deleteBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '500' },
  dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  dateBtnSet: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  dateBtnText: { fontSize: 13, color: '#9ca3af', flex: 1 },
  dateBtnTextSet: { color: '#4f46e5', fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  filterBtnActive: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  filterBtnText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  filterBtnTextActive: { color: '#7c3aed', fontWeight: '600' },
  filterBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  filterSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 32 },
  filterMemberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  filterMemberName: { fontSize: 16, color: '#374151', flex: 1, marginRight: 12 },
  filterMemberNameActive: { color: '#7c3aed', fontWeight: '600' },
});
