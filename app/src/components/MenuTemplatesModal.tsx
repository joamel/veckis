import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type MenuTemplate } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { shareTemplate } from '../lib/shareWeekMenu';
import { components as str, common } from '../lib/svenska';

interface Props {
  visible: boolean;
  onClose: () => void;
  householdId: string | null;
  weekYear: number;
  weekNumber: number;
  weekHasItems: boolean;
  /** Tidigare vecka: mallar kan sparas/delas men inte appliceras. */
  readOnly?: boolean;
  /** Called after a template is applied so the menu can reload. */
  onApplied: () => void;
}

export function MenuTemplatesModal({ visible, onClose, householdId, weekYear, weekNumber, weekHasItems, readOnly, onApplied }: Props) {
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
      showToast(str.menuTemplatesModal.toasts.saved);
    } catch (e) {
      showError(e, str.menuTemplatesModal.toasts.errorSave);
    } finally {
      setSaving(false);
    }
  }

  function apply(tpl: MenuTemplate) {
    const run = async (overwrite: boolean) => {
      setBusyId(tpl.id);
      try {
        const { applied } = await client.applyMenuTemplate(tpl.id, { weekYear, weekNumber, overwrite });
        showToast(str.menuTemplatesModal.toasts.applied(applied, tpl.name));
        onApplied();
        onClose();
      } catch (e) {
        showError(e, str.menuTemplatesModal.toasts.errorApply);
      } finally {
        setBusyId(null);
      }
    };
    if (weekHasItems) {
      confirm({
        title: str.menuTemplatesModal.overwrite.title,
        message: str.menuTemplatesModal.overwrite.message(tpl.name),
        buttons: [
          { label: str.menuTemplatesModal.overwrite.add, onPress: () => run(false) },
          { label: str.menuTemplatesModal.overwrite.replace, style: 'destructive', onPress: () => run(true) },
          { label: common.actions.cancel, style: 'cancel' },
        ],
      });
    } else {
      run(false);
    }
  }

  function confirmDelete(tpl: MenuTemplate) {
    confirm({
      title: str.menuTemplatesModal.deleteDialog.title,
      message: str.menuTemplatesModal.deleteDialog.message(tpl.name),
      buttons: [
        {
          label: common.actions.delete, style: 'destructive',
          onPress: async () => {
            setTemplates(prev => (prev ?? []).filter(t => t.id !== tpl.id));
            try { await client.deleteMenuTemplate(tpl.id); }
            catch (e) { showError(e, str.menuTemplatesModal.toasts.errorDelete); }
          },
        },
        { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View pointerEvents="none" style={s.overlayDim} />
      <Pressable style={s.overlay} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title}>{str.menuTemplatesModal.title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={str.menuTemplatesModal.close}><Ionicons name="close" size={24} color="#78716c" /></Pressable>
        </View>

        <ScrollView contentContainerStyle={s.body}>
          <Text style={s.sectionLabel}>{str.menuTemplatesModal.saveSection}</Text>
          <View style={s.saveRow}>
            <TextInput
              style={s.input}
              placeholder={str.menuTemplatesModal.namePlaceholder}
              placeholderTextColor="#a8a29e"
              value={name}
              onChangeText={setName}
              onSubmitEditing={save}
              returnKeyType="done"
            />
            <Pressable style={[s.saveBtn, (!name.trim() || saving) && s.saveBtnDisabled]} onPress={save} disabled={!name.trim() || saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>{str.menuTemplatesModal.save}</Text>}
            </Pressable>
          </View>
          {!weekHasItems && <Text style={s.hint}>{str.menuTemplatesModal.noItemsHint}</Text>}

          <Text style={[s.sectionLabel, { marginTop: 22 }]}>{str.menuTemplatesModal.useSection}</Text>
          {readOnly && <Text style={s.hint}>{str.menuTemplatesModal.pastWeekHint}</Text>}
          {templates === null ? (
            <ActivityIndicator color="#4e7a5e" style={{ marginTop: 16 }} />
          ) : templates.length === 0 ? (
            <Text style={s.hint}>{str.menuTemplatesModal.noTemplates}</Text>
          ) : (
            templates.map(tpl => (
              <View key={tpl.id} style={s.tplRow}>
                <Pressable style={s.tplMain} onPress={() => apply(tpl)} disabled={busyId === tpl.id || readOnly}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tplName}>{tpl.name}</Text>
                    <Text style={s.tplMeta}>{str.menuTemplatesModal.dishCount(tpl.items.length)}</Text>
                  </View>
                  {busyId === tpl.id
                    ? <ActivityIndicator color="#4e7a5e" size="small" />
                    : !readOnly && <Ionicons name="add-circle-outline" size={22} color="#4e7a5e" />}
                </Pressable>
                <Pressable style={s.tplShare} onPress={() => shareTemplate(tpl)} hitSlop={8} accessibilityRole="button" accessibilityLabel={str.menuTemplatesModal.shareA11y(tpl.name)}>
                  <Ionicons name="share-outline" size={18} color="#4e7a5e" />
                </Pressable>
                <Pressable style={s.tplDelete} onPress={() => confirmDelete(tpl)} hitSlop={8} accessibilityRole="button" accessibilityLabel={str.menuTemplatesModal.deleteA11y(tpl.name)}>
                  <Ionicons name="trash-outline" size={18} color="#a8a29e" />
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
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  overlay: { flex: 1 },
  sheet: { backgroundColor: '#f1efec', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#d6d3d1', alignSelf: 'center', marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 20, fontWeight: '700', color: '#292524' },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#a8a29e', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  saveRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#292524' },
  saveBtn: { backgroundColor: '#4e7a5e', borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 13, color: '#a8a29e', marginTop: 8, marginLeft: 4 },
  tplRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, marginBottom: 8 },
  tplMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  tplName: { fontSize: 15, fontWeight: '600', color: '#292524' },
  tplMeta: { fontSize: 13, color: '#a8a29e', marginTop: 2 },
  tplShare: { paddingHorizontal: 10, paddingVertical: 14 },
  tplDelete: { paddingHorizontal: 14, paddingVertical: 14 },
});
