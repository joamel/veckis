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
import type { Chore, ChoreCompletion, ChoreFrequency } from '@veckis/shared';

type ChoreWithCompletion = Chore & { completions: ChoreCompletion[] };

const FREQ_LABELS: Record<ChoreFrequency, string> = {
  once: 'Engång',
  daily: 'Dagligen',
  weekly: 'Varje vecka',
  biweekly: 'Varannan vecka',
  monthly: 'Månadsvis',
};

function daysSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Idag';
  if (days === 1) return 'Igår';
  return `${days} dagar sedan`;
}

export default function ChoresScreen() {
  const client = useApiClient();
  const { householdId, householdName } = useHousehold();
  const [chores, setChores] = useState<ChoreWithCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFreq, setNewFreq] = useState<ChoreFrequency>('weekly');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const data = await client.getChores(householdId);
      setChores(data);
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda sysslor');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function createChore() {
    if (!householdId || !newTitle.trim()) return;
    setCreating(true);
    try {
      const chore = await client.createChore({
        householdId,
        title: newTitle.trim(),
        frequency: newFreq,
      });
      setChores(prev => [...prev, { ...chore, completions: [] }]);
      setShowModal(false);
      setNewTitle('');
      setNewFreq('weekly');
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
          return (
            <Pressable
              style={styles.card}
              onLongPress={() => deleteChore(item.id, item.title)}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <View style={styles.cardMeta}>
                  <Text style={styles.freqBadge}>{FREQ_LABELS[item.frequency]}</Text>
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
  header: {
    padding: 20,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  list: { padding: 16, gap: 10 },
  listEmpty: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 6 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
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
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  freqBadge: { fontSize: 12, color: '#6b7280' },
  lastDone: { fontSize: 12, color: '#9ca3af' },
  checkBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  freqOption: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  freqOptionActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  freqOptionText: { fontSize: 13, color: '#6b7280' },
  freqOptionTextActive: { color: '#4f46e5', fontWeight: '600' },
  button: { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
