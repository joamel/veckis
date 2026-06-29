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
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, ApiError } from '../../src/api/client';
import { enqueueChoreOp, getPendingChoreOps, clearChoreOp } from '../../src/lib/choreOfflineQueue';
import { RecurrencePicker } from '../../src/components/RecurrencePicker';
import { MultiMemberPicker } from '../../src/components/MultiMemberPicker';
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
import { useTablet } from '../../src/hooks/useTablet';
import { useDiscardDraft } from '../../src/hooks/useDiscardDraft';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState } from '../../src/components/EmptyState';
import { buildAssignedLabel } from '../../src/lib/buildAssignedLabel';
import { buildPerformerOptions } from '../../src/lib/performerOptions';
import { ConflictBanner } from '../../src/components/ConflictBanner';
import type { Chore, ChoreCompletion, ChoreFrequency, RecurrenceType, WeekDay } from '@veckis/shared';
import { occursOn, weekdayOf, computeTurnHistory, type RecurrencePattern } from '@veckis/shared';
import { kavBehavior } from '../../src/lib/platform';
import { chores as str, components as cmpStr, common } from '../../src/lib/strings';

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

function choreSummary(c: ChoreWithCompletion): string {
  const rt = c.recurrenceType;
  const dayNames = c.days.map(d => DAYS.find(x => x.key === d)?.short).filter(Boolean).join(', ');
  if (rt === 'none') return 'En gång';
  if (rt === 'daily') return 'Varje dag';
  if (rt === 'weekly' || rt === 'custom_days') {
    const weeks = c.recurrenceWeeks ?? 1;
    const prefix = weeks === 1 ? 'Varje vecka' : `Var ${weeks}:e vecka`;
    return dayNames ? `${prefix} · ${dayNames}` : prefix;
  }
  if (rt === 'monthly') {
    if (c.monthlyType === 'day_of_month') {
      const day = c.startDate ? parseInt(c.startDate.split('-')[2], 10) : null;
      return day ? `Den ${day}:e varje månad` : 'Varje månad';
    }
    const weekNo = c.recurrenceWeekOfMonth;
    const weekDay = c.days[0] ? DAYS.find(x => x.key === c.days[0])?.short?.toLowerCase() : null;
    const ordinals = ['1:a', '2:a', '3:e', '4:e', '5:e'];
    if (weekNo && weekDay) return `${ordinals[weekNo - 1]} ${weekDay} varje månad`;
    return 'Varje månad';
  }
  if (rt === 'yearly') return 'En gång per år';
  return FREQ_LABELS[c.frequency];
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
  completedBy: string | null;
  performedByMemberId: string | null;
  note: string | null;
}
interface RecurringStatus {
  occurrences: ChoreOccurrence[]; // ascending, recent window
  current: ChoreOccurrence | null; // latest occurrence on/before today
  nextDate: string | null; // first occurrence strictly after today
  state: 'done' | 'today' | 'overdue' | 'none';
  overdueDays: number;
  completedDate: string | null; // the occurrence date that actually carries the 'done' completion
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
        note: comp?.note ?? null,
      });
    }
  }
  let current: ChoreOccurrence | null = null;
  for (let i = occurrences.length - 1; i >= 0; i--) {
    if (occurrences[i].date <= todayStr) { occurrences[i].isCurrent = true; current = occurrences[i]; break; }
  }
  let nextDate: string | null = null;
  for (let i = 1; i <= 400; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (occursOn(pattern, d)) {
      const ds = isoDateStr(d);
      // Skip future dates already pre-completed so the upcoming card advances.
      if (!completionByDate.has(ds)) { nextDate = ds; break; }
    }
  }
  let state: RecurringStatus['state'] = 'none';
  let overdueDays = 0;
  let completedDate: string | null = null;
  if (current) {
    if (current.done) {
      state = 'done';
      completedDate = current.date;
    } else if (current.date === todayStr) {
      state = 'today';
    } else {
      // Past occurrence is undone — but if the very next occurrence is already
      // pre-completed (user checked off early), treat the cycle as done.
      const curBase = new Date(current.date + 'T00:00:00');
      let nextAfterCurrent: string | null = null;
      for (let i = 1; i <= 400; i++) {
        const d = new Date(curBase.getFullYear(), curBase.getMonth(), curBase.getDate() + i);
        if (occursOn(pattern, d)) { nextAfterCurrent = isoDateStr(d); break; }
      }
      if (nextAfterCurrent && completionByDate.has(nextAfterCurrent)) {
        state = 'done';
        completedDate = nextAfterCurrent;
      } else {
        state = 'overdue';
        const cd = new Date(current.date + 'T00:00:00').getTime();
        const t0 = new Date(todayStr + 'T00:00:00').getTime();
        overdueDays = Math.round((t0 - cd) / 86400000);
      }
    }
  }
  return { occurrences, current, nextDate, state, overdueDays, completedDate };
}

type Member = { id: string; clerkUserId: string | null; displayName: string };
// 'active' = not done; 'done' = completed (strikethrough, bottom); 'upcoming' = next occurrence of a done recurring chore
type ChoreEntry = { chore: ChoreWithCompletion; variant: 'active' | 'done' | 'upcoming' };


export default function ChoresScreen() {
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { getToken, userId } = useAuth();
  const { fs, sp, isTablet } = useTablet();
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMessage, setToastMessage] = useState('');
  const { showError } = useToast();
  const confirm = useConfirm();
  const tryCloseCreate = useDiscardDraft(confirm);
  const showTip = useSpotlightTip();
  const tipsReady = useTipsReady();
  // Historik-tipset wrap:as runt utfäll-knappens onPress — visas alltså bara
  // när användaren faktiskt fäller ut en återkommande syssla (där historiken
  // syns) istället för passivt vid fokus.
  const wrapExpandTip = useFirstActionTip('seen-forgiving-tip');
  const wrapChoreAddTip = useFirstActionTip('seen-chores-add-tip');
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

  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [showNewRecurrencePicker, setShowNewRecurrencePicker] = useState(false);
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

  // Modals
  const [editingChore, setEditingChore] = useState<ChoreWithCompletion | null>(null);
  const [viewingChore, setViewingChore] = useState<ChoreWithCompletion | null>(null);
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
  const [showNewAdvanced, setShowNewAdvanced] = useState(false);
  const [showRotationOrder, setShowRotationOrder] = useState(false);
  const [showEditAdvanced, setShowEditAdvanced] = useState(false);
  const [showEditRotationOrder, setShowEditRotationOrder] = useState(false);
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
      // Flusha offline-köade mutationer mot API:et efter att fresh data laddats.
      const pending = getPendingChoreOps();
      for (const op of pending) {
        try {
          if (op.type === 'complete') {
            await client.completeChore(op.choreId, null, op.note ?? undefined, op.date, op.performedByMemberId);
          } else {
            await client.uncompleteChore(op.choreId, null, op.date);
          }
          clearChoreOp(op.choreId, op.date);
        } catch {
          // Nätverksfel: kvar i kön till nästa load.
        }
      }
    } catch {
      confirm({ title: 'Fel', message: 'Kunde inte ladda sysslor', buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const id = deeplinkParams.choreId;
    if (!id || openedChoreParamRef.current === id) return;
    const chore = chores.find(c => c.id === id);
    if (!chore) return;
    openedChoreParamRef.current = id;
    setViewingChore(chore);
    router.setParams({ choreId: undefined });
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

  const newRecurrenceSummary = useMemo(() => {
    if (newRecurrenceType === 'none') return 'Ingen';
    const w = newRecurrenceWeeks;
    if (newRecurrenceType === 'daily') return w === 1 ? 'Varje dag' : `Var ${w}:e dag`;
    if (newRecurrenceType === 'weekly') {
      const prefix = w === 1 ? 'Varje vecka' : `Var ${w}:e vecka`;
      const names = newRecurrenceDays.map(d => DAYS.find(x => x.key === d)?.short).filter(Boolean).join(', ');
      return names ? `${prefix} · ${names}` : prefix;
    }
    if (newRecurrenceType === 'monthly') return w === 1 ? 'Varje månad' : `Var ${w}:e månad`;
    if (newRecurrenceType === 'yearly') return w === 1 ? 'Varje år' : `Var ${w}:e år`;
    return 'Ingen';
  }, [newRecurrenceType, newRecurrenceWeeks, newRecurrenceDays]);

  // Not-done chores sorted by earliest due date (most overdue first), completed
  // chores at the bottom. Done recurring chores get a split card: one 'done' entry
  // (strikethrough, at bottom) + one 'upcoming' entry (shows next date, among actives).
  const sortedChores = useMemo((): ChoreEntry[] => {
    const memberFilter = (c: ChoreWithCompletion) => {
      const ids = c.assignedToMany?.length ? c.assignedToMany : (c.assignedTo ? [c.assignedTo] : []);
      return filterMemberIds.length === 0 || ids.some(id => filterMemberIds.includes(id));
    };
    const filtered = chores.filter(memberFilter);
    const todayStr = isoDateStr(new Date());

    // Pre-compute recurring statuses once to avoid O(n²) calls during sort.
    const statuses = new Map<string, RecurringStatus>();
    for (const c of filtered) {
      if (!isOnce(c)) statuses.set(c.id, recurringStatus(c));
    }

    const doneEntries: ChoreEntry[] = [];
    const activeEntries: ChoreEntry[] = [];

    for (const chore of filtered) {
      const once = isOnce(chore);
      const rs = once ? null : statuses.get(chore.id)!;
      const isDone = once ? chore.completions.length > 0 : rs!.state === 'done';
      if (isDone) {
        doneEntries.push({ chore, variant: 'done' });
        if (!once) activeEntries.push({ chore, variant: 'upcoming' });
      } else {
        activeEntries.push({ chore, variant: 'active' });
      }
    }

    const entryDueKey = (entry: ChoreEntry): string => {
      const { chore, variant } = entry;
      if (isOnce(chore)) return todayStr;
      const rs = statuses.get(chore.id)!;
      if (variant === 'upcoming') return rs.nextDate ?? '9999-12-31';
      if (rs.current && !rs.current.done) return rs.current.date;
      return rs.nextDate ?? '9999-12-31';
    };

    activeEntries.sort((a, b) => entryDueKey(a).localeCompare(entryDueKey(b)));

    // Recurring done sorted by next date (soonest = highest priority to resurface),
    // once-done at very bottom.
    doneEntries.sort((a, b) => {
      const aOnce = isOnce(a.chore);
      const bOnce = isOnce(b.chore);
      if (aOnce && bOnce) return 0;
      if (aOnce) return 1;
      if (bOnce) return -1;
      const aNext = statuses.get(a.chore.id)?.nextDate ?? '9999-12-31';
      const bNext = statuses.get(b.chore.id)?.nextDate ?? '9999-12-31';
      return aNext.localeCompare(bNext);
    });

    return [...activeEntries, ...doneEntries];
  }, [chores, filterMemberIds]);

  const completedOnce = useMemo(
    () => chores.filter(c => isOnce(c) && c.completions.length > 0),
    [chores]
  );

  const completedRecurring = useMemo(
    () => sortedChores
      .filter(e => e.variant === 'done' && !isOnce(e.chore))
      .map(e => {
        const rs = recurringStatus(e.chore);
        return { chore: e.chore, currentDate: rs.completedDate ?? rs.current?.date ?? isoDateStr(new Date()) };
      }),
    [sortedChores]
  );


  // Etikett för "tilldelad" på syssla-kortet:
  //  - rotation=true + 2+ medlemmar → "Annas tur · Nästa: Bo"
  //  - flera utan rotation → "Anna · Bo · Carl" (kommatecken-separerad)
  //  - en medlem → "Anna"
  //  - ingen → null (visas inte)
  // Tunn wrapper kring src/lib/buildAssignedLabel — där bor logiken + tester.
  const buildLabel = (chore: ChoreWithCompletion) => buildAssignedLabel(chore, members);

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
    setShowNewAdvanced(false);
    setShowRotationOrder(false);
    setShowNewRecurrencePicker(false);
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
        rotation: (newRecurrenceType !== 'none' && newAssignedToMany.length >= 2) ? newRotation : false,
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
      showToast(str.toasts.created);
      resetCreateForm();
    } catch (e) {
      showError(e, str.toasts.errorCreate);
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
    setShowEditAdvanced(false);
    setShowEditRotationOrder(false);
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
        rotation: (editRecurrenceType !== 'none' && editAssignedToMany.length >= 2) ? editRotation : false,
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
      showToast(str.toasts.saved);
    } catch (e) {
      showError(e, str.toasts.errorSave);
    } finally {
      setSaving(false);
    }
  }

  async function deleteChore(choreId: string, title: string) {
    confirm({
      title: str.delete.title,
      message: str.delete.message(title),
      buttons: [
      {
        label: str.delete.confirm,
        style: 'destructive',
        onPress: async () => {
          try {
            await client.deleteChore(choreId);
            setChores(prev => prev.filter(c => c.id !== choreId));
            setEditingChore(null);
          } catch (e) {
            showError(e, common.errors.couldNotDelete('sysslan'));
          }
        },
      },
      { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }

  function copyChore(chore: ChoreWithCompletion) {
    const rt: RecurrenceType = chore.recurrenceType
      ?? (chore.frequency === 'once' ? 'none'
        : chore.frequency === 'daily' ? 'daily'
        : chore.frequency === 'monthly' ? 'monthly'
        : 'weekly');
    const derived = deriveMonthlyFromStartDate(chore.startDate ?? null);
    setNewTitle(chore.title);
    setNewAssignedToMany(chore.assignedToMany?.length ? chore.assignedToMany : (chore.assignedTo ? [chore.assignedTo] : []));
    setNewRotation(!!chore.rotation);
    setNewRecurrenceType(rt);
    setNewRecurrenceWeeks(chore.recurrenceWeeks ?? (chore.frequency === 'biweekly' ? 2 : 1));
    setNewRecurrenceDays([...chore.days]);
    setNewMonthlyType((chore.monthlyType as 'day_of_month' | 'weekday_of_month') ?? 'day_of_month');
    setNewRecurrenceWeekOfMonth(chore.recurrenceWeekOfMonth ?? 1);
    setNewMonthDay(derived.dayOfMonth);
    setNewWeekday(derived.weekday);
    setNewStartDate(null);
    setNewEndDate(chore.endDate ?? null);
    setShowCreate(true);
  }

  function openChoreActions(chore: ChoreWithCompletion) {
    confirm({
      variant: 'menu',
      buttons: [
        { label: 'Redigera', icon: 'create-outline', onPress: () => { setViewingChore(null); openEdit(chore); } },
        { label: 'Kopiera', icon: 'copy-outline', onPress: () => { setViewingChore(null); copyChore(chore); } },
        { label: 'Ta bort', icon: 'trash-outline', style: 'destructive', onPress: () => { setViewingChore(null); deleteChore(chore.id, chore.title); } },
        { label: 'Avbryt', style: 'cancel' },
      ],
    });
  }

  async function completeChore(chore: ChoreWithCompletion, performedByMemberId: string | null = null, note: string | null = null) {
    const fakeId = '__opt__';
    const fake: ChoreCompletion = { id: fakeId, choreId: chore.id, completedBy: '', performedByMemberId, completedAt: new Date().toISOString(), note, day: null, date: null };
    setChores(cs => cs.map(c => c.id === chore.id ? { ...c, completions: [fake, ...c.completions] } : c));
    try {
      const completion = await client.completeChore(chore.id, null, note ?? undefined, null, performedByMemberId);
      setChores(cs => cs.map(c => c.id === chore.id
        ? { ...c, completions: c.completions.map(comp => comp.id === fakeId ? completion : comp) }
        : c));
    } catch (e) {
      if (e instanceof ApiError && e.isNetworkError) {
        enqueueChoreOp({ type: 'complete', choreId: chore.id, date: null, performedByMemberId, note });
      } else {
        setChores(cs => cs.map(c => c.id === chore.id
          ? { ...c, completions: c.completions.filter(comp => comp.id !== fakeId) }
          : c));
        showError(e, str.toasts.errorComplete);
      }
    }
  }

  // Performer-picker — frågar vem som faktiskt utförde sysslan när det inte
  // är entydigt:
  //  - rotation=true + 2+ tilldelade → fråga alltid, defaulta på turperson
  //  - 2+ tilldelade utan rotation där minst en är lokal profil → fråga
  //  - 1 tilldelad lokal profil → fråga (gamla beteendet)
  //  - 1 tilldelad Clerk-user eller ingen tilldelad → skippa, kreditera tapparen
  function pickPerformer(chore: ChoreWithCompletion, onPick: (performedByMemberId: string | null) => void) {
    const choice = buildPerformerOptions(chore, members, userId);
    if (choice.kind === 'auto') { onPick(null); return; }
    const buttons: Parameters<typeof confirm>[0]['buttons'] = choice.options.map(o => ({
      label: o.label,
      onPress: () => onPick(o.id),
    }));
    buttons.push({ label: 'Avbryt', style: 'cancel' });
    confirm({ title: `Vem gjorde "${chore.title}"?`, buttons });
  }

  // Forgiving model: complete/uncomplete a specific occurrence date.
  async function completeOccurrence(chore: ChoreWithCompletion, date: string, performedByMemberId: string | null = null, note: string | null = null) {
    const fakeId = '__occ__' + date;
    const fake: ChoreCompletion = { id: fakeId, choreId: chore.id, completedBy: '', performedByMemberId, completedAt: new Date().toISOString(), note, day: null, date };
    setChores(cs => cs.map(c => c.id === chore.id ? { ...c, completions: [fake, ...c.completions] } : c));
    try {
      const completion = await client.completeChore(chore.id, null, note ?? undefined, date, performedByMemberId);
      setChores(cs => cs.map(c => c.id === chore.id
        ? { ...c, completions: c.completions.map(comp => comp.id === fakeId ? completion : comp) }
        : c));
    } catch (e) {
      if (e instanceof ApiError && e.isNetworkError) {
        enqueueChoreOp({ type: 'complete', choreId: chore.id, date, performedByMemberId, note });
      } else {
        setChores(cs => cs.map(c => c.id === chore.id
          ? { ...c, completions: c.completions.filter(comp => comp.id !== fakeId) }
          : c));
        showError(e, str.toasts.errorComplete);
      }
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
      if (e instanceof ApiError && e.isNetworkError) {
        enqueueChoreOp({ type: 'uncomplete', choreId: chore.id, date });
      } else {
        setChores(cs => cs.map(c => c.id === chore.id ? { ...c, completions: saved } : c));
        showError(e, 'Kunde inte ångra');
      }
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
      if (e instanceof ApiError && e.isNetworkError) {
        enqueueChoreOp({ type: 'uncomplete', choreId: chore.id, date: null });
      } else {
        setChores(cs => cs.map(c => c.id === chore.id ? { ...c, completions: saved } : c));
        showError(e, str.toasts.errorUncomplete);
      }
    }
  }

  async function clearCompleted() {
    if (completedOnce.length === 0 && completedRecurring.length === 0) return;
    const parts: string[] = [];
    if (completedOnce.length > 0) parts.push(str.clear.once(completedOnce.length));
    if (completedRecurring.length > 0) parts.push(str.clear.recurring(completedRecurring.length));
    confirm({
      title: str.clear.title,
      message: parts.join('\n'),
      buttons: [
        {
          label: str.clear.confirm, style: 'destructive',
          onPress: async () => {
            setChores(prev => prev.filter(c => !completedOnce.find(d => d.id === c.id)));
            await Promise.all(completedOnce.map(async c => {
              try { await client.deleteChore(c.id); }
              catch (e) {
                setChores(prev => prev.some(x => x.id === c.id) ? prev : [c, ...prev]);
                showError(e, 'Kunde inte ta bort syssla');
              }
            }));
            await Promise.all(completedRecurring.map(({ chore, currentDate }) =>
              uncompleteOccurrence(chore, currentDate)
            ));
          },
        },
        { label: common.actions.cancel, style: 'cancel' },
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
            {(completedOnce.length > 0 || completedRecurring.length > 0) && (
              <Pressable style={[s.clearBtn, { paddingHorizontal: sp(10), paddingVertical: sp(6) }]} onPress={clearCompleted}>
                <Ionicons name="trash-outline" size={fs(14)} color="#ef4444" />
                <Text style={[s.clearBtnText, { fontSize: fs(12) }]}>Rensa klara ({completedOnce.length + completedRecurring.length})</Text>
              </Pressable>
            )}
            {members.length > 0 && (
              <Pressable ref={filterBtnRef} style={[s.filterBtn, filterMemberIds.length > 0 && s.filterBtnActive, { paddingHorizontal: sp(10), paddingVertical: sp(6) }]} onPress={() => setShowFilterModal(true)}>
                <Ionicons name="person-outline" size={fs(14)} color={filterMemberIds.length > 0 ? '#7c3aed' : '#6b7280'} />
                <Text style={[s.filterBtnText, filterMemberIds.length > 0 && s.filterBtnTextActive, { fontSize: fs(12) }]}>Filter</Text>
                {filterMemberIds.length > 0 && (
                  <View style={s.filterBadge}>
                    <Text style={s.filterBadgeText}>{filterMemberIds.length}</Text>
                  </View>
                )}
              </Pressable>
            )}
          </View>
        }
      />

      <FlatList
        data={sortedChores}
        keyExtractor={entry => entry.chore.id + '-' + entry.variant}
        contentContainerStyle={[s.list, sortedChores.length === 0 && s.listEmpty]}
        numColumns={isTablet ? 2 : 1}
        key={isTablet ? '2col' : '1col'}
        columnWrapperStyle={isTablet ? s.columnWrapper : undefined}
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
        renderItem={({ item: entry }) => {
          const { chore: item, variant } = entry;
          const once = isOnce(item);
          const rec = once ? null : recurringStatus(item);
          // Both once-done and recurring-done get strikethrough look.
          const finishedLook = variant === 'done';
          const overdue = variant === 'active' && rec?.state === 'overdue';
          const assignedLabel = buildLabel(item);
          let dateLabel: string | null = null;
          if (variant === 'done') {
            dateLabel = once
              ? (item.completions[0] ? daysSince(item.completions[0].completedAt) : null)
              : (rec?.current ? `klar ${formatOcc(rec.current.date)}` : 'klar');
          } else if (variant === 'upcoming') {
            dateLabel = null;
          } else {
            // active
            dateLabel = once
              ? null
              : (rec?.state === 'overdue' ? `förfallen ${rec.overdueDays} ${rec.overdueDays === 1 ? 'dag' : 'dagar'}`
                : rec?.state === 'today' ? 'idag'
                : rec?.current ? formatOcc(rec.current.date)
                : null);
          }
          const compactMeta = [assignedLabel, dateLabel].filter(Boolean).join(' · ');
          const showCheck = once || !!rec?.current || !!rec?.nextDate;
          const checkVisualDone = variant === 'done';
          const openView = wrapExpandTip(
            () => setViewingChore(item),
            {
              title: 'Detaljer per syssla',
              message: 'Här ser du frekvens, full status och historik (klara/missade tillfällen). Härifrån når du också Redigera och Ta bort.',
            },
          );
          return (
            <View style={[s.cardWrap, isTablet && s.cardWrapTablet]}>
              <View style={[s.card, finishedLook && s.cardDone, overdue && s.cardOverdue, variant === 'upcoming' && s.cardUpcoming]}>
              <View style={s.cardInner}>
              <Pressable
                style={[s.cardMain, { padding: sp(14), gap: sp(12) }]}
                onPress={openView}
              >
                <View style={s.cardIcon}>
                  <Ionicons
                    name={variant === 'upcoming' ? 'calendar-outline' : 'sparkles-outline'}
                    size={fs(16)}
                    color={variant === 'upcoming' ? '#9ca3af' : '#7c3aed'}
                  />
                </View>
                <View style={s.cardContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
                    <Text style={[s.cardTitle, { fontSize: fs(15), flexShrink: 1 }, finishedLook && s.cardTitleDone]} numberOfLines={1}>{item.title}</Text>
                    {!once && <Ionicons name="repeat-outline" size={fs(12)} color="#a78bfa" style={{ flexShrink: 0 }} />}
                  </View>
                  <Text style={[s.cardMeta, { fontSize: fs(12) }, overdue && s.choreStatusOverdue]} numberOfLines={1}>{compactMeta || ' '}</Text>
                </View>
                {showCheck && (
                  <Pressable
                    style={[s.checkBtn, { width: sp(36), height: sp(36), borderRadius: sp(18) }, checkVisualDone && s.checkBtnDone]}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      if (variant === 'done') {
                        if (once) uncompleteChore(item);
                        else uncompleteOccurrence(item, rec!.completedDate ?? rec!.current!.date);
                      } else if (variant === 'upcoming') {
                        pickPerformer(item, performer => completeOccurrence(item, rec!.nextDate!, performer, null));
                      } else {
                        if (once) pickPerformer(item, performer => completeChore(item, performer, null));
                        else {
                          const date = rec!.current?.date ?? rec!.nextDate!;
                          pickPerformer(item, performer => completeOccurrence(item, date, performer, null));
                        }
                      }
                    }}
                  >
                    {checkVisualDone && <Ionicons name="checkmark" size={fs(20)} color="#fff" />}
                  </Pressable>
                )}
              </Pressable>
              </View>
              </View>
            </View>
          );
        }}
      />

      <Pressable style={[s.fab, { width: sp(56), height: sp(56), borderRadius: sp(28) }]} onPress={wrapChoreAddTip(openCreate, { title: 'Skapa syssla', message: 'Här lägger du till en återkommande syssla — välj frekvens (dagligen, veckovis, månadsvis), vem som ska göra den och om ni ska turas om automatiskt.' })}>
        <Ionicons name="add" size={fs(30)} color="#fff" />
      </Pressable>

      <Animated.View style={[s.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={s.toastText}>{toastMessage}</Text>
      </Animated.View>

      <Modal visible={showFilterModal} transparent animationType="fade" onRequestClose={() => setShowFilterModal(false)}>
        <View pointerEvents="none" style={s.overlayDim} />
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

      {/* Create modal — fullscreen */}
      <Modal visible={showCreate} animationType="slide" onRequestClose={() => tryCloseCreate(newTitle.trim() !== '', () => { setShowCreate(false); resetCreateForm(); })}>
        <SafeAreaView style={s.createFull}>
          {/* Header */}
          <View style={s.createHeader}>
            <Pressable onPress={() => tryCloseCreate(newTitle.trim() !== '', () => { setShowCreate(false); resetCreateForm(); })} style={s.createHeaderBtn} hitSlop={8}>
              <Text style={s.createHeaderCancel}>Avbryt</Text>
            </Pressable>
            <Text style={s.createHeaderTitle}>{str.modal.createTitle}</Text>
            <Pressable
              style={[s.createHeaderSave, (!newTitle.trim() || creating) && s.createHeaderSaveDisabled]}
              onPress={createChore}
              disabled={creating || !newTitle.trim()}
            >
              {creating
                ? <ActivityIndicator color="#4f46e5" size="small" />
                : <Text style={[s.createHeaderSaveText, !newTitle.trim() && s.createHeaderSaveTextDisabled]}>Lägg till</Text>}
            </Pressable>
          </View>

          <KeyboardAvoidingView behavior={kavBehavior} style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.createScroll} keyboardShouldPersistTaps="handled">
              <TextInput
                style={s.input}
                placeholder={str.modal.namePlaceholder}
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
                rotationAllowed={newRecurrenceType !== 'none'}
                onOpenOrderModal={() => setShowRotationOrder(true)}
              />

              {/* Datum / Startdatum — ovanför upprepning */}
              <Text style={s.label}>{newRecurrenceType === 'none' ? str.modal.dateLabel : str.modal.startLabel}</Text>
              <Pressable style={[s.dateBtn, newStartDate && s.dateBtnSet]} onPress={() => setShowNewStartPicker(true)}>
                <Ionicons name="calendar-outline" size={14} color={newStartDate ? '#4f46e5' : '#9ca3af'} />
                <Text style={[s.dateBtnText, newStartDate && s.dateBtnTextSet]}>
                  {newStartDate ?? (newRecurrenceType === 'none' ? str.modal.chooseDate : str.modal.chooseStart)}
                </Text>
                {newStartDate && (
                  <Pressable onPress={(e) => { e.stopPropagation?.(); setNewStartDate(null); }} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color="#9ca3af" />
                  </Pressable>
                )}
              </Pressable>

              {/* Upprepning — stabil position, öppnar sub-sheet */}
              <Text style={s.label}>{cmpStr.recurrencePicker.label}</Text>
              <Pressable style={s.recurrenceRow} onPress={() => setShowNewRecurrencePicker(true)}>
                <Ionicons name="repeat-outline" size={16} color={newRecurrenceType !== 'none' ? '#4f46e5' : '#9ca3af'} />
                <Text style={[s.recurrenceRowText, newRecurrenceType !== 'none' && s.recurrenceRowTextActive]} numberOfLines={1}>
                  {newRecurrenceSummary}
                </Text>
                {newRecurrenceType !== 'none' ? (
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); setNewRecurrenceType('none'); setNewRecurrenceWeeks(1); setNewRecurrenceDays([]); }}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={18} color="#9ca3af" />
                  </Pressable>
                ) : (
                  <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                )}
              </Pressable>

            </ScrollView>
          </KeyboardAvoidingView>

          {/* Recurrence sub-sheet */}
          <Modal visible={showNewRecurrencePicker} transparent animationType="slide" onRequestClose={() => setShowNewRecurrencePicker(false)}>
            <View pointerEvents="none" style={s.overlayDim} />
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowNewRecurrencePicker(false)} />
            <KeyboardAvoidingView pointerEvents="box-none" behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
              <View style={[s.sheet, { maxHeight: windowHeight * 0.85, paddingBottom: Math.max(8, insets.bottom) }]}>
                <View style={s.sheetHandle} />
                <Text style={s.sheetTitle}>{cmpStr.recurrencePicker.label}</Text>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetScroll}>
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
                    onOpenEndPicker={() => { setShowNewRecurrencePicker(false); setShowNewEndPicker(true); }}
                  />
                  <Pressable style={s.button} onPress={() => setShowNewRecurrencePicker(false)}>
                    <Text style={s.buttonText}>Klart</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          {/* Turordnings-dialog — centrerat kort */}
          <Modal visible={showRotationOrder} transparent animationType="fade" onRequestClose={() => setShowRotationOrder(false)}>
            <Pressable style={s.orderDialogOverlay} onPress={() => setShowRotationOrder(false)}>
              <Pressable style={s.orderDialogCard} onPress={e => e.stopPropagation?.()}>
                <Text style={s.orderDialogTitle}>{cmpStr.multiMemberPicker.order.label}</Text>
                <Text style={s.orderDialogSub}>{cmpStr.multiMemberPicker.order.sub}</Text>
                {newAssignedToMany.map((id, i) => {
                  const m = members.find(x => x.id === id);
                  if (!m) return null;
                  const moveUp = () => setNewAssignedToMany(a => { const n = [...a]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
                  const moveDown = () => setNewAssignedToMany(a => { const n = [...a]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; });
                  return (
                    <View key={id} style={[s.orderDialogRow, i === 0 && s.orderDialogRowFirst]}>
                      <Text style={s.orderNum}>{i + 1}</Text>
                      <Text style={s.orderName}>{m.displayName}</Text>
                      <View style={s.orderBtns}>
                        <Pressable onPress={moveUp} disabled={i === 0} style={s.orderBtn} accessibilityLabel={cmpStr.multiMemberPicker.order.moveUp}>
                          <Ionicons name="chevron-up" size={20} color={i === 0 ? '#d1d5db' : '#6b7280'} />
                        </Pressable>
                        <Pressable onPress={moveDown} disabled={i === newAssignedToMany.length - 1} style={s.orderBtn} accessibilityLabel={cmpStr.multiMemberPicker.order.moveDown}>
                          <Ionicons name="chevron-down" size={20} color={i === newAssignedToMany.length - 1 ? '#d1d5db' : '#6b7280'} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
                <Pressable style={s.orderDialogDoneBtn} onPress={() => setShowRotationOrder(false)}>
                  <Text style={s.orderDialogDoneText}>Klart</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>
        </SafeAreaView>
      </Modal>


      {/* Turordnings-dialog för edit-läget */}
      <Modal visible={showEditRotationOrder} transparent animationType="fade" onRequestClose={() => setShowEditRotationOrder(false)}>
        <Pressable style={s.orderDialogOverlay} onPress={() => setShowEditRotationOrder(false)}>
          <Pressable style={s.orderDialogCard} onPress={e => e.stopPropagation?.()}>
            <Text style={s.orderDialogTitle}>{cmpStr.multiMemberPicker.order.label}</Text>
            <Text style={s.orderDialogSub}>{cmpStr.multiMemberPicker.order.sub}</Text>
            {editAssignedToMany.map((id, i) => {
              const m = members.find(x => x.id === id);
              if (!m) return null;
              const moveUp = () => setEditAssignedToMany(a => { const n = [...a]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
              const moveDown = () => setEditAssignedToMany(a => { const n = [...a]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; });
              return (
                <View key={id} style={[s.orderDialogRow, i === 0 && s.orderDialogRowFirst]}>
                  <Text style={s.orderNum}>{i + 1}</Text>
                  <Text style={s.orderName}>{m.displayName}</Text>
                  <View style={s.orderBtns}>
                    <Pressable onPress={moveUp} disabled={i === 0} style={s.orderBtn} accessibilityLabel={cmpStr.multiMemberPicker.order.moveUp}>
                      <Ionicons name="chevron-up" size={20} color={i === 0 ? '#d1d5db' : '#6b7280'} />
                    </Pressable>
                    <Pressable onPress={moveDown} disabled={i === editAssignedToMany.length - 1} style={s.orderBtn} accessibilityLabel={cmpStr.multiMemberPicker.order.moveDown}>
                      <Ionicons name="chevron-down" size={20} color={i === editAssignedToMany.length - 1 ? '#d1d5db' : '#6b7280'} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
            <Pressable style={s.orderDialogDoneBtn} onPress={() => setShowEditRotationOrder(false)}>
              <Text style={s.orderDialogDoneText}>Klart</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <DatePickerModal value={newStartDate} onChange={setNewStartDate} onClose={() => setShowNewStartPicker(false)} title="Startdatum" visible={showNewStartPicker} minimumDate={isoDateStr(new Date())} />
      <DatePickerModal value={newEndDate} onChange={setNewEndDate} onClose={() => setShowNewEndPicker(false)} title="Slutdatum" visible={showNewEndPicker} minimumDate={newStartDate ?? isoDateStr(new Date())} />
      <DatePickerModal value={editStartDate} onChange={setEditStartDate} onClose={() => setShowEditStartPicker(false)} title="Startdatum" visible={showEditStartPicker} minimumDate={isoDateStr(new Date())} />
      <DatePickerModal value={editEndDate} onChange={setEditEndDate} onClose={() => setShowEditEndPicker(false)} title="Slutdatum" visible={showEditEndPicker} minimumDate={editStartDate ?? isoDateStr(new Date())} />

      {/* View chore — read-only; edit/delete via 3-dot */}
      <Modal visible={!!viewingChore} animationType="slide" onRequestClose={() => setViewingChore(null)}>
        <View style={[s.viewFull, { paddingTop: Platform.OS === 'ios' ? insets.top : 0 }]}>
          {viewingChore && (() => {
            const c = viewingChore;
            const once = isOnce(c);
            const rec = once ? null : recurringStatus(c);
            const ids = c.assignedToMany?.length ? c.assignedToMany : c.assignedTo ? [c.assignedTo] : [];
            const names = ids.map(id => members.find(m => m.id === id)?.displayName).filter(Boolean) as string[];
            const freqText = choreSummary(c);
            const statusText = rec
              ? (rec.state === 'overdue' ? `Förfallen sedan ${rec.overdueDays} ${rec.overdueDays === 1 ? 'dag' : 'dagar'}`
                : rec.state === 'today' ? 'Att göra idag'
                : rec.state === 'done' ? (rec.nextDate ? `Klar · nästa ${formatOcc(rec.nextDate)}` : 'Klar') : null)
              : null;
            const isRotating = !!c.rotation && (c.assignedToMany?.length ?? 0) >= 2;
            const turnByDate = isRotating
              ? computeTurnHistory({ rotation: true, assignedToMany: c.assignedToMany }, rec?.occurrences ?? [])
              : new Map<string, string>();
            return (
              <>
                <View style={s.viewNav}>
                  <Pressable onPress={() => setViewingChore(null)} hitSlop={8} style={s.viewNavBtn} accessibilityLabel={common.actions.close}>
                    <Ionicons name="arrow-back" size={24} color="#111827" />
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => openChoreActions(c)} hitSlop={8} style={s.viewNavBtn} accessibilityLabel={common.actions.more}>
                    <Ionicons name="ellipsis-vertical" size={22} color="#111827" />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={[s.viewBody, { paddingBottom: insets.bottom + 24 }]}>
                  <Text style={s.viewTitle}>{c.emoji ? `${c.emoji} ${c.title}` : c.title}</Text>
                  <View style={s.viewRow}>
                    <Ionicons name="repeat-outline" size={18} color="#6b7280" />
                    <Text style={s.viewRowText}>{freqText}</Text>
                  </View>
                  {names.length > 0 && (
                    <View style={s.viewRow}>
                      <Ionicons name="people-outline" size={18} color="#6b7280" />
                      <Text style={s.viewRowText}>{names.join(', ')}{isRotating ? ' (rotation)' : ''}</Text>
                    </View>
                  )}
                  {statusText && (
                    <View style={s.viewRow}>
                      <Ionicons
                        name={rec?.state === 'done' ? 'checkmark-circle-outline' : rec?.state === 'overdue' ? 'alert-circle-outline' : 'time-outline'}
                        size={18}
                        color={rec?.state === 'overdue' ? '#b45309' : rec?.state === 'done' ? '#10b981' : '#6b7280'}
                      />
                      <Text style={[s.viewRowText, rec?.state === 'overdue' && { color: '#b45309' }, rec?.state === 'done' && { color: '#10b981' }]}>
                        {statusText}
                      </Text>
                    </View>
                  )}
                  <View style={s.viewRow}>
                    <Ionicons name={c.isShared ? 'earth-outline' : 'lock-closed-outline'} size={18} color="#6b7280" />
                    <Text style={s.viewRowText}>{c.isShared ? 'Gemensam' : 'Bara för mig'}</Text>
                  </View>
                  {!!c.description && (
                    <View style={[s.viewRow, { alignItems: 'flex-start' }]}>
                      <Ionicons name="document-text-outline" size={18} color="#6b7280" style={{ marginTop: 2 }} />
                      <Text style={s.viewRowText}>{c.description}</Text>
                    </View>
                  )}
                  {rec && rec.occurrences.length > 0 && (
                    <>
                      <View style={s.viewDivider} />
                      <Text style={s.viewSectionTitle}>Historik</Text>
                      {[...rec.occurrences].reverse().slice(0, 8).map(o => {
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
                              size={16}
                              color={o.done ? '#10b981' : o.isCurrent ? '#7c3aed' : '#d1d5db'}
                              style={{ marginTop: o.note ? 2 : 0 }}
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={[s.historyDate, !o.done && !o.isCurrent && s.historyMissed]}>
                                {formatOcc(o.date)}{o.done
                                  ? (isHopIn
                                    ? ` · ${performerName} (hoppade in för ${turnName})`
                                    : performerName ? ` · ${performerName}` : '')
                                  : o.isCurrent
                                    ? (turnName ? ` · ${turnName}s tur` : ' · att göra')
                                    : (turnName ? ` · ${turnName} missade` : ' · missad')}
                              </Text>
                              {o.note && <Text style={s.historyNote}>{o.note}</Text>}
                            </View>
                          </View>
                        );
                      })}
                    </>
                  )}
                </ScrollView>
              </>
            );
          })()}
        </View>
      </Modal>

      {/* Edit modal */}
      <Modal visible={!!editingChore} transparent animationType="slide" onRequestClose={() => tryCloseCreate(editTitle !== (editingChore?.title ?? ''), () => setEditingChore(null))}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => tryCloseCreate(editTitle !== (editingChore?.title ?? ''), () => setEditingChore(null))} />
        <KeyboardAvoidingView pointerEvents="box-none" behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <View style={[s.sheet, { maxHeight: windowHeight * 0.80, paddingBottom: Math.max(8, insets.bottom) }]}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{str.modal.editTitle}</Text>
          <ConflictBanner
            message={choreConflict?.msg ?? null}
            onShowLatest={choreConflict ? () => { openEdit(choreConflict.latest); setChoreConflict(null); } : undefined}
          />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetScroll}>
            <TextInput
              style={s.input}
              placeholder={str.modal.nameLabel}
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
              rotationAllowed={editRecurrenceType !== 'none'}
              onOpenOrderModal={() => setShowEditRotationOrder(true)}
            />

            {editRecurrenceType === 'none' && (
              <>
                <Text style={s.label}>{str.modal.dateLabel}</Text>
                <View style={s.dateRow}>
                  <Pressable style={[s.dateBtn, editStartDate && s.dateBtnSet]} onPress={() => setShowEditStartPicker(true)}>
                    <Ionicons name="calendar-outline" size={14} color={editStartDate ? '#4f46e5' : '#9ca3af'} />
                    <Text style={[s.dateBtnText, editStartDate && s.dateBtnTextSet]}>{editStartDate ?? str.modal.chooseDate}</Text>
                  </Pressable>
                  {editStartDate && (
                    <Pressable onPress={() => setEditStartDate(null)} hitSlop={8} accessibilityLabel={str.modal.clearDate}>
                      <Ionicons name="close-circle" size={18} color="#9ca3af" />
                    </Pressable>
                  )}
                </View>
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
              showEndDate={showEditAdvanced}
            />

            {editRecurrenceType !== 'none' && (
              <>
                <Text style={s.label}>{str.modal.startLabel}</Text>
                <View style={s.dateRow}>
                  <Pressable style={[s.dateBtn, editStartDate && s.dateBtnSet]} onPress={() => setShowEditStartPicker(true)}>
                    <Ionicons name="calendar-outline" size={14} color={editStartDate ? '#4f46e5' : '#9ca3af'} />
                    <Text style={[s.dateBtnText, editStartDate && s.dateBtnTextSet]}>{editStartDate ?? str.modal.chooseStart}</Text>
                  </Pressable>
                  {editStartDate && (
                    <Pressable onPress={() => setEditStartDate(null)} hitSlop={8} accessibilityLabel={str.modal.clearStartDate}>
                      <Ionicons name="close-circle" size={18} color="#9ca3af" />
                    </Pressable>
                  )}
                </View>
              </>
            )}

            {editRecurrenceType !== 'none' && (
              <Pressable
                style={s.advancedToggle}
                onPress={() => setShowEditAdvanced(v => !v)}
              >
                <Text style={s.advancedToggleText}>
                  {showEditAdvanced ? str.modal.fewerSettings : str.modal.moreSettings}
                </Text>
                <Ionicons
                  name={showEditAdvanced ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color="#6b7280"
                />
              </Pressable>
            )}

            <Pressable
              style={[s.button, !editTitle.trim() && s.buttonDisabled]}
              onPress={saveEdit}
              disabled={saving || !editTitle.trim()}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.buttonText}>{str.modal.saveButton}</Text>}
            </Pressable>

            <Pressable
              style={s.deleteBtn}
              onPress={() => editingChore && deleteChore(editingChore.id, editingChore.title)}
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={s.deleteBtnText}>{str.modal.deleteButton}</Text>
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
  list: { padding: 16, gap: 2 },
  columnWrapper: { gap: 2 },
  cardWrapTablet: { flex: 1 },
  listEmpty: { flex: 1 },
  cardWrap: { position: 'relative' },
  cardDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: '#fff', borderRadius: 11 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', paddingHorizontal: 32, paddingVertical: 14, backgroundColor: '#111827', borderRadius: 24, zIndex: 20 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#c4b5fd', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardInner: { borderRadius: 12, overflow: 'hidden' },
  cardMain: { flexDirection: 'row', alignItems: 'center' },
  cardDone: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' },
  cardUpcoming: { borderLeftColor: '#9ca3af' },
  cardIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardTitleDone: { textDecorationLine: 'line-through', color: '#9ca3af' },
  cardMeta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  cardOverdue: { borderLeftColor: '#f59e0b' },
  choreStatus: { fontSize: 12, fontWeight: '600', marginTop: 3, color: '#6b7280' },
  choreStatusOverdue: { color: '#b45309' },
  choreStatusDone: { color: '#10b981' },
  expandBtn: { padding: 4, flexShrink: 0 },
  historyBox: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyDate: { fontSize: 13, color: '#374151', flex: 1 },
  historyMissed: { color: '#9ca3af' },
  historyNote: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginTop: 1 },
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
  // Dim på eget absolut lager så det täcker bakom sheetens rundade hörn.
  overlay: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
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
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  dateBtnSet: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  dateBtnText: { fontSize: 13, color: '#9ca3af', flex: 1 },
  dateBtnTextSet: { color: '#4f46e5', fontWeight: '600' },
  advancedToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  orderDialogOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  orderDialogCard: { width: '100%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 12 },
  orderDialogTitle: { fontSize: 12, fontWeight: '600', color: '#9ca3af', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  orderDialogSub: { fontSize: 13, color: '#6b7280', paddingHorizontal: 16, paddingBottom: 8 },
  orderDialogRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  orderDialogRowFirst: { borderTopWidth: 0 },
  orderDialogDoneBtn: { paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  orderDialogDoneText: { fontSize: 16, fontWeight: '600', color: '#4f46e5' },
  orderNum: { fontSize: 14, fontWeight: '700', color: '#7c3aed', width: 20, textAlign: 'center' },
  orderName: { flex: 1, fontSize: 15, fontWeight: '500', color: '#111827' },
  orderBtns: { flexDirection: 'row', gap: 2 },
  orderBtn: { padding: 6 },
  advancedToggleText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  createFull: { flex: 1, backgroundColor: '#fff' },
  createHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  createHeaderBtn: { minWidth: 60 },
  createHeaderCancel: { fontSize: 16, color: '#6b7280' },
  createHeaderTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  createHeaderSave: { minWidth: 60, alignItems: 'flex-end' },
  createHeaderSaveDisabled: { opacity: 0.4 },
  createHeaderSaveText: { fontSize: 16, fontWeight: '600', color: '#4f46e5' },
  createHeaderSaveTextDisabled: { color: '#9ca3af' },
  createScroll: { gap: 14, padding: 20, paddingBottom: 40 },
  recurrenceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  recurrenceRowText: { flex: 1, fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  recurrenceRowTextActive: { color: '#4f46e5', fontWeight: '600' },
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
  viewFull: { flex: 1, backgroundColor: '#fff' },
  viewNav: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 8 },
  viewNavBtn: { padding: 8 },
  viewBody: { paddingHorizontal: 20, paddingTop: 8, gap: 4 },
  viewTitle: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 12 },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  viewRowText: { flex: 1, fontSize: 16, color: '#374151' },
  viewDivider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 12 },
  viewSectionTitle: { fontSize: 14, fontWeight: '600', color: '#6b7280', marginBottom: 4 },
});
