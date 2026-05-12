import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type WeekMenuItemWithRecipe } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useHaptics } from '../../src/hooks/useHaptics';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { WeekNav } from '../../src/components/WeekNav';
import { useTablet } from '../../src/hooks/useTablet';
import { MonthView } from '../../src/components/calendar/MonthView';
import { DatePickerModal } from '../../src/components/DatePickerModal';
import { getISOWeek, addWeeks } from '../../src/lib/week';
import type { ScheduleEntry, WeekDay, Chore, ChoreCompletion } from '@veckis/shared';

const DAYS: { key: WeekDay; label: string; short: string }[] = [
  { key: 'mon', label: 'Måndag', short: 'Mån' },
  { key: 'tue', label: 'Tisdag', short: 'Tis' },
  { key: 'wed', label: 'Onsdag', short: 'Ons' },
  { key: 'thu', label: 'Torsdag', short: 'Tor' },
  { key: 'fri', label: 'Fredag', short: 'Fre' },
  { key: 'sat', label: 'Lördag', short: 'Lör' },
  { key: 'sun', label: 'Söndag', short: 'Sön' },
];

const TODAY_DAY = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1].key;

const DRUM_H = 44;
const HOUR_VALS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MIN_VALS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

type ChoreWithCompletion = Chore & { completions: ChoreCompletion[] };
type Member = { id: string; clerkUserId: string | null; displayName: string };

function hapticTick() {
  if (Platform.OS === 'android') Vibration.vibrate(8);
}

function Drum({ values, selected, onSelect }: { values: string[]; selected: number; onSelect: (i: number) => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const len = values.length;
  // 3 copies for seamless wrapping
  const allValues = useMemo(() => [...values, ...values, ...values], [values]);
  const liveIndexRef = useRef(selected);
  const [liveIndex, setLiveIndex] = useState(selected);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: (len + selected) * DRUM_H, animated: false });
    }, 60);
    return () => clearTimeout(t);
  }, []);

  function handleScroll(e: { nativeEvent: { contentOffset: { y: number } } }) {
    const y = e.nativeEvent.contentOffset.y;
    const rawIdx = Math.round(y / DRUM_H);
    const newIdx = ((rawIdx % len) + len) % len;
    if (newIdx !== liveIndexRef.current) {
      liveIndexRef.current = newIdx;
      setLiveIndex(newIdx);
      hapticTick();
    }
  }

  function handleScrollEnd(e: { nativeEvent: { contentOffset: { y: number } } }) {
    const y = e.nativeEvent.contentOffset.y;
    const rawIdx = Math.round(y / DRUM_H);
    const normalIdx = ((rawIdx % len) + len) % len;
    onSelect(normalIdx);
    // If drifted to first or last copy, snap back to middle copy silently
    const targetY = (len + normalIdx) * DRUM_H;
    if (Math.abs(y - targetY) > 2) {
      scrollRef.current?.scrollTo({ y: targetY, animated: false });
    }
  }

  return (
    <View style={{ height: DRUM_H * 3, overflow: 'hidden', flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        snapToInterval={DRUM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: DRUM_H }}
        nestedScrollEnabled
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
      >
        {allValues.map((val, i) => {
          const isSelected = (i % len) === liveIndex;
          return (
            <View key={i} style={{ height: DRUM_H, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{
                fontSize: isSelected ? 26 : 17,
                fontWeight: isSelected ? '700' : '400',
                color: isSelected ? '#111827' : '#d1d5db',
              }}>
                {val}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: DRUM_H, left: 0, right: 0,
          height: DRUM_H,
          borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e5e7eb',
        }}
      />
    </View>
  );
}

export default function ScheduleScreen() {
  const router = useRouter();
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { user } = useUser();
  const { medium } = useHaptics();
  const { isTablet, fs, sp } = useTablet();
  const userId = user?.id;

  const [weekRef, setWeekRef] = useState(new Date());
  const [monthRef, setMonthRef] = useState(new Date());
  const { weekYear, weekNumber } = getISOWeek(weekRef);

  const weekMonday = useMemo(() => {
    const d = new Date(weekRef);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekRef]);

  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [menuItems, setMenuItems] = useState<WeekMenuItemWithRecipe[]>([]);
  const [chores, setChores] = useState<ChoreWithCompletion[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<WeekDay>(TODAY_DAY);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filter
  const [filterMemberIds, setFilterMemberIds] = useState<string[]>([]);
  const [showFilterModal, setShowFilterModal] = useState(false);

  // New entry modal
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [timeEnabled, setTimeEnabled] = useState(false);
  const [newHour, setNewHour] = useState(12);
  const [newMinute, setNewMinute] = useState(0);
  const [newDay, setNewDay] = useState<WeekDay>(TODAY_DAY);
  const [newIsShared, setNewIsShared] = useState(true);
  const [newAssignedTo, setNewAssignedTo] = useState<string | null>(null);
  const [newRecurrenceType, setNewRecurrenceType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('none');
  const [newRecurrenceDays, setNewRecurrenceDays] = useState<WeekDay[]>([]);
  const [newRecurrenceWeeks, setNewRecurrenceWeeks] = useState(1);
  const [creating, setCreating] = useState(false);
  const [showWeekPicker, setShowWeekPicker] = useState(false);

  // Edit entry modal
  const [editingEntry, setEditingEntry] = useState<ScheduleEntry | null>(null);
  const [editEntryTitle, setEditEntryTitle] = useState('');
  const [editEntryTimeEnabled, setEditEntryTimeEnabled] = useState(false);
  const [editEntryHour, setEditEntryHour] = useState(12);
  const [editEntryMinute, setEditEntryMinute] = useState(0);
  const [editEntryDay, setEditEntryDay] = useState<WeekDay>(TODAY_DAY);
  const [editEntryIsShared, setEditEntryIsShared] = useState(true);
  const [editEntryAssignedTo, setEditEntryAssignedTo] = useState<string | null>(null);
  const [savingEntry, setSavingEntry] = useState(false);

  // New entry date range + recurrence
  const [newStartDate, setNewStartDate] = useState<string | null>(null);
  const [newEndDate, setNewEndDate] = useState<string | null>(null);
  const [showNewStartPicker, setShowNewStartPicker] = useState(false);
  const [showNewEndPicker, setShowNewEndPicker] = useState(false);
  const [newMonthlyType, setNewMonthlyType] = useState<'day_of_month' | 'weekday_of_month'>('day_of_month');
  const [newRecurrenceWeekOfMonth, setNewRecurrenceWeekOfMonth] = useState<number>(1);

  // Edit entry state
  const [editMode, setEditMode] = useState<'single' | 'series'>('series');
  const [editEntryRecurrenceType, setEditEntryRecurrenceType] = useState<'none' | 'daily' | 'weekly' | 'custom_days' | 'monthly' | 'yearly'>('none');
  const [editEntryRecurrenceDays, setEditEntryRecurrenceDays] = useState<WeekDay[]>([]);
  const [editEntryRecurrenceWeeks, setEditEntryRecurrenceWeeks] = useState(1);
  const [editEntryMonthlyType, setEditEntryMonthlyType] = useState<'day_of_month' | 'weekday_of_month'>('day_of_month');
  const [editEntryRecurrenceWeekOfMonth, setEditEntryRecurrenceWeekOfMonth] = useState<number>(1);
  const [editEntryStartDate, setEditEntryStartDate] = useState<string | null>(null);
  const [editEntryEndDate, setEditEntryEndDate] = useState<string | null>(null);
  const [showEditStartPicker, setShowEditStartPicker] = useState(false);
  const [showEditEndPicker, setShowEditEndPicker] = useState(false);

  // Edit chore modal (from calendar)
  const [editingCalChore, setEditingCalChore] = useState<ChoreWithCompletion | null>(null);
  const [editCalChoreTitle, setEditCalChoreTitle] = useState('');
  const [editCalChoreAssignedTo, setEditCalChoreAssignedTo] = useState<string | null>(null);
  const [savingCalChore, setSavingCalChore] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const [scheduleData, menuData, choreData, household] = await Promise.all([
        client.getSchedule(householdId),
        client.getWeekMenu(householdId, weekYear, weekNumber),
        client.getChores(householdId),
        client.getHousehold(householdId),
      ]);
      setEntries(scheduleData);
      setMenuItems(menuData);
      setChores(choreData as ChoreWithCompletion[]);
      setMembers(household.members);
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda schemat');
    } finally {
      setLoading(false);
    }
  }, [householdId, weekYear, weekNumber, refreshKey]);

  // Reset to current week/day on every focus; refreshKey change triggers load via useEffect
  useFocusEffect(useCallback(() => {
    setWeekRef(new Date());
    setSelectedDay(TODAY_DAY);
    setRefreshKey(k => k + 1);
  }, []));

  useEffect(() => { load(); }, [load]);

  function getMemberName(memberId: string | null) {
    if (!memberId) return null;
    return members.find(m => m.id === memberId)?.displayName ?? null;
  }

  function isDoneOnDay(completions: ChoreCompletion[], day: WeekDay) {
    return completions.some(c =>
      c.day === day &&
      Date.now() - new Date(c.completedAt).getTime() < 86400000
    );
  }

  function choreVisibleOnDay(chore: ChoreWithCompletion, day: WeekDay, actualDate: Date): boolean {
    if (chore.frequency === 'once') return false;
    const dateStr = actualDate.toISOString().slice(0, 10);
    if (chore.startDate && dateStr < chore.startDate) return false;
    if (chore.endDate && dateStr > chore.endDate) return false;
    if (chore.frequency === 'daily') return true;
    if (!chore.days.includes(day)) return false;
    if (chore.frequency === 'weekly') return true;
    if (chore.frequency === 'biweekly') {
      const { weekNumber: wn } = getISOWeek(actualDate);
      return wn % 2 === 0;
    }
    // monthly: only first occurrence of this weekday in the month
    const firstOfMonth = new Date(actualDate.getFullYear(), actualDate.getMonth(), 1);
    const firstWeekday = firstOfMonth.getDay();
    const targetWeekday = actualDate.getDay();
    let offset = targetWeekday - firstWeekday;
    if (offset < 0) offset += 7;
    return 1 + offset === actualDate.getDate();
  }

  async function uncompleteChoreCalendar(chore: ChoreWithCompletion, day: WeekDay) {
    const saved = chore.completions;
    setChores(cs => cs.map(c => c.id === chore.id
      ? { ...c, completions: c.completions.filter(comp =>
          !(comp.day === day && Date.now() - new Date(comp.completedAt).getTime() < 86400000))
        }
      : c));
    try {
      await client.uncompleteChore(chore.id, day);
    } catch {
      setChores(cs => cs.map(c => c.id === chore.id ? { ...c, completions: saved } : c));
      Alert.alert('Fel', 'Kunde inte avmarkera sysslan');
    }
  }

  async function createEntry() {
    if (!householdId || !newTitle.trim()) return;
    setCreating(true);
    try {
      const entry = await client.createScheduleEntry({
        householdId,
        title: newTitle.trim(),
        day: newDay,
        startTime: timeEnabled
          ? `${newHour.toString().padStart(2, '0')}:${MIN_VALS[newMinute]}`
          : undefined,
        assignedTo: newAssignedTo ?? undefined,
        isShared: newIsShared,
        recurrenceType: newRecurrenceType,
        recurrenceDays: newRecurrenceType === 'weekly' ? newRecurrenceDays : undefined,
        recurrenceWeeks: newRecurrenceType !== 'none' ? newRecurrenceWeeks : undefined,
        monthlyType: newRecurrenceType === 'monthly' ? newMonthlyType : undefined,
        recurrenceWeekOfMonth: newRecurrenceType === 'monthly' && newMonthlyType === 'weekday_of_month' ? newRecurrenceWeekOfMonth : undefined,
        startDate: newStartDate,
        endDate: newEndDate,
      });
      setEntries(prev => [...prev, entry]);
      setShowModal(false);
      setNewTitle('');
      setTimeEnabled(false);
      setNewHour(12);
      setNewMinute(0);
      setNewIsShared(true);
      setNewAssignedTo(null);
      setNewRecurrenceType('none');
      setNewRecurrenceDays([]);
      setNewRecurrenceWeeks(1);
      setNewMonthlyType('day_of_month');
      setNewRecurrenceWeekOfMonth(1);
      setNewStartDate(null);
      setNewEndDate(null);
    } catch (e: any) {
      Alert.alert('Fel', e?.message ?? String(e) ?? 'Kunde inte skapa schemapost');
    } finally {
      setCreating(false);
    }
  }

  async function deleteEntry(entry: ScheduleEntry, dateStr: string) {
    if (entry.recurrenceType !== 'none') {
      Alert.alert('Ta bort aktivitet', `Ta bort "${entry.title}"?`, [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Bara den här',
          onPress: async () => {
            try {
              const result = await client.deleteScheduleEntry(entry.id, dateStr);
              if (result) {
                setEntries(prev => prev.map(e => e.id === entry.id ? result as ScheduleEntry : e));
              }
              setEditingEntry(null);
            } catch {
              Alert.alert('Fel', 'Kunde inte ta bort');
            }
          },
        },
        {
          text: 'Hela serien', style: 'destructive',
          onPress: async () => {
            try {
              await client.deleteScheduleEntry(entry.id);
              setEntries(prev => prev.filter(e => e.id !== entry.id));
              setEditingEntry(null);
            } catch {
              Alert.alert('Fel', 'Kunde inte ta bort');
            }
          },
        },
      ]);
    } else {
      Alert.alert('Ta bort', `Ta bort "${entry.title}"?`, [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Ta bort', style: 'destructive',
          onPress: async () => {
            try {
              await client.deleteScheduleEntry(entry.id);
              setEntries(prev => prev.filter(e => e.id !== entry.id));
              setEditingEntry(null);
            } catch {
              Alert.alert('Fel', 'Kunde inte ta bort');
            }
          },
        },
      ]);
    }
  }

  async function completeChoreCalendar(chore: ChoreWithCompletion, day: WeekDay) {
    const fakeId = '__opt__';
    const fake: ChoreCompletion = { id: fakeId, choreId: chore.id, completedBy: '', completedAt: new Date().toISOString(), note: null, day };
    setChores(cs => cs.map(c => c.id === chore.id ? { ...c, completions: [fake, ...c.completions] } : c));
    try {
      const completion = await client.completeChore(chore.id, day);
      setChores(cs => cs.map(c => c.id === chore.id
        ? { ...c, completions: c.completions.map(comp => comp.id === fakeId ? completion : comp) }
        : c));
    } catch {
      setChores(cs => cs.map(c => c.id === chore.id
        ? { ...c, completions: c.completions.filter(comp => comp.id !== fakeId) }
        : c));
      Alert.alert('Fel', 'Kunde inte markera sysslan');
    }
  }

  async function deleteChoreCalendar(choreId: string, title: string) {
    Alert.alert('Ta bort syssla', `Ta bort "${title}"?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort', style: 'destructive',
        onPress: async () => {
          try {
            await client.deleteChore(choreId);
            setChores(prev => prev.filter(c => c.id !== choreId));
          } catch {
            Alert.alert('Fel', 'Kunde inte ta bort');
          }
        },
      },
    ]);
  }

  function doOpenEditEntry(entry: ScheduleEntry, mode: 'single' | 'series') {
    setEditMode(mode);
    setEditingEntry(entry);
    setEditEntryTitle(entry.title);
    setEditEntryDay(entry.day);
    setEditEntryIsShared(entry.isShared);
    setEditEntryAssignedTo(entry.assignedTo ?? null);
    setEditEntryRecurrenceType(entry.recurrenceType as any);
    setEditEntryRecurrenceDays(entry.recurrenceDays as WeekDay[]);
    setEditEntryRecurrenceWeeks(entry.recurrenceWeeks ?? 1);
    setEditEntryMonthlyType((entry.monthlyType as any) ?? 'day_of_month');
    setEditEntryRecurrenceWeekOfMonth(entry.recurrenceWeekOfMonth ?? 1);
    setEditEntryStartDate(entry.startDate ?? null);
    setEditEntryEndDate(entry.endDate ?? null);
    if (entry.startTime) {
      const [h, m] = entry.startTime.split(':').map(Number);
      setEditEntryTimeEnabled(true);
      setEditEntryHour(h);
      setEditEntryMinute(Math.round(m / 5));
    } else {
      setEditEntryTimeEnabled(false);
      setEditEntryHour(12);
      setEditEntryMinute(0);
    }
  }

  function openEditEntry(entry: ScheduleEntry) {
    if (entry.recurrenceType !== 'none') {
      Alert.alert('Redigera aktivitet', 'Vilka tillfällen vill du redigera?', [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Bara det här', onPress: () => doOpenEditEntry(entry, 'single') },
        { text: 'Hela serien', onPress: () => doOpenEditEntry(entry, 'series') },
      ]);
    } else {
      doOpenEditEntry(entry, 'series');
    }
  }

  async function saveEditEntry() {
    if (!editingEntry || !editEntryTitle.trim()) return;
    setSavingEntry(true);
    try {
      const startTime = editEntryTimeEnabled
        ? `${editEntryHour.toString().padStart(2, '0')}:${MIN_VALS[editEntryMinute]}`
        : null;

      if (editMode === 'single') {
        // Add this date to exceptions on the original, then create a one-off entry
        const withException = await client.deleteScheduleEntry(editingEntry.id, selectedDayDateStr);
        if (withException) {
          setEntries(prev => prev.map(e => e.id === editingEntry.id ? withException as ScheduleEntry : e));
        }
        const newEntry = await client.createScheduleEntry({
          householdId: editingEntry.householdId,
          title: editEntryTitle.trim(),
          day: editEntryDay,
          startTime: startTime ?? undefined,
          isShared: editEntryIsShared,
          recurrenceType: 'none',
          startDate: selectedDayDateStr,
          endDate: selectedDayDateStr,
        });
        setEntries(prev => [...prev, newEntry]);
      } else {
        const updated = await client.updateScheduleEntry(editingEntry.id, {
          title: editEntryTitle.trim(),
          day: editEntryDay,
          startTime,
          isShared: editEntryIsShared,
          assignedTo: editEntryAssignedTo ?? undefined,
          recurrenceType: editEntryRecurrenceType,
          recurrenceDays: editEntryRecurrenceType === 'weekly' ? editEntryRecurrenceDays : [],
          recurrenceWeeks: editEntryRecurrenceWeeks,
          monthlyType: editEntryMonthlyType,
          recurrenceWeekOfMonth: editEntryRecurrenceType === 'monthly' && editEntryMonthlyType === 'weekday_of_month' ? editEntryRecurrenceWeekOfMonth : null,
          startDate: editEntryStartDate,
          endDate: editEntryEndDate,
        } as any);
        setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      }
      setEditingEntry(null);
    } catch {
      Alert.alert('Fel', 'Kunde inte spara aktiviteten');
    } finally {
      setSavingEntry(false);
    }
  }

  function openEditCalChore(chore: ChoreWithCompletion) {
    setEditingCalChore(chore);
    setEditCalChoreTitle(chore.title);
    setEditCalChoreAssignedTo(chore.assignedTo);
  }

  async function saveCalChore() {
    if (!editingCalChore || !editCalChoreTitle.trim()) return;
    setSavingCalChore(true);
    try {
      await client.updateChore(editingCalChore.id, {
        title: editCalChoreTitle.trim(),
        assignedTo: editCalChoreAssignedTo,
      });
      setChores(prev => prev.map(c => c.id === editingCalChore.id
        ? { ...c, title: editCalChoreTitle.trim(), assignedTo: editCalChoreAssignedTo }
        : c
      ));
      setEditingCalChore(null);
    } catch {
      Alert.alert('Fel', 'Kunde inte spara sysslan');
    } finally {
      setSavingCalChore(false);
    }
  }

  function handleSelectDayFromMonth(date: Date) {
    const dow = date.getDay();
    const dayKey: WeekDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dow] as WeekDay;
    setSelectedDay(dayKey);
    setWeekRef(date);
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  const todayISOWeek = getISOWeek(new Date());
  const isCurrentWeek = weekYear === todayISOWeek.weekYear && weekNumber === todayISOWeek.weekNumber;
  const now = new Date();
  const isCurrentMonth = monthRef.getMonth() === now.getMonth() && monthRef.getFullYear() === now.getFullYear();

  const visibleEntries = entries.filter(e => e.isShared || e.createdBy === userId);
  const selectedDayIndex = DAYS.findIndex(d => d.key === selectedDay);
  const selectedDayDate = new Date(weekMonday.getTime() + selectedDayIndex * 86400000);
  const selectedDayDateStr = selectedDayDate.toISOString().slice(0, 10);
  const dayEntries = visibleEntries.filter(e =>
    e.day === selectedDay &&
    !e.exceptions?.includes(selectedDayDateStr) &&
    (!e.startDate || selectedDayDateStr >= e.startDate) &&
    (!e.endDate || selectedDayDateStr <= e.endDate) &&
    (filterMemberIds.length === 0 || (e.assignedTo != null && filterMemberIds.includes(e.assignedTo)))
  );
  const dayMenu = menuItems.filter(i => i.day === selectedDay);
  const dayChores = chores.filter(c =>
    choreVisibleOnDay(c, selectedDay, selectedDayDate) &&
    (filterMemberIds.length === 0 || (c.assignedTo != null && filterMemberIds.includes(c.assignedTo)))
  );

  const totalPerDay = (day: WeekDay) => {
    const idx = DAYS.findIndex(d => d.key === day);
    const dt = new Date(weekMonday.getTime() + idx * 86400000);
    const dtStr = dt.toISOString().slice(0, 10);
    return visibleEntries.filter(e =>
      e.day === day &&
      !e.exceptions?.includes(dtStr) &&
      (!e.startDate || dtStr >= e.startDate) &&
      (!e.endDate || dtStr <= e.endDate)
    ).length +
      menuItems.filter(i => i.day === day).length +
      chores.filter(c => choreVisibleOnDay(c, day, dt)).length;
  };

  const isEmpty = dayEntries.length === 0 && dayMenu.length === 0 && dayChores.length === 0;

  const dayDetailContent = (
    <>
      {dayMenu.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>MATRÄTTER</Text>
          {dayMenu.map(item => (
            <Pressable
              key={item.id}
              style={s.menuCard}
              onPress={() => router.push(`/recipes/${item.recipeId}` as never)}
              onLongPress={() => {
                medium();
                Alert.alert(item.recipe.title, undefined, [
                  { text: 'Visa recept', onPress: () => router.push(`/recipes/${item.recipeId}` as never) },
                  { text: 'Gå till Meny', onPress: () => router.push('/(tabs)/menu' as never) },
                  { text: 'Avbryt', style: 'cancel' },
                ]);
              }}
            >
              <View style={s.menuIcon}>
                <Ionicons name="restaurant-outline" size={fs(16)} color="#4f46e5" />
              </View>
              <Text style={[s.menuTitle, { fontSize: fs(15) }]}>{item.recipe.title}</Text>
              <Text style={[s.menuMeta, { fontSize: fs(12) }]}>{item.recipe.servings} port</Text>
            </Pressable>
          ))}
        </View>
      )}

      {dayChores.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>SYSSLOR</Text>
          {dayChores.map(chore => {
            const done = isDoneOnDay(chore.completions, selectedDay);
            const assignedName = getMemberName(chore.assignedTo);
            return (
              <Pressable
                key={chore.id}
                style={[s.choreCard, done && s.choreDone]}
                onPress={() => openEditCalChore(chore)}
                onLongPress={() => { medium(); openEditCalChore(chore); }}
              >
                <View style={s.choreInfo}>
                  <Text style={[s.choreTitle, { fontSize: fs(15) }, done && s.choreStrike]}>{chore.title}</Text>
                  {assignedName && (
                    <Text style={[s.choreAssigned, { fontSize: fs(12) }]}>{assignedName}</Text>
                  )}
                </View>
                <Pressable
                  style={[s.choreCheckBtn, { width: sp(32), height: sp(32), borderRadius: sp(16) }, done && s.choreCheckBtnDone]}
                  onPress={() => done ? uncompleteChoreCalendar(chore, selectedDay) : completeChoreCalendar(chore, selectedDay)}
                >
                  {done && <Ionicons name="checkmark" size={fs(18)} color="#fff" />}
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      )}

      {dayEntries.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>AKTIVITETER</Text>
          {dayEntries.map(entry => (
            <Pressable
              key={entry.id}
              style={s.entryCard}
              onPress={() => openEditEntry(entry)}
              onLongPress={() => { medium(); openEditEntry(entry); }}
            >
              <View style={s.entryTime}>
                {entry.startTime
                  ? <Text style={[s.timeText, { fontSize: fs(13) }]}>{entry.startTime}</Text>
                  : <Text style={[s.timeTextMuted, { fontSize: fs(10) }]}>Heldag</Text>}
              </View>
              <View style={s.entryContent}>
                <Text style={[s.entryTitle, { fontSize: fs(15) }]}>{entry.title}</Text>
                {entry.description && <Text style={[s.entryDesc, { fontSize: fs(13) }]}>{entry.description}</Text>}
                {getMemberName(entry.assignedTo ?? null) && (
                  <Text style={[s.choreAssigned, { fontSize: fs(12) }]}>{getMemberName(entry.assignedTo ?? null)}</Text>
                )}
              </View>
              {!entry.isShared && <Ionicons name="lock-closed-outline" size={fs(14)} color="#9ca3af" />}
            </Pressable>
          ))}
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader
        title="Kalender"
        actionNode={members.length > 0 ? (
          <Pressable style={[s.filterBtn, filterMemberIds.length > 0 && s.filterBtnActive]} onPress={() => setShowFilterModal(true)}>
            <Ionicons name="person-outline" size={14} color={filterMemberIds.length > 0 ? '#7c3aed' : '#6b7280'} />
            <Text style={[s.filterBtnText, filterMemberIds.length > 0 && s.filterBtnTextActive]}>Filter</Text>
            {filterMemberIds.length > 0 && (
              <View style={s.filterBadge}>
                <Text style={s.filterBadgeText}>{filterMemberIds.length}</Text>
              </View>
            )}
          </Pressable>
        ) : undefined}
      />

      {isTablet ? (
        <View style={s.tabletLayout}>
          <View style={s.tabletLeft}>
            <MonthView
              date={monthRef}
              onMonthChange={setMonthRef}
              entries={visibleEntries}
              chores={chores}
              userId={userId}
              onSelectDay={handleSelectDayFromMonth}
              onEditEntry={(entry) => setEditingEntry(entry)}
              onEditChore={(chore) => setEditingCalChore(chore)}
              onToday={!isCurrentMonth ? () => { setMonthRef(new Date()); setWeekRef(new Date()); setSelectedDay(TODAY_DAY); } : undefined}
              selectedDate={selectedDayDate}
            />
          </View>
          <View style={s.tabletRight}>
            <View style={s.tabletDayHeader}>
              <Text style={s.tabletDayTitle}>
                {DAYS.find(d => d.key === selectedDay)?.label}{' '}
                {selectedDayDate.getDate()}{' '}
                {selectedDayDate.toLocaleDateString('sv-SE', { month: 'long' })}
              </Text>
            </View>
            <ScrollView style={s.content} contentContainerStyle={[s.contentInner, isEmpty && s.contentEmpty]}>
              {isEmpty ? (
                <View style={s.emptyContainer}>
                  <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
                  <Text style={s.emptyText}>Inget planerat</Text>
                  <Text style={s.emptySubtext}>Tryck på + för att lägga till</Text>
                </View>
              ) : dayDetailContent}
            </ScrollView>
            <Pressable style={s.fab} onPress={() => { setNewDay(selectedDay); setShowModal(true); }}>
              <Ionicons name="add" size={30} color="#fff" />
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <WeekNav
            weekLabel={`Vecka ${weekNumber}, ${weekYear}`}
            isCurrentWeek={isCurrentWeek}
            onPrev={() => setWeekRef(w => addWeeks(w, -1))}
            onNext={() => setWeekRef(w => addWeeks(w, 1))}
            onToday={() => { setWeekRef(new Date()); setSelectedDay(TODAY_DAY); }}
            onPickDate={() => setShowWeekPicker(true)}
          />

          <View style={s.dayRow}>
            {DAYS.map((day, i) => {
              const count = totalPerDay(day.key);
              const dayDate = new Date(weekMonday.getTime() + i * 86400000);
              const now = new Date();
              const isToday = dayDate.getDate() === now.getDate() &&
                dayDate.getMonth() === now.getMonth() &&
                dayDate.getFullYear() === now.getFullYear();
              const isActive = selectedDay === day.key;
              const dateNum = new Date(weekMonday.getTime() + i * 86400000).getDate();
              return (
                <Pressable
                  key={day.key}
                  style={[s.dayTab, isActive && s.dayTabActive, !isActive && count > 0 && s.dayTabHasContent]}
                  onPress={() => setSelectedDay(day.key)}
                >
                  <Text style={[s.dayTabShort, isActive && s.dayTabTextActive]}>{day.short}</Text>
                  <Text style={[s.dayTabDate, isActive && s.dayTabTextActive]}>{dateNum}</Text>
                  <View style={[s.todayDot, isActive && s.todayDotActive, !isToday && s.todayDotHidden]} />
                </Pressable>
              );
            })}
          </View>

          <ScrollView style={s.content} contentContainerStyle={[s.contentInner, isEmpty && s.contentEmpty]}>
            {isEmpty ? (
              <View style={s.emptyContainer}>
                <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
                <Text style={s.emptyText}>Inget planerat</Text>
                <Text style={s.emptySubtext}>Tryck på + för att lägga till</Text>
              </View>
            ) : dayDetailContent}
          </ScrollView>

          <Pressable style={s.fab} onPress={() => { setNewDay(selectedDay); setShowModal(true); }}>
            <Ionicons name="add" size={30} color="#fff" />
          </Pressable>
        </>
      )}

      {/* Edit entry modal */}
      <Modal visible={!!editingEntry} transparent animationType="slide" onRequestClose={() => setEditingEntry(null)}>
        <Pressable style={s.overlay} onPress={() => setEditingEntry(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Redigera aktivitet</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetScroll}>
            <TextInput
              style={s.input}
              placeholder="Titel"
              value={editEntryTitle}
              onChangeText={setEditEntryTitle}
            />
            <View style={s.timeToggleRow}>
              <Text style={s.label}>Tid (valfritt)</Text>
              <Switch value={editEntryTimeEnabled} onValueChange={setEditEntryTimeEnabled} trackColor={{ true: '#4f46e5' }} />
            </View>
            {editEntryTimeEnabled && (
              <View style={s.drumRow}>
                <Drum values={HOUR_VALS} selected={editEntryHour} onSelect={setEditEntryHour} />
                <Text style={s.drumColon}>:</Text>
                <Drum values={MIN_VALS} selected={editEntryMinute} onSelect={setEditEntryMinute} />
              </View>
            )}
            <Text style={s.label}>Dag</Text>
            <View style={s.dayPickerRow}>
              {DAYS.map(day => (
                <Pressable
                  key={day.key}
                  style={[s.dayPickerOption, editEntryDay === day.key && s.dayPickerOptionActive]}
                  onPress={() => setEditEntryDay(day.key)}
                >
                  <Text style={[s.dayPickerText, editEntryDay === day.key && s.dayPickerTextActive]}>{day.short}</Text>
                </Pressable>
              ))}
            </View>
            {editMode === 'series' && editEntryRecurrenceType !== 'none' && (
              <>
                <Text style={s.label}>Upprepning</Text>
                <View style={s.recurrenceTypeRow}>
                  {(['none', 'daily', 'weekly', 'monthly', 'yearly'] as const).map(type => {
                    const label = { none: 'Ingen', daily: 'Dag', weekly: 'Vecka', monthly: 'Månad', yearly: 'År' }[type];
                    return (
                      <Pressable
                        key={type}
                        style={[s.recurrenceTypeBtn, editEntryRecurrenceType === type && s.recurrenceTypeBtnActive]}
                        onPress={() => setEditEntryRecurrenceType(type)}
                      >
                        <Text style={[s.recurrenceTypeBtnText, editEntryRecurrenceType === type && s.recurrenceTypeBtnTextActive]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={s.intervalRow}>
                  <Text style={s.intervalLabel}>Var</Text>
                  <Pressable style={s.intervalBtn} onPress={() => setEditEntryRecurrenceWeeks(Math.max(1, editEntryRecurrenceWeeks - 1))}>
                    <Text style={s.intervalBtnText}>−</Text>
                  </Pressable>
                  <Text style={s.intervalValue}>{editEntryRecurrenceWeeks}</Text>
                  <Pressable style={s.intervalBtn} onPress={() => setEditEntryRecurrenceWeeks(editEntryRecurrenceWeeks + 1)}>
                    <Text style={s.intervalBtnText}>+</Text>
                  </Pressable>
                  <Text style={s.intervalLabel}>
                    {({ daily: 'dag', weekly: 'vecka', custom_days: 'vecka', monthly: 'månad', yearly: 'år', none: '' } as Record<string, string>)[editEntryRecurrenceType] ?? ''}
                  </Text>
                </View>
                {editEntryRecurrenceType === 'weekly' && (
                  <>
                    <Text style={s.label}>Veckodagar</Text>
                    <View style={s.dayPickerRow}>
                      {DAYS.map(day => (
                        <Pressable
                          key={day.key}
                          style={[s.dayPickerOption, editEntryRecurrenceDays.includes(day.key) && s.dayPickerOptionActive]}
                          onPress={() => setEditEntryRecurrenceDays(prev =>
                            prev.includes(day.key) ? prev.filter(d => d !== day.key) : [...prev, day.key]
                          )}
                        >
                          <Text style={[s.dayPickerText, editEntryRecurrenceDays.includes(day.key) && s.dayPickerTextActive]}>{day.short}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
                {editEntryRecurrenceType === 'monthly' && (
                  <>
                    <Text style={s.label}>Upprepas</Text>
                    <View style={s.monthlyTypeRow}>
                      <Pressable
                        style={[s.monthlyTypeBtn, editEntryMonthlyType === 'day_of_month' && s.monthlyTypeBtnActive]}
                        onPress={() => setEditEntryMonthlyType('day_of_month')}
                      >
                        <Text style={[s.monthlyTypeBtnText, editEntryMonthlyType === 'day_of_month' && s.monthlyTypeBtnTextActive]}>
                          Varje månad den {selectedDayDate.getDate()}:e
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[s.monthlyTypeBtn, editEntryMonthlyType === 'weekday_of_month' && s.monthlyTypeBtnActive]}
                        onPress={() => setEditEntryMonthlyType('weekday_of_month')}
                      >
                        <Text style={[s.monthlyTypeBtnText, editEntryMonthlyType === 'weekday_of_month' && s.monthlyTypeBtnTextActive]}>
                          {['Första', 'Andra', 'Tredje', 'Fjärde'][editEntryRecurrenceWeekOfMonth - 1] ?? 'Sista'} {DAYS.find(d => d.key === editEntryDay)?.label.toLowerCase()} i månaden
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
                <Text style={s.label}>Slutar</Text>
                <View style={s.endCondRow}>
                  <Pressable
                    style={[s.endCondBtn, !editEntryEndDate && s.endCondBtnActive]}
                    onPress={() => setEditEntryEndDate(null)}
                  >
                    <Text style={[s.endCondBtnText, !editEntryEndDate && s.endCondBtnTextActive]}>Upphör aldrig</Text>
                  </Pressable>
                  <Pressable
                    style={[s.endCondBtn, editEntryEndDate && s.endCondBtnActive, { flex: 1.5 }]}
                    onPress={() => setShowEditEndPicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={13} color={editEntryEndDate ? '#4f46e5' : '#9ca3af'} />
                    <Text style={[s.endCondBtnText, editEntryEndDate && s.endCondBtnTextActive]}>{editEntryEndDate ?? 'Välj datum'}</Text>
                  </Pressable>
                </View>
              </>
            )}
            <Pressable style={s.sharedRow} onPress={() => setEditEntryIsShared(v => !v)}>
              <Ionicons name={editEntryIsShared ? 'earth-outline' : 'lock-closed-outline'} size={18} color={editEntryIsShared ? '#4f46e5' : '#9ca3af'} />
              <View style={{ flex: 1 }}>
                <Text style={s.sharedLabel}>{editEntryIsShared ? 'Gemensam kalender' : 'Bara för mig'}</Text>
                <Text style={s.sharedSub}>{editEntryIsShared ? 'Syns för alla i hushållet' : 'Syns bara för dig'}</Text>
              </View>
              <Switch value={editEntryIsShared} onValueChange={setEditEntryIsShared} trackColor={{ true: '#4f46e5' }} />
            </Pressable>
            {members.length > 0 && (
              <>
                <Text style={s.label}>Tilldela person (valfritt)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.memberPickerRow}>
                  <Pressable
                    style={[s.memberOption, editEntryAssignedTo === null && s.memberOptionActive]}
                    onPress={() => setEditEntryAssignedTo(null)}
                  >
                    <Text style={[s.memberOptionText, editEntryAssignedTo === null && s.memberOptionTextActive]}>Ingen</Text>
                  </Pressable>
                  {members.map(m => (
                    <Pressable
                      key={m.id}
                      style={[s.memberOption, editEntryAssignedTo === m.id && s.memberOptionActive]}
                      onPress={() => setEditEntryAssignedTo(m.id)}
                    >
                      <Text style={[s.memberOptionText, editEntryAssignedTo === m.id && s.memberOptionTextActive]}>{m.displayName}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <View style={s.editModalActions}>
              <Pressable style={s.deleteActionBtn} onPress={() => { if (editingEntry) deleteEntry(editingEntry, selectedDayDateStr); }}>
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={s.deleteActionText}>Ta bort</Text>
              </Pressable>
              <Pressable
                style={[s.button, { flex: 1, marginTop: 0 }, (!editEntryTitle.trim() || savingEntry) && s.buttonDisabled]}
                onPress={saveEditEntry}
                disabled={savingEntry || !editEntryTitle.trim()}
              >
                {savingEntry ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Spara</Text>}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit chore from calendar modal */}
      <Modal visible={!!editingCalChore} transparent animationType="slide" onRequestClose={() => setEditingCalChore(null)}>
        <Pressable style={s.overlay} onPress={() => setEditingCalChore(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Redigera syssla</Text>
          <View style={s.sheetScroll}>
            <TextInput
              style={s.input}
              placeholder="Titel"
              value={editCalChoreTitle}
              onChangeText={setEditCalChoreTitle}
            />
            <Text style={s.label}>Ansvarig</Text>
            <View style={s.memberPickerRow}>
              <Pressable
                style={[s.memberOption, editCalChoreAssignedTo === null && s.memberOptionActive]}
                onPress={() => setEditCalChoreAssignedTo(null)}
              >
                <Text style={[s.memberOptionText, editCalChoreAssignedTo === null && s.memberOptionTextActive]}>Ingen</Text>
              </Pressable>
              {members.map(m => (
                <Pressable
                  key={m.id}
                  style={[s.memberOption, editCalChoreAssignedTo === m.id && s.memberOptionActive]}
                  onPress={() => setEditCalChoreAssignedTo(m.id)}
                >
                  <Text style={[s.memberOptionText, editCalChoreAssignedTo === m.id && s.memberOptionTextActive]}>{m.displayName}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={s.navButton}
              onPress={() => { setEditingCalChore(null); router.push('/(tabs)/chores' as never); }}
            >
              <Ionicons name="open-outline" size={15} color="#4f46e5" />
              <Text style={s.navButtonText}>Gå till Sysslor</Text>
            </Pressable>
            <View style={s.editModalActions}>
              <Pressable style={s.deleteActionBtn} onPress={() => { setEditingCalChore(null); if (editingCalChore) deleteChoreCalendar(editingCalChore.id, editingCalChore.title); }}>
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={s.deleteActionText}>Ta bort</Text>
              </Pressable>
              <Pressable
                style={[s.button, { flex: 1, marginTop: 0 }, (!editCalChoreTitle.trim() || savingCalChore) && s.buttonDisabled]}
                onPress={saveCalChore}
                disabled={savingCalChore || !editCalChoreTitle.trim()}
              >
                {savingCalChore ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Spara</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showFilterModal} transparent animationType="fade" onRequestClose={() => setShowFilterModal(false)}>
        <Pressable style={s.overlay} onPress={() => setShowFilterModal(false)} />
        <View style={s.filterSheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Filtrera på person</Text>
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

      <DatePickerModal
        visible={showWeekPicker}
        value={null}
        title="Gå till vecka"
        onChange={(dateStr) => {
          if (!dateStr) return;
          setWeekRef(new Date(dateStr + 'T00:00:00'));
          setShowWeekPicker(false);
        }}
        onClose={() => setShowWeekPicker(false)}
      />
      <DatePickerModal value={newStartDate} onChange={setNewStartDate} onClose={() => setShowNewStartPicker(false)} title="Startdatum" visible={showNewStartPicker} />
      <DatePickerModal value={newEndDate} onChange={setNewEndDate} onClose={() => setShowNewEndPicker(false)} title="Slutdatum" visible={showNewEndPicker} />
      <DatePickerModal value={editEntryStartDate} onChange={setEditEntryStartDate} onClose={() => setShowEditStartPicker(false)} title="Startdatum" visible={showEditStartPicker} />
      <DatePickerModal value={editEntryEndDate} onChange={setEditEntryEndDate} onClose={() => setShowEditEndPicker(false)} title="Slutdatum" visible={showEditEndPicker} />

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={s.overlay} onPress={() => setShowModal(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Ny aktivitet</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetScroll}>
            <TextInput
              style={s.input}
              placeholder="Titel, t.ex. Träning"
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
            />

            <View style={s.timeToggleRow}>
              <Text style={s.label}>Tid (valfritt)</Text>
              <Switch value={timeEnabled} onValueChange={setTimeEnabled} trackColor={{ true: '#4f46e5' }} />
            </View>
            {timeEnabled && (
              <View style={s.drumRow}>
                <Drum values={HOUR_VALS} selected={newHour} onSelect={setNewHour} />
                <Text style={s.drumColon}>:</Text>
                <Drum values={MIN_VALS} selected={newMinute} onSelect={setNewMinute} />
              </View>
            )}

            <Text style={s.label}>Dag</Text>
            <View style={s.dayPickerRow}>
              {DAYS.map(day => (
                <Pressable
                  key={day.key}
                  style={[s.dayPickerOption, newDay === day.key && s.dayPickerOptionActive]}
                  onPress={() => setNewDay(day.key)}
                >
                  <Text style={[s.dayPickerText, newDay === day.key && s.dayPickerTextActive]}>{day.short}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={s.sharedRow} onPress={() => setNewIsShared(v => !v)}>
              <Ionicons name={newIsShared ? 'earth-outline' : 'lock-closed-outline'} size={18} color={newIsShared ? '#4f46e5' : '#9ca3af'} />
              <View style={{ flex: 1 }}>
                <Text style={s.sharedLabel}>{newIsShared ? 'Gemensam kalender' : 'Bara för mig'}</Text>
                <Text style={s.sharedSub}>{newIsShared ? 'Syns för alla i hushållet' : 'Syns bara för dig'}</Text>
              </View>
              <Switch value={newIsShared} onValueChange={setNewIsShared} trackColor={{ true: '#4f46e5' }} />
            </Pressable>

            {members.length > 0 && (
              <>
                <Text style={s.label}>Tilldela person (valfritt)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.memberPickerRow}>
                  <Pressable
                    style={[s.memberOption, newAssignedTo === null && s.memberOptionActive]}
                    onPress={() => setNewAssignedTo(null)}
                  >
                    <Text style={[s.memberOptionText, newAssignedTo === null && s.memberOptionTextActive]}>Ingen</Text>
                  </Pressable>
                  {members.map(m => (
                    <Pressable
                      key={m.id}
                      style={[s.memberOption, newAssignedTo === m.id && s.memberOptionActive]}
                      onPress={() => setNewAssignedTo(m.id)}
                    >
                      <Text style={[s.memberOptionText, newAssignedTo === m.id && s.memberOptionTextActive]}>{m.displayName}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={s.label}>Upprepning</Text>
            <View style={s.recurrenceTypeRow}>
              {(['none', 'daily', 'weekly', 'monthly', 'yearly'] as const).map(type => {
                const label = { none: 'Ingen', daily: 'Dag', weekly: 'Vecka', monthly: 'Månad', yearly: 'År' }[type];
                return (
                  <Pressable
                    key={type}
                    style={[s.recurrenceTypeBtn, newRecurrenceType === type && s.recurrenceTypeBtnActive]}
                    onPress={() => setNewRecurrenceType(type)}
                  >
                    <Text style={[s.recurrenceTypeBtnText, newRecurrenceType === type && s.recurrenceTypeBtnTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {newRecurrenceType !== 'none' && (
              <View style={s.intervalRow}>
                <Text style={s.intervalLabel}>Var</Text>
                <Pressable style={s.intervalBtn} onPress={() => setNewRecurrenceWeeks(Math.max(1, newRecurrenceWeeks - 1))}>
                  <Text style={s.intervalBtnText}>−</Text>
                </Pressable>
                <Text style={s.intervalValue}>{newRecurrenceWeeks}</Text>
                <Pressable style={s.intervalBtn} onPress={() => setNewRecurrenceWeeks(newRecurrenceWeeks + 1)}>
                  <Text style={s.intervalBtnText}>+</Text>
                </Pressable>
                <Text style={s.intervalLabel}>
                  {({ daily: 'dag', weekly: 'vecka', monthly: 'månad', yearly: 'år' } as Record<string, string>)[newRecurrenceType] ?? ''}
                </Text>
              </View>
            )}

            {newRecurrenceType === 'weekly' && (
              <>
                <Text style={s.label}>Veckodagar</Text>
                <View style={s.dayPickerRow}>
                  {DAYS.map(day => (
                    <Pressable
                      key={day.key}
                      style={[s.dayPickerOption, newRecurrenceDays.includes(day.key) && s.dayPickerOptionActive]}
                      onPress={() => setNewRecurrenceDays(prev =>
                        prev.includes(day.key) ? prev.filter(d => d !== day.key) : [...prev, day.key]
                      )}
                    >
                      <Text style={[s.dayPickerText, newRecurrenceDays.includes(day.key) && s.dayPickerTextActive]}>{day.short}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {newRecurrenceType === 'monthly' && (
              <>
                <Text style={s.label}>Upprepas</Text>
                <View style={s.monthlyTypeRow}>
                  <Pressable
                    style={[s.monthlyTypeBtn, newMonthlyType === 'day_of_month' && s.monthlyTypeBtnActive]}
                    onPress={() => setNewMonthlyType('day_of_month')}
                  >
                    <Text style={[s.monthlyTypeBtnText, newMonthlyType === 'day_of_month' && s.monthlyTypeBtnTextActive]}>
                      Varje månad den {new Date().getDate()}:e
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[s.monthlyTypeBtn, newMonthlyType === 'weekday_of_month' && s.monthlyTypeBtnActive]}
                    onPress={() => setNewMonthlyType('weekday_of_month')}
                  >
                    <Text style={[s.monthlyTypeBtnText, newMonthlyType === 'weekday_of_month' && s.monthlyTypeBtnTextActive]}>
                      {['Första', 'Andra', 'Tredje', 'Fjärde'][newRecurrenceWeekOfMonth - 1] ?? 'Sista'} {DAYS.find(d => d.key === newDay)?.label.toLowerCase()} i månaden
                    </Text>
                  </Pressable>
                </View>
                {newMonthlyType === 'weekday_of_month' && (
                  <View style={s.intervalRow}>
                    <Text style={s.intervalLabel}>Vecka i månaden</Text>
                    <Pressable style={s.intervalBtn} onPress={() => setNewRecurrenceWeekOfMonth(Math.max(1, newRecurrenceWeekOfMonth - 1))}>
                      <Text style={s.intervalBtnText}>−</Text>
                    </Pressable>
                    <Text style={s.intervalValue}>{newRecurrenceWeekOfMonth}</Text>
                    <Pressable style={s.intervalBtn} onPress={() => setNewRecurrenceWeekOfMonth(Math.min(4, newRecurrenceWeekOfMonth + 1))}>
                      <Text style={s.intervalBtnText}>+</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}

            {newRecurrenceType !== 'none' && (
              <>
                <Text style={s.label}>Slutar</Text>
                <View style={s.endCondRow}>
                  <Pressable
                    style={[s.endCondBtn, !newEndDate && s.endCondBtnActive]}
                    onPress={() => setNewEndDate(null)}
                  >
                    <Text style={[s.endCondBtnText, !newEndDate && s.endCondBtnTextActive]}>Upphör aldrig</Text>
                  </Pressable>
                  <Pressable
                    style={[s.endCondBtn, newEndDate && s.endCondBtnActive, { flex: 1.5 }]}
                    onPress={() => setShowNewEndPicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={13} color={newEndDate ? '#4f46e5' : '#9ca3af'} />
                    <Text style={[s.endCondBtnText, newEndDate && s.endCondBtnTextActive]}>{newEndDate ?? 'Välj datum'}</Text>
                  </Pressable>
                </View>
              </>
            )}

            <Pressable
              style={[s.button, !newTitle.trim() && s.buttonDisabled]}
              onPress={createEntry}
              disabled={creating || !newTitle.trim()}
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Lägg till</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dayRow: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 4 },
  dayTab: { flex: 1, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center', gap: 1 },
  dayTabActive: { borderColor: '#4f46e5', backgroundColor: '#4f46e5' },
  dayTabHasContent: { backgroundColor: '#eeecfa', borderColor: '#c7c2f0' },
  dayTabShort: { fontSize: 10, fontWeight: '500', color: '#9ca3af' },
  dayTabDate: { fontSize: 14, fontWeight: '700', color: '#374151' },
  dayTabTextActive: { color: '#fff' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#4f46e5', marginTop: 1 },
  todayDotActive: { backgroundColor: 'rgba(255,255,255,0.8)' },
  todayDotHidden: { opacity: 0 },
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 16, paddingBottom: 80 },
  contentEmpty: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#374151', marginTop: 12 },
  emptySubtext: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8, paddingHorizontal: 2 },
  menuCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  menuIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  menuTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  menuMeta: { fontSize: 12, color: '#9ca3af' },
  choreCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  choreDone: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  choreInfo: { flex: 1 },
  choreTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  choreStrike: { textDecorationLine: 'line-through', color: '#9ca3af' },
  choreAssigned: { fontSize: 12, color: '#7c3aed', marginTop: 2 },
  choreCheckBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#d1d5db', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  choreCheckBtnDone: { backgroundColor: '#10b981', borderColor: '#10b981' },
  entryCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  entryTime: { width: 44, alignItems: 'center', paddingTop: 2 },
  timeText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  timeTextMuted: { fontSize: 10, color: '#9ca3af', fontStyle: 'italic' },
  entryContent: { flex: 1 },
  entryTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  entryDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 0, maxHeight: '85%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  sheetScroll: { gap: 14, paddingBottom: 40 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 16, backgroundColor: '#f9fafb' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  timeToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  drumRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden', paddingHorizontal: 20 },
  drumColon: { fontSize: 30, fontWeight: '700', color: '#374151', marginHorizontal: 8 },
  dayPickerRow: { flexDirection: 'row', gap: 6 },
  dayPickerOption: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', backgroundColor: '#f9fafb' },
  dayPickerOptionActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  dayPickerText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  dayPickerTextActive: { color: '#4f46e5', fontWeight: '700' },
  sharedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f9fafb', borderRadius: 10, padding: 12 },
  sharedLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  sharedSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  button: { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  editModalActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  deleteActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fff7f7' },
  deleteActionText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },
  memberPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', flexShrink: 0 },
  memberOptionActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  memberOptionText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  memberOptionTextActive: { color: '#4f46e5', fontWeight: '600' },
  navButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, marginBottom: 10 },
  navButtonText: { fontSize: 14, fontWeight: '600', color: '#4f46e5' },
  tabletLayout: { flex: 1, flexDirection: 'row' },
  tabletLeft: { flex: 1.4, borderRightWidth: 1, borderRightColor: '#f3f4f6' },
  tabletRight: { flex: 1, backgroundColor: '#f9fafb' },
  tabletDayHeader: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tabletDayTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  dateBtnSet: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  dateBtnText: { fontSize: 13, color: '#9ca3af', flex: 1 },
  dateBtnTextSet: { color: '#4f46e5', fontWeight: '600' },
  recurrenceTypeRow: { flexDirection: 'row', gap: 6 },
  recurrenceTypeBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', backgroundColor: '#f9fafb' },
  recurrenceTypeBtnActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  recurrenceTypeBtnText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  recurrenceTypeBtnTextActive: { color: '#4f46e5', fontWeight: '700' },
  intervalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  intervalLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  intervalBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  intervalBtnText: { fontSize: 18, color: '#374151', fontWeight: '600', lineHeight: 22 },
  intervalValue: { fontSize: 18, fontWeight: '700', color: '#111827', minWidth: 28, textAlign: 'center' },
  monthlyTypeRow: { gap: 8 },
  monthlyTypeBtn: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  monthlyTypeBtnActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  monthlyTypeBtnText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  monthlyTypeBtnTextActive: { color: '#4f46e5', fontWeight: '700' },
  endCondRow: { flexDirection: 'row', gap: 8 },
  endCondBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  endCondBtnActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  endCondBtnText: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  endCondBtnTextActive: { color: '#4f46e5', fontWeight: '700' },
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
