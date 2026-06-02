import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type MenuTemplate } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  householdId: string | null;
  weekYear: number;
  weekNumber: number;
  weekHasItems: boolean;
  /** Called after a template is applied so the menu can reload. */
  onApplied: () => void;
}

export function MenuTemplatesModal({ visible, onClose, householdId, weekYear, weekNumber, weekHasItems, onApplied }: Props) {
  const client = useApiClient();
  const { showToast, showError } = useToast();
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<MenuTemplate[] | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (visible && householdId) {
      setTemplates(null);
      client.getMenuTemplates(householdId).then(setTemplates).catch(() => setTemplates([]));
    }
  }, [visible, householdId]);

  async function save() {
    if (!householdId || !name.trim()) return;
    setSaving(true);
    try {
      const tpl = await client.saveMenuTemplate({ householdId, name: name.trim(), weekYear, weekNumber });
      setTemplates(prev => [tpl, ...(prev ?? [])]);
      setName('');
      showToast('Vecka sparad som mall');
    } catch (e) {
      showError(e, 'Kunde inte spara mallen');
    } finally {
      setSaving(false);
    }
  }

  function apply(tpl: MenuTemplate) {
    const run = async (overwrite: boolean) => {
      setBusyId(tpl.id);
      try {
        const { applied } = await client.applyMenuTemplate(tpl.id, { weekYear, weekNumber, overwrite });
        showToast(`${applied} ${applied === 1 ? 'rätt' : 'rätter'} tillagda från "${tpl.name}"`);
        onApplied();
        onClose();
      } catch (e) {
        showError(e, 'Kunde inte använda mallen');
      } finally {
        setBusyId(null);
      }
    };
    if (weekHasItems) {
      confirm({
        title: 'Veckan har redan rätter',
        message: `Vill du ersätta veckans meny med "${tpl.name}", eller lägga till utöver de befintliga?`,
        buttons: [
          { label: 'Lägg till', onPress: () => run(false) },
          { label: 'Ersätt', style: 'destructive', onPress: () => run(true) },
          { label: 'Avbryt', style: 'cancel' },
        ],
      });
    } else {
      run(false);
    }
  }

  function confirmDelete(tpl: MenuTemplate) {
    confirm({
      title: 'Ta bort mall',
      message: `Ta bort mallen "${tpl.name}"?`,
      buttons: [
        {
          label: 'Ta bort', style: 'destructive',
          onPress: async () => {
            setTemplates(prev => (prev ?? []).filter(t => t.id !== tpl.id));
            try { await client.deleteMenuTemplate(tpl.id); }
            catch (e) { showError(e, 'Kunde inte ta bort mallen'); }
          },
        },
        { label: 'Avbryt', style: 'cancel' },
      ],
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title}>Veckomeny-mallar</Text>
          <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#6b7280" /></Pressable>
        </View>

        <ScrollView contentContainerStyle={s.body}>
          <Text style={s.sectionLabel}>SPARA DENNA VECKA</Text>
          <View style={s.saveRow}>
            <TextInput
              style={s.input}
              placeholder="Mallnamn, t.ex. Standardvecka"
              placeholderTextColor="#9ca3af"
              value={name}
              onChangeText={setName}
              onSubmitEditing={save}
              returnKeyType="done"
            />
            <Pressable style={[s.saveBtn, (!name.trim() || saving) && s.saveBtnDisabled]} onPress={save} disabled={!name.trim() || saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Spara</Text>}
            </Pressable>
          </View>
          {!weekHasItems && <Text style={s.hint}>Den här veckan har inga rätter att spara än.</Text>}

          <Text style={[s.sectionLabel, { marginTop: 22 }]}>ANVÄND EN MALL</Text>
          {templates === null ? (
            <ActivityIndicator color="#4f46e5" style={{ marginTop: 16 }} />
          ) : templates.length === 0 ? (
            <Text style={s.hint}>Inga mallar än. Spara en vecka ovan för att skapa din första.</Text>
          ) : (
            templates.map(tpl => (
              <View key={tpl.id} style={s.tplRow}>
                <Pressable style={s.tplMain} onPress={() => apply(tpl)} disabled={busyId === tpl.id}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tplName}>{tpl.name}</Text>
                    <Text style={s.tplMeta}>{tpl.items.length} {tpl.items.length === 1 ? 'rätt' : 'rätter'}</Text>
                  </View>
                  {busyId === tpl.id
                    ? <ActivityIndicator color="#4f46e5" size="small" />
                    : <Ionicons name="add-circle-outline" size={22} color="#4f46e5" />}
                </Pressable>
                <Pressable style={s.tplDelete} onPress={() => confirmDelete(tpl)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#f3f4f6', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', alignSelf: 'center', marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  saveRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  saveBtn: { backgroundColor: '#4f46e5', borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 13, color: '#9ca3af', marginTop: 8, marginLeft: 4 },
  tplRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, marginBottom: 8 },
  tplMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  tplName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  tplMeta: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  tplDelete: { paddingHorizontal: 14, paddingVertical: 14 },
});
