import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import type { ScheduleEntry, WeekDay } from '@veckis/shared';

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

export default function ScheduleScreen() {
  const client = useApiClient();
  const { householdId, householdName } = useHousehold();
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<WeekDay>(TODAY_DAY);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newDay, setNewDay] = useState<WeekDay>(TODAY_DAY);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const data = await client.getSchedule(householdId);
      setEntries(data);
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda schemat');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

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
      });
      setEntries(prev => [...prev, entry]);
      setShowModal(false);
      setNewTitle('');
      setNewTime('');
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
        text: 'Ta bort',
        style: 'destructive',
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
    return <View style={styles.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  const dayEntries = entries.filter(e => e.day === selectedDay);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Schema</Text>
          {householdName && <Text style={styles.subtitle}>{householdName}</Text>}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayScroll} contentContainerStyle={styles.dayScrollContent}>
        {DAYS.map(day => {
          const count = entries.filter(e => e.day === day.key).length;
          const isToday = day.key === TODAY_DAY;
          return (
            <Pressable
              key={day.key}
              style={[styles.dayTab, selectedDay === day.key && styles.dayTabActive]}
              onPress={() => setSelectedDay(day.key)}
            >
              <Text style={[styles.dayTabShort, selectedDay === day.key && styles.dayTabShortActive]}>
                {day.short}
              </Text>
              {count > 0 && (
                <View style={[styles.dayBadge, selectedDay === day.key && styles.dayBadgeActive]}>
                  <Text style={[styles.dayBadgeText, selectedDay === day.key && styles.dayBadgeTextActive]}>
                    {count}
                  </Text>
                </View>
              )}
              {isToday && <View style={styles.todayDot} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={styles.entries} contentContainerStyle={[styles.entriesList, dayEntries.length === 0 && styles.entriesEmpty]}>
        {dayEntries.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>Inget planerat</Text>
            <Text style={styles.emptySubtext}>Tryck på + för att lägga till</Text>
          </View>
        ) : (
          dayEntries.map(entry => (
            <Pressable
              key={entry.id}
              style={styles.entryCard}
              onLongPress={() => deleteEntry(entry.id, entry.title)}
            >
              <View style={styles.entryTime}>
                {entry.startTime
                  ? <Text style={styles.timeText}>{entry.startTime}</Text>
                  : <Ionicons name="time-outline" size={18} color="#9ca3af" />}
              </View>
              <View style={styles.entryContent}>
                <Text style={styles.entryTitle}>{entry.title}</Text>
                {entry.description && (
                  <Text style={styles.entryDesc}>{entry.description}</Text>
                )}
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => { setNewDay(selectedDay); setShowModal(true); }}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowModal(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Ny post</Text>
          <TextInput
            style={styles.input}
            placeholder="Titel, t.ex. Träning"
            value={newTitle}
            onChangeText={setNewTitle}
            autoFocus
          />
          <TextInput
            style={styles.input}
            placeholder="Tid, t.ex. 18:00 (valfritt)"
            value={newTime}
            onChangeText={setNewTime}
            keyboardType="numbers-and-punctuation"
          />
          <Text style={styles.label}>Dag</Text>
          <View style={styles.dayPickerRow}>
            {DAYS.map(day => (
              <Pressable
                key={day.key}
                style={[styles.dayPickerOption, newDay === day.key && styles.dayPickerOptionActive]}
                onPress={() => setNewDay(day.key)}
              >
                <Text style={[styles.dayPickerText, newDay === day.key && styles.dayPickerTextActive]}>
                  {day.short}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={[styles.button, !newTitle.trim() && styles.buttonDisabled]}
            onPress={createEntry}
            disabled={creating || !newTitle.trim()}
          >
            {creating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Lägg till</Text>}
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    padding: 20,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  dayScroll: { maxHeight: 72, backgroundColor: '#fff' },
  dayScrollContent: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8 },
  dayTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    gap: 4,
  },
  dayTabActive: { borderColor: '#4f46e5', backgroundColor: '#4f46e5' },
  dayTabShort: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  dayTabShortActive: { color: '#fff' },
  dayBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dayBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  dayBadgeText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  dayBadgeTextActive: { color: '#fff' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#4f46e5', position: 'absolute', bottom: 4 },
  entries: { flex: 1 },
  entriesList: { padding: 16, gap: 10 },
  entriesEmpty: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#374151', marginTop: 12 },
  emptySubtext: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  entryTime: { width: 44, alignItems: 'center', paddingTop: 2 },
  timeText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  entryContent: { flex: 1 },
  entryTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  entryDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4f46e5',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 14,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#f9fafb',
  },
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  dayPickerRow: { flexDirection: 'row', gap: 6 },
  dayPickerOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  dayPickerOptionActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  dayPickerText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  dayPickerTextActive: { color: '#4f46e5', fontWeight: '700' },
  button: { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
