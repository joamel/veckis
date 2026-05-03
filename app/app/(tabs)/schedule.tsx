import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type WeekMenuItemWithRecipe } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
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

type ChoreWithCompletion = Chore & { completions: ChoreCompletion[] };

export default function ScheduleScreen() {
  const router = useRouter();
  const client = useApiClient();
  const { householdId, householdName } = useHousehold();
  const { user } = useUser();
  const userId = user?.id;

  const [weekRef, setWeekRef] = useState(new Date());
  const { weekYear, weekNumber } = getISOWeek(weekRef);

  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [menuItems, setMenuItems] = useState<WeekMenuItemWithRecipe[]>([]);
  const [chores, setChores] = useState<ChoreWithCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<WeekDay>(TODAY_DAY);

  // New entry modal
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newDay, setNewDay] = useState<WeekDay>(TODAY_DAY);
  const [newIsShared, setNewIsShared] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const [scheduleData, menuData, choreData] = await Promise.all([
        client.getSchedule(householdId),
        client.getWeekMenu(householdId, weekYear, weekNumber),
        client.getChores(householdId),
      ]);
      setEntries(scheduleData);
      setMenuItems(menuData);
      setChores(choreData as ChoreWithCompletion[]);
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda schemat');
    } finally {
      setLoading(false);
    }
  }, [householdId, weekYear, weekNumber]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function createEntry() {
    if (!householdId || !newTitle.trim()) return;
    setCreating(true);
    try {
      const entry = await client.createScheduleEntry({
        householdId,
        title: newTitle.trim(),
        day: newDay,
        startTime: newTime.match(/^\d{2}:\d{2}$/) ? newTime : undefined,
        isShared: newIsShared,
      });
      setEntries(prev => [...prev, entry]);
      setShowModal(false);
      setNewTitle('');
      setNewTime('');
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

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  const visibleEntries = entries.filter(e => e.isShared || e.createdBy === userId);
  const dayEntries = visibleEntries.filter(e => e.day === selectedDay);
  const dayMenu = menuItems.filter(i => i.day === selectedDay);
  const dayChores = chores.filter(c => c.day === selectedDay);

  const totalPerDay = (day: WeekDay) =>
    visibleEntries.filter(e => e.day === day).length +
    menuItems.filter(i => i.day === day).length +
    chores.filter(c => c.day === day).length;

  const isEmpty = dayEntries.length === 0 && dayMenu.length === 0 && dayChores.length === 0;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Kalender</Text>
          {householdName && <Text style={s.subtitle}>{householdName}</Text>}
        </View>
      </View>

      {/* Week navigator */}
      <View style={s.weekNav}>
        <Pressable onPress={() => setWeekRef(w => addWeeks(w, -1))} style={s.weekArrow}>
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </Pressable>
        <Text style={s.weekLabel}>Vecka {weekNumber}, {weekYear}</Text>
        <Pressable onPress={() => setWeekRef(w => addWeeks(w, 1))} style={s.weekArrow}>
          <Ionicons name="chevron-forward" size={20} color="#374151" />
        </Pressable>
      </View>

      {/* Day tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayScroll} contentContainerStyle={s.dayScrollContent}>
        {DAYS.map(day => {
          const count = totalPerDay(day.key);
          const isToday = day.key === TODAY_DAY;
          return (
            <Pressable
              key={day.key}
              style={[s.dayTab, selectedDay === day.key && s.dayTabActive]}
              onPress={() => setSelectedDay(day.key)}
            >
              <Text style={[s.dayTabShort, selectedDay === day.key && s.dayTabShortActive]}>{day.short}</Text>
              {count > 0 && (
                <View style={[s.dayBadge, selectedDay === day.key && s.dayBadgeActive]}>
                  <Text style={[s.dayBadgeText, selectedDay === day.key && s.dayBadgeTextActive]}>{count}</Text>
                </View>
              )}
              {isToday && <View style={s.todayDot} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={s.content} contentContainerStyle={[s.contentInner, isEmpty && s.contentEmpty]}>
        {isEmpty ? (
          <View style={s.emptyContainer}>
            <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
            <Text style={s.emptyText}>Inget planerat</Text>
            <Text style={s.emptySubtext}>Tryck på + för att lägga till</Text>
          </View>
        ) : (
          <>
            {/* Maträtter */}
            {dayMenu.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>MATRÄTTER</Text>
                {dayMenu.map(item => (
                  <Pressable
                    key={item.id}
                    style={s.menuCard}
                    onPress={() => router.push(`/recipes/${item.recipeId}` as never)}
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

            {/* Sysslor */}
            {dayChores.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>SYSSLOR</Text>
                {dayChores.map(chore => (
                  <View key={chore.id} style={s.choreCard}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#7c3aed" />
                    <Text style={s.choreTitle}>{chore.title}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Aktiviteter */}
            {dayEntries.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>AKTIVITETER</Text>
                {dayEntries.map(entry => (
                  <Pressable
                    key={entry.id}
                    style={s.entryCard}
                    onLongPress={() => deleteEntry(entry.id, entry.title)}
                  >
                    <View style={s.entryTime}>
                      {entry.startTime
                        ? <Text style={s.timeText}>{entry.startTime}</Text>
                        : <Ionicons name="time-outline" size={18} color="#9ca3af" />}
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

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={s.overlay} onPress={() => setShowModal(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Ny aktivitet</Text>
          <TextInput
            style={s.input}
            placeholder="Titel, t.ex. Träning"
            value={newTitle}
            onChangeText={setNewTitle}
            autoFocus
          />
          <TextInput
            style={s.input}
            placeholder="Tid, t.ex. 18:00 (valfritt)"
            value={newTime}
            onChangeText={setNewTime}
            keyboardType="numbers-and-punctuation"
          />
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
  dayScroll: { maxHeight: 72, backgroundColor: '#fff' },
  dayScrollContent: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8 },
  dayTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center', gap: 4 },
  dayTabActive: { borderColor: '#4f46e5', backgroundColor: '#4f46e5' },
  dayTabShort: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  dayTabShortActive: { color: '#fff' },
  dayBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  dayBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  dayBadgeText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  dayBadgeTextActive: { color: '#fff' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#4f46e5', position: 'absolute', bottom: 4 },
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
  choreTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  entryCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  entryTime: { width: 44, alignItems: 'center', paddingTop: 2 },
  timeText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  entryContent: { flex: 1 },
  entryTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  entryDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 14 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 16, backgroundColor: '#f9fafb' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
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
});
