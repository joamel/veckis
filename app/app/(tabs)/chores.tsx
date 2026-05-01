import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import type { Chore, ChoreCompletion, ChoreFrequency, WeekDay } from '@veckis/shared';

type ChoreWithCompletion = Chore & { completions: ChoreCompletion[] };

const FREQ_LABELS: Record<ChoreFrequency, string> = {
  once: 'Engång',
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

const DAY_LABELS: Record<WeekDay, string> = {
  mon: 'Måndag', tue: 'Tisdag', wed: 'Onsdag', thu: 'Torsdag',
  fri: 'Fredag', sat: 'Lördag', sun: 'Söndag',
};

function daysSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Idag';
  if (days === 1) return 'Igår';
  return `${days} dagar sedan`;
}

type Member = { id: string; clerkUserId: string; displayName: string };

export default function ChoresScreen() {
  const client = useApiClient();
  const { householdId, householdName } = useHousehold();
  const [chores, setChores] = useState<ChoreWithCompletion[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFreq, setNewFreq] = useState<ChoreFrequency>('weekly');
  const [newAssignedTo, setNewAssignedTo] = useState<string | null>(null);
  const [newDay, setNewDay] = useState<WeekDay | null>(null);
  const [creating, setCreating] = useState(false);

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
      Alert.alert('Fel', 'Kunde inte ladda sysslor');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function getMemberName(clerkUserId: string | null) {
    if (!clerkUserId) return null;
    return members.find(m => m.clerkUserId === clerkUserId)?.displayName ?? null;
  }

  async function createChore() {
    if (!householdId || !newTitle.trim()) return;
    setCreating(true);
    try {
      const chore = await client.createChore({
        householdId,
        title: newTitle.trim(),
        frequency: newFreq,
        assignedTo: newAssignedTo,
        day: newDay,
      });
      setChores(prev => [...prev, { ...chore, completions: [] }]);
      setShowModal(false);
      setNewTitle('');
      setNewFreq('weekly');
      setNewAssignedTo(null);
      setNewDay(null);
    } catch {
      Alert.alert('Fel', 'Kunde inte skapa syssla');
    } finally {
      setCreating(false);
    }
  }

  async function completeChore(chore: ChoreWithCompletion) {
    try {
      const completion = await client.completeChore(chore.id);
      setChores(prev =>
        prev.map(c => c.id === chore.id ? { ...c, completions: [completion, ...c.completions] } : c)
      );
    } catch {
      Alert.alert('Fel', 'Kunde inte markera sysslan');
    }
  }

  async function deleteChore(choreId: string, title: string) {
    Alert.alert('Ta bort syssla', `Ta bort "${title}"?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.deleteChore(choreId);
            setChores(prev => prev.filter(c => c.id !== choreId));
          } catch {
            Alert.alert('Fel', 'Kunde inte ta bort sysslan');
          }
        },
      },
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  const frequencies: ChoreFrequency[] = ['daily', 'weekly', 'biweekly', 'monthly', 'once'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Sysslor</Text>
          {householdName && <Text style={styles.subtitle}>{householdName}</Text>}
        </View>
      </View>

      <FlatList
        data={chores}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, chores.length === 0 && styles.listEmpty]}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={56} color="#d1d5db" />
            <Text style={styles.emptyText}>Inga sysslor</Text>
            <Text style={styles.emptySubtext}>Tryck på + för att lägga till en</Text>
          </View>
        }
        renderItem={({ item }) => {
          const lastCompletion = item.completions[0];
          const assignedName = getMemberName(item.assignedTo);
          return (
            <Pressable
              style={styles.card}
              onLongPress={() => deleteChore(item.id, item.title)}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.freqBadge}>{FREQ_LABELS[item.frequency]}</Text>
                  {item.day && (
                    <View style={styles.dayBadge}>
                      <Ionicons name="calendar-outline" size={11} color="#4f46e5" />
                      <Text style={styles.dayBadgeText}>{DAY_LABELS[item.day]}</Text>
                    </View>
                  )}
                  {assignedName && (
                    <View style={styles.personBadge}>
                      <Ionicons name="person-outline" size={11} color="#7c3aed" />
                      <Text style={styles.personBadgeText}>{assignedName}</Text>
                    </View>
                  )}
                  {lastCompletion && (
                    <Text style={styles.lastDone}>· {daysSince(lastCompletion.completedAt)}</Text>
                  )}
                </View>
              </View>
              <Pressable style={styles.checkBtn} onPress={() => completeChore(item)}>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </Pressable>
            </Pressable>
          );
        }}
      />

      <Pressable style={styles.fab} onPress={() => setShowModal(true)}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowModal(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Ny syssla</Text>
          <TextInput
            style={styles.input}
            placeholder="Sysslans namn, t.ex. Damma"
            value={newTitle}
            onChangeText={setNewTitle}
            autoFocus
            returnKeyType="done"
          />

          <Text style={styles.label}>Frekvens</Text>
          <View style={styles.freqRow}>
            {frequencies.map(f => (
              <Pressable
                key={f}
                style={[styles.freqOption, newFreq === f && styles.freqOptionActive]}
                onPress={() => setNewFreq(f)}
              >
                <Text style={[styles.freqOptionText, newFreq === f && styles.freqOptionTextActive]}>
                  {FREQ_LABELS[f]}
                </Text>
              </Pressable>
            ))}
          </View>

          {members.length > 0 && (
            <>
              <Text style={styles.label}>Tilldela person</Text>
              <View style={styles.memberRow}>
                <Pressable
                  style={[styles.memberOption, newAssignedTo === null && styles.memberOptionActive]}
                  onPress={() => setNewAssignedTo(null)}
                >
                  <Text style={[styles.memberOptionText, newAssignedTo === null && styles.memberOptionTextActive]}>
                    Ingen
                  </Text>
                </Pressable>
                {members.map(m => (
                  <Pressable
                    key={m.id}
                    style={[styles.memberOption, newAssignedTo === m.clerkUserId && styles.memberOptionActive]}
                    onPress={() => setNewAssignedTo(m.clerkUserId)}
                  >
                    <Text style={[styles.memberOptionText, newAssignedTo === m.clerkUserId && styles.memberOptionTextActive]}>
                      {m.displayName}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>Dag i schemat (valfritt)</Text>
          <View style={styles.dayRow}>
            <Pressable
              style={[styles.dayOption, newDay === null && styles.dayOptionActive]}
              onPress={() => setNewDay(null)}
            >
              <Text style={[styles.dayOptionText, newDay === null && styles.dayOptionTextActive]}>Inget</Text>
            </Pressable>
            {DAYS.map(d => (
              <Pressable
                key={d.key}
                style={[styles.dayOption, newDay === d.key && styles.dayOptionActive]}
                onPress={() => setNewDay(d.key)}
              >
                <Text style={[styles.dayOptionText, newDay === d.key && styles.dayOptionTextActive]}>
                  {d.short}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[styles.button, !newTitle.trim() && styles.buttonDisabled]}
            onPress={createChore}
            disabled={creating || !newTitle.trim()}
          >
            {creating
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Lägg till syssla</Text>}
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  list: { padding: 16, gap: 10 },
  listEmpty: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 6 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6, flexWrap: 'wrap' },
  freqBadge: { fontSize: 12, color: '#6b7280' },
  lastDone: { fontSize: 12, color: '#9ca3af' },
  dayBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#eef2ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  dayBadgeText: { fontSize: 11, color: '#4f46e5', fontWeight: '600' },
  personBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f5f3ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  personBadgeText: { fontSize: 11, color: '#7c3aed', fontWeight: '600' },
  checkBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 14, maxHeight: '85%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 16, backgroundColor: '#f9fafb' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqOption: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  freqOptionActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  freqOptionText: { fontSize: 13, color: '#6b7280' },
  freqOptionTextActive: { color: '#4f46e5', fontWeight: '600' },
  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberOption: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  memberOptionActive: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  memberOptionText: { fontSize: 13, color: '#6b7280' },
  memberOptionTextActive: { color: '#7c3aed', fontWeight: '600' },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  dayOptionActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  dayOptionText: { fontSize: 12, color: '#6b7280' },
  dayOptionTextActive: { color: '#4f46e5', fontWeight: '600' },
  button: { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
