import { useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { DatePickerModal } from '../../src/components/DatePickerModal';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useHaptics } from '../../src/hooks/useHaptics';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import type { Chore, ChoreCompletion, ChoreFrequency, WeekDay } from '@veckis/shared';

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
function isFullyDone(chore: ChoreWithCompletion): boolean {
  if (chore.frequency === 'once') {
    return chore.completions.length > 0;
  }
  if (chore.days.length === 0) return false;
  const cutoff = Date.now() - 86400000;
  return chore.days.every(day =>
    chore.completions.some(c => c.day === day && new Date(c.completedAt).getTime() > cutoff)
  );
}

type Member = { id: string; clerkUserId: string; displayName: string };

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

function MemberPicker({ members, selected, onChange }: { members: Member[]; selected: string | null; onChange: (id: string | null) => void }) {
  if (members.length === 0) return null;
  return (
    <>
      <Text style={s.label}>Tilldela person</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.memberRow}>
        <Pressable
          style={[s.memberOption, selected === null && s.memberOptionActive]}
          onPress={() => onChange(null)}
        >
          <Text style={[s.memberOptionText, selected === null && s.memberOptionTextActive]}>Ingen</Text>
        </Pressable>
        {members.map(m => (
          <Pressable
            key={m.id}
            style={[s.memberOption, selected === m.clerkUserId && s.memberOptionActive]}
            onPress={() => onChange(m.clerkUserId)}
          >
            <Text style={[s.memberOptionText, selected === m.clerkUserId && s.memberOptionTextActive]}>
              {m.displayName}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

export default function ChoresScreen() {
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { medium } = useHaptics();
  const [chores, setChores] = useState<ChoreWithCompletion[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFreq, setNewFreq] = useState<ChoreFrequency>('once');
  const [newAssignedTo, setNewAssignedTo] = useState<string | null>(null);
  const [newDays, setNewDays] = useState<WeekDay[]>([]);
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editingChore, setEditingChore] = useState<ChoreWithCompletion | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFreq, setEditFreq] = useState<ChoreFrequency>('weekly');
  const [editAssignedTo, setEditAssignedTo] = useState<string | null>(null);
  const [editDays, setEditDays] = useState<WeekDay[]>([]);
  const [saving, setSaving] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [showEditRecurring, setShowEditRecurring] = useState(false);

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
      Alert.alert('Fel', 'Kunde inte ladda sysslor');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Completed chores sorted to the bottom
  const sortedChores = useMemo(() => {
    const done = chores.filter(c => isFullyDone(c));
    const notDone = chores.filter(c => !isFullyDone(c));
    return [...notDone, ...done];
  }, [chores]);

  const completedOnce = useMemo(
    () => chores.filter(c => c.frequency === 'once' && c.completions.length > 0),
    [chores]
  );

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
        days: newDays,
        startDate: newStartDate,
        endDate: newEndDate,
      });
      setChores(prev => [...prev, { ...chore, completions: [] }]);
      setShowCreate(false);
      setNewTitle('');
      setNewFreq('weekly');
      setNewAssignedTo(null);
      setNewDays([]);
      setNewStartDate(null);
      setNewEndDate(null);
    } catch {
      Alert.alert('Fel', 'Kunde inte skapa syssla');
    } finally {
      setCreating(false);
    }
  }

  function openEdit(chore: ChoreWithCompletion) {
    setEditingChore(chore);
    setEditTitle(chore.title);
    setEditFreq(chore.frequency);
    setEditAssignedTo(chore.assignedTo);
    setEditDays([...chore.days]);
    setShowEditRecurring(chore.frequency !== 'once');
    setEditStartDate(chore.startDate ?? null);
    setEditEndDate(chore.endDate ?? null);
  }

  async function saveEdit() {
    if (!editingChore || !editTitle.trim()) return;
    setSaving(true);
    try {
      const updated = await client.updateChore(editingChore.id, {
        title: editTitle.trim(),
        frequency: editFreq,
        assignedTo: editAssignedTo,
        days: editDays,
        startDate: editStartDate,
        endDate: editEndDate,
      });
      setChores(prev => prev.map(c => c.id === editingChore.id ? { ...c, ...updated } : c));
      setEditingChore(null);
    } catch {
      Alert.alert('Fel', 'Kunde inte spara ändringarna');
    } finally {
      setSaving(false);
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
            setEditingChore(null);
          } catch {
            Alert.alert('Fel', 'Kunde inte ta bort sysslan');
          }
        },
      },
    ]);
  }

  async function completeChore(chore: ChoreWithCompletion) {
    // Only once-frequency chores can be completed from this screen (no day context)
    try {
      const completion = await client.completeChore(chore.id, null);
      setChores(prev =>
        prev.map(c => c.id === chore.id ? { ...c, completions: [completion, ...c.completions] } : c)
      );
    } catch {
      Alert.alert('Fel', 'Kunde inte markera sysslan');
    }
  }

  async function uncompleteChore(chore: ChoreWithCompletion) {
    try {
      await client.uncompleteChore(chore.id);
      setChores(prev =>
        prev.map(c => c.id === chore.id
          ? { ...c, completions: c.completions.filter(comp => comp.day !== null) }
          : c)
      );
    } catch {
      Alert.alert('Fel', 'Kunde inte avmarkera sysslan');
    }
  }

  async function clearCompleted() {
    if (completedOnce.length === 0) return;
    Alert.alert(
      'Rensa klara sysslor',
      `Ta bort ${completedOnce.length} avklarade engångssyssla${completedOnce.length > 1 ? 'r' : ''}?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Rensa', style: 'destructive',
          onPress: async () => {
            await Promise.all(completedOnce.map(c => client.deleteChore(c.id).catch(() => {})));
            setChores(prev => prev.filter(c => !completedOnce.find(d => d.id === c.id)));
          },
        },
      ]
    );
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader
        title="Sysslor"
        actionNode={completedOnce.length > 0 ? (
          <Pressable style={s.clearBtn} onPress={clearCompleted}>
            <Ionicons name="trash-outline" size={14} color="#ef4444" />
            <Text style={s.clearBtnText}>Rensa klara ({completedOnce.length})</Text>
          </Pressable>
        ) : undefined}
      />

      <FlatList
        data={sortedChores}
        keyExtractor={item => item.id}
        contentContainerStyle={[s.list, sortedChores.length === 0 && s.listEmpty]}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={56} color="#d1d5db" />
            <Text style={s.emptyText}>Inga sysslor</Text>
            <Text style={s.emptySubtext}>Tryck på + för att lägga till en</Text>
          </View>
        }
        renderItem={({ item }) => {
          const lastCompletion = item.completions[0];
          const done = isFullyDone(item);
          const assignedName = getMemberName(item.assignedTo);
          return (
            <Pressable
              style={[s.card, done && s.cardDone]}
              onLongPress={() => { medium(); openEdit(item); }}
            >
              <View style={s.cardContent}>
                <Text style={[s.cardTitle, done && s.cardTitleDone]}>{item.title}</Text>
                <Text style={s.cardMeta}>
                  {[
                    FREQ_LABELS[item.frequency],
                    item.frequency !== 'daily' && item.days.length > 0
                      ? item.days.map(d => DAYS.find(x => x.key === d)?.short).join(', ')
                      : null,
                    assignedName,
                    lastCompletion ? daysSince(lastCompletion.completedAt) : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {item.frequency === 'once' && (
                <Pressable
                  style={[s.checkBtn, done && s.checkBtnDone]}
                  onPress={() => done ? uncompleteChore(item) : completeChore(item)}
                >
                  {done && <Ionicons name="checkmark" size={20} color="#fff" />}
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />

      <Pressable style={s.fab} onPress={() => setShowCreate(true)}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      {/* Create modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={s.overlay} onPress={() => setShowCreate(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Ny syssla</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetScroll}>
            <TextInput
              style={s.input}
              placeholder="Sysslans namn, t.ex. Damma"
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
              returnKeyType="done"
            />

            <Text style={s.label}>Frekvens</Text>
            <View style={s.freqRowNoWrap}>
              <Pressable
                style={[s.freqOption, newFreq === 'once' && s.freqOptionActive]}
                onPress={() => { setNewFreq('once'); setShowRecurring(false); }}
              >
                <Text style={[s.freqOptionText, newFreq === 'once' && s.freqOptionTextActive]}>En gång</Text>
              </Pressable>
              <Pressable
                style={[s.freqOption, newFreq !== 'once' && s.freqOptionActive]}
                onPress={() => setShowRecurring(v => !v)}
              >
                <Text style={[s.freqOptionText, newFreq !== 'once' && s.freqOptionTextActive]}>
                  {newFreq !== 'once' ? FREQ_LABELS[newFreq] : 'Återkommande'}{' '}
                  <Text style={s.freqChevron}>{showRecurring ? '▲' : '▼'}</Text>
                </Text>
              </Pressable>
            </View>
            {showRecurring && (
              <View style={s.freqRow}>
                {(['daily', 'weekly', 'biweekly', 'monthly'] as ChoreFrequency[]).map(f => (
                  <Pressable
                    key={f}
                    style={[s.freqOption, { width: '47%' }, newFreq === f && s.freqOptionActive]}
                    onPress={() => { setNewFreq(f); if (f === 'daily') setNewDays([]); }}
                  >
                    <Text style={[s.freqOptionText, newFreq === f && s.freqOptionTextActive]}>
                      {FREQ_LABELS[f]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <MemberPicker members={members} selected={newAssignedTo} onChange={setNewAssignedTo} />

            {newFreq !== 'daily' && newFreq !== 'once' && (
              <>
                <Text style={s.label}>Dagar i schemat (valfritt)</Text>
                <DayPicker selected={newDays} onChange={setNewDays} />
              </>
            )}

            {newFreq !== 'once' && (
              <>
                <Text style={s.label}>Giltighetstid (valfritt)</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable style={[s.dateBtn, newStartDate && s.dateBtnSet]} onPress={() => setShowNewStartPicker(true)}>
                    <Ionicons name="calendar-outline" size={14} color={newStartDate ? '#4f46e5' : '#9ca3af'} />
                    <Text style={[s.dateBtnText, newStartDate && s.dateBtnTextSet]}>{newStartDate ?? 'Från'}</Text>
                  </Pressable>
                  <Pressable style={[s.dateBtn, newEndDate && s.dateBtnSet]} onPress={() => setShowNewEndPicker(true)}>
                    <Ionicons name="calendar-outline" size={14} color={newEndDate ? '#4f46e5' : '#9ca3af'} />
                    <Text style={[s.dateBtnText, newEndDate && s.dateBtnTextSet]}>{newEndDate ?? 'Till'}</Text>
                  </Pressable>
                </View>
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
      </Modal>

      <DatePickerModal value={newStartDate} onChange={setNewStartDate} onClose={() => setShowNewStartPicker(false)} title="Startdatum" visible={showNewStartPicker} />
      <DatePickerModal value={newEndDate} onChange={setNewEndDate} onClose={() => setShowNewEndPicker(false)} title="Slutdatum" visible={showNewEndPicker} />
      <DatePickerModal value={editStartDate} onChange={setEditStartDate} onClose={() => setShowEditStartPicker(false)} title="Startdatum" visible={showEditStartPicker} />
      <DatePickerModal value={editEndDate} onChange={setEditEndDate} onClose={() => setShowEditEndPicker(false)} title="Slutdatum" visible={showEditEndPicker} />

      {/* Edit modal */}
      <Modal visible={!!editingChore} transparent animationType="slide" onRequestClose={() => setEditingChore(null)}>
        <Pressable style={s.overlay} onPress={() => setEditingChore(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Redigera syssla</Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetScroll}>
            <TextInput
              style={s.input}
              placeholder="Sysslans namn"
              value={editTitle}
              onChangeText={setEditTitle}
              returnKeyType="done"
            />

            <Text style={s.label}>Frekvens</Text>
            <View style={s.freqRowNoWrap}>
              <Pressable
                style={[s.freqOption, editFreq === 'once' && s.freqOptionActive]}
                onPress={() => { setEditFreq('once'); setShowEditRecurring(false); }}
              >
                <Text style={[s.freqOptionText, editFreq === 'once' && s.freqOptionTextActive]}>En gång</Text>
              </Pressable>
              <Pressable
                style={[s.freqOption, editFreq !== 'once' && s.freqOptionActive]}
                onPress={() => setShowEditRecurring(v => !v)}
              >
                <Text style={[s.freqOptionText, editFreq !== 'once' && s.freqOptionTextActive]}>
                  {editFreq !== 'once' ? FREQ_LABELS[editFreq] : 'Återkommande'}{' '}
                  <Text style={s.freqChevron}>{showEditRecurring ? '▲' : '▼'}</Text>
                </Text>
              </Pressable>
            </View>
            {showEditRecurring && (
              <View style={s.freqRow}>
                {(['daily', 'weekly', 'biweekly', 'monthly'] as ChoreFrequency[]).map(f => (
                  <Pressable
                    key={f}
                    style={[s.freqOption, { width: '47%' }, editFreq === f && s.freqOptionActive]}
                    onPress={() => { setEditFreq(f); if (f === 'daily') setEditDays([]); }}
                  >
                    <Text style={[s.freqOptionText, editFreq === f && s.freqOptionTextActive]}>
                      {FREQ_LABELS[f]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <MemberPicker members={members} selected={editAssignedTo} onChange={setEditAssignedTo} />

            {editFreq !== 'daily' && editFreq !== 'once' && (
              <>
                <Text style={s.label}>Dagar i schemat</Text>
                <DayPicker selected={editDays} onChange={setEditDays} />
              </>
            )}

            {editFreq !== 'once' && (
              <>
                <Text style={s.label}>Giltighetstid (valfritt)</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable style={[s.dateBtn, editStartDate && s.dateBtnSet]} onPress={() => setShowEditStartPicker(true)}>
                    <Ionicons name="calendar-outline" size={14} color={editStartDate ? '#4f46e5' : '#9ca3af'} />
                    <Text style={[s.dateBtnText, editStartDate && s.dateBtnTextSet]}>{editStartDate ?? 'Från'}</Text>
                  </Pressable>
                  <Pressable style={[s.dateBtn, editEndDate && s.dateBtnSet]} onPress={() => setShowEditEndPicker(true)}>
                    <Ionicons name="calendar-outline" size={14} color={editEndDate ? '#4f46e5' : '#9ca3af'} />
                    <Text style={[s.dateBtnText, editEndDate && s.dateBtnTextSet]}>{editEndDate ?? 'Till'}</Text>
                  </Pressable>
                </View>
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
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#9ca3af', marginTop: 6 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardDone: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' },
  cardContent: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardTitleDone: { textDecorationLine: 'line-through', color: '#9ca3af' },
  cardMeta: { fontSize: 12, color: '#6b7280', marginTop: 4, flexWrap: 'wrap' },
  checkBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#d1d5db', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkBtnDone: { backgroundColor: '#10b981', borderColor: '#10b981' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 0, maxHeight: '85%' },
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
  memberRow: { flexDirection: 'row', gap: 8 },
  memberOption: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', flexShrink: 0 },
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
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  deleteBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '500' },
  dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  dateBtnSet: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  dateBtnText: { fontSize: 13, color: '#9ca3af', flex: 1 },
  dateBtnTextSet: { color: '#4f46e5', fontWeight: '600' },
});
