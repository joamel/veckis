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
import { useTablet } from '../../src/hooks/useTablet';
import { MonthView } from '../../src/components/calendar/MonthView';
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
type Member = { id: string; clerkUserId: string; displayName: string };

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
  const { householdId, householdName, householdEmoji } = useHousehold();
  const { user } = useUser();
  const { medium } = useHaptics();
  const isTablet = useTablet();
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

  // New entry modal
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [timeEnabled, setTimeEnabled] = useState(false);
  const [newHour, setNewHour] = useState(12);
  const [newMinute, setNewMinute] = useState(0);
  const [newDay, setNewDay] = useState<WeekDay>(TODAY_DAY);
  const [newIsShared, setNewIsShared] = useState(true);
  const [creating, setCreating] = useState(false);

  // Edit entry modal
  const [editingEntry, setEditingEntry] = useState<ScheduleEntry | null>(null);
  const [editEntryTitle, setEditEntryTitle] = useState('');
  const [editEntryTimeEnabled, setEditEntryTimeEnabled] = useState(false);
  const [editEntryHour, setEditEntryHour] = useState(12);
  const [editEntryMinute, setEditEntryMinute] = useState(0);
  const [editEntryDay, setEditEntryDay] = useState<WeekDay>(TODAY_DAY);
  const [editEntryIsShared, setEditEntryIsShared] = useState(true);
  const [savingEntry, setSavingEntry] = useState(false);

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

  function getMemberName(clerkUserId: string | null) {
    if (!clerkUserId) return null;
    return members.find(m => m.clerkUserId === clerkUserId)?.displayName ?? null;
  }

  function isDoneOnDay(completions: ChoreCompletion[], day: WeekDay) {
    return completions.some(c =>
      c.day === day &&
      Date.now() - new Date(c.completedAt).getTime() < 86400000
    );
  }

  function choreVisibleOnDay(chore: ChoreWithCompletion, day: WeekDay, actualDate: Date): boolean {
    if (chore.frequency === 'once') return false;
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
    try {
      await client.uncompleteChore(chore.id, day);
      setChores(prev =>
        prev.map(c => c.id === chore.id
          ? { ...c, completions: c.completions.filter(comp =>
              !(comp.day === day && Date.now() - new Date(comp.completedAt).getTime() < 86400000))
            }
          : c)
      );
    } catch {
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
        isShared: newIsShared,
      });
      setEntries(prev => [...prev, entry]);
      setShowModal(false);
      setNewTitle('');
      setTimeEnabled(false);
      setNewHour(12);
      setNewMinute(0);
      setNewIsShared(true);
    } catch {
      Alert.alert('Fel', 'Kunde inte skapa schemapost');
    } finally {
      setCreating(false);
    }
  }

  async function deleteEntry(entryId: string, title: string) {
    Alert.alert('Ta bort', `Ta bort "${title}"?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort', style: 'destructive',
        onPress: async () => {
          try {
            await client.deleteScheduleEntry(entryId);
            setEntries(prev => prev.filter(e => e.id !== entryId));
          } catch {
            Alert.alert('Fel', 'Kunde inte ta bort');
          }
        },
      },
    ]);
  }

  async function completeChoreCalendar(chore: ChoreWithCompletion, day: WeekDay) {
    try {
      const completion = await client.completeChore(chore.id, day);
      setChores(prev =>
        prev.map(c => c.id === chore.id ? { ...c, completions: [completion, ...c.completions] } : c)
      );
    } catch {
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

  function openEditEntry(entry: ScheduleEntry) {
    setEditingEntry(entry);
    setEditEntryTitle(entry.title);
    setEditEntryDay(entry.day);
    setEditEntryIsShared(entry.isShared);
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

  async function saveEditEntry() {
    if (!editingEntry || !editEntryTitle.trim()) return;
    setSavingEntry(true);
    try {
      const updated = await client.updateScheduleEntry(editingEntry.id, {
        title: editEntryTitle.trim(),
        day: editEntryDay,
        startTime: editEntryTimeEnabled
          ? `${editEntryHour.toString().padStart(2, '0')}:${MIN_VALS[editEntryMinute]}`
          : null,
        isShared: editEntryIsShared,
      });
      setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
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

  const visibleEntries = entries.filter(e => e.isShared || e.createdBy === userId);
  const dayEntries = visibleEntries.filter(e => e.day === selectedDay);
  const dayMenu = menuItems.filter(i => i.day === selectedDay);
  const selectedDayIndex = DAYS.findIndex(d => d.key === selectedDay);
  const selectedDayDate = new Date(weekMonday.getTime() + selectedDayIndex * 86400000);
  const dayChores = chores.filter(c => choreVisibleOnDay(c, selectedDay, selectedDayDate));

  const totalPerDay = (day: WeekDay) => {
    const idx = DAYS.findIndex(d => d.key === day);
    const dt = new Date(weekMonday.getTime() + idx * 86400000);
    return visibleEntries.filter(e => e.day === day).length +
      menuItems.filter(i => i.day === day).length +
      chores.filter(c => choreVisibleOnDay(c, day, dt)).length;
  };

  const isEmpty = dayEntries.length === 0 && dayMenu.length === 0 && dayChores.length === 0;

  if (isTablet) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <View>
            <Text style={s.title}>Kalender</Text>
            {householdName && <Text style={s.subtitle}>{householdEmoji} {householdName}</Text>}
          </View>
        </View>
        <MonthView
          date={monthRef}
          onMonthChange={setMonthRef}
          entries={visibleEntries}
          menuItems={menuItems}
          chores={chores}
          userId={userId}
          onSelectDay={handleSelectDayFromMonth}
          onEditEntry={() => {}}
          onEditChore={() => {}}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Kalender</Text>
          {householdName && <Text style={s.subtitle}>{householdEmoji} {householdName}</Text>}
        </View>
      </View>

      <View style={s.weekNav}>
        <Pressable onPress={() => setWeekRef(w => addWeeks(w, -1))} style={s.weekArrow}>
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </Pressable>
        <Pressable onPress={() => setWeekRef(new Date())}>
          <Text style={s.weekLabel}>Vecka {weekNumber}, {weekYear}</Text>
        </Pressable>
        <Pressable onPress={() => setWeekRef(w => addWeeks(w, 1))} style={s.weekArrow}>
          <Ionicons name="chevron-forward" size={20} color="#374151" />
        </Pressable>
      </View>

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
              {isToday && <View style={[s.todayDot, isActive && s.todayDotActive]} />}
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
        ) : (
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
                      <Ionicons name="restaurant-outline" size={16} color="#4f46e5" />
                    </View>
                    <Text style={s.menuTitle}>{item.recipe.title}</Text>
                    <Text style={s.menuMeta}>{item.recipe.servings} port</Text>
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
                      onLongPress={() => { medium(); openEditCalChore(chore); }}
                    >
                      <View style={s.choreInfo}>
                        <Text style={[s.choreTitle, done && s.choreStrike]}>{chore.title}</Text>
                        {assignedName && (
                          <Text style={s.choreAssigned}>{assignedName}</Text>
                        )}
                      </View>
                      <Pressable
                        style={[s.choreCheckBtn, done && s.choreCheckBtnDone]}
                        onPress={() => done ? uncompleteChoreCalendar(chore, selectedDay) : completeChoreCalendar(chore, selectedDay)}
                      >
                        {done && <Ionicons name="checkmark" size={18} color="#fff" />}
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
                    onLongPress={() => { medium(); openEditEntry(entry); }}
                  >
                    <View style={s.entryTime}>
                      {entry.startTime
                        ? <Text style={s.timeText}>{entry.startTime}</Text>
                        : <Text style={s.timeTextMuted}>Heldag</Text>}
                    </View>
                    <View style={s.entryContent}>
                      <Text style={s.entryTitle}>{entry.title}</Text>
                      {entry.description && <Text style={s.entryDesc}>{entry.description}</Text>}
                    </View>
                    {!entry.isShared && <Ionicons name="lock-closed-outline" size={14} color="#9ca3af" />}
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Pressable style={s.fab} onPress={() => { setNewDay(selectedDay); setShowModal(true); }}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

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
            <Pressable style={s.sharedRow} onPress={() => setEditEntryIsShared(v => !v)}>
              <Ionicons name={editEntryIsShared ? 'earth-outline' : 'lock-closed-outline'} size={18} color={editEntryIsShared ? '#4f46e5' : '#9ca3af'} />
              <View style={{ flex: 1 }}>
                <Text style={s.sharedLabel}>{editEntryIsShared ? 'Gemensam kalender' : 'Bara för mig'}</Text>
                <Text style={s.sharedSub}>{editEntryIsShared ? 'Syns för alla i hushållet' : 'Syns bara för dig'}</Text>
              </View>
              <Switch value={editEntryIsShared} onValueChange={setEditEntryIsShared} trackColor={{ true: '#4f46e5' }} />
            </Pressable>
            <View style={s.editModalActions}>
              <Pressable style={s.deleteActionBtn} onPress={() => { setEditingEntry(null); if (editingEntry) deleteEntry(editingEntry.id, editingEntry.title); }}>
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
                  style={[s.memberOption, editCalChoreAssignedTo === m.clerkUserId && s.memberOptionActive]}
                  onPress={() => setEditCalChoreAssignedTo(m.clerkUserId)}
                >
                  <Text style={[s.memberOptionText, editCalChoreAssignedTo === m.clerkUserId && s.memberOptionTextActive]}>{m.displayName}</Text>
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
  header: { padding: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  weekArrow: { padding: 4 },
  weekLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
  dayRow: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 4 },
  dayTab: { flex: 1, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center', gap: 1 },
  dayTabActive: { borderColor: '#4f46e5', backgroundColor: '#4f46e5' },
  dayTabHasContent: { backgroundColor: '#eeecfa', borderColor: '#c7c2f0' },
  dayTabShort: { fontSize: 10, fontWeight: '500', color: '#9ca3af' },
  dayTabDate: { fontSize: 14, fontWeight: '700', color: '#374151' },
  dayTabTextActive: { color: '#fff' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#4f46e5', marginTop: 1 },
  todayDotActive: { backgroundColor: 'rgba(255,255,255,0.8)' },
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
  memberOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  memberOptionActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  memberOptionText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  memberOptionTextActive: { color: '#4f46e5', fontWeight: '600' },
  navButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, marginBottom: 10 },
  navButtonText: { fontSize: 14, fontWeight: '600', color: '#4f46e5' },
});
