import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useDesign } from '../context/DesignContext';
import { ny, nyFont } from '../lib/nyDesign';
import type { Palette } from '../lib/theme';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type MenuTemplate } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { shareTemplate } from '../lib/shareWeekMenu';
import { components as str, common } from '../lib/svenska';
import { DraggableBottomSheet } from './DraggableBottomSheet';
import { SHEET_HEADER_ICON } from './SheetHeader';
import { useSheetLift } from '../hooks/useSheetLift';

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
  const { colors: c } = useTheme();
  const { nyDesign } = useDesign();
  const s = useMemo(() => makeStyles(c, nyDesign), [c, nyDesign]);
  const client = useApiClient();
  const { showToast, showError } = useToast();
  const confirm = useConfirm();
  // Utan detta doldes fältet bakom tangentbordet — varje annan sheet med ett
  // textfält använder useSheetLift, den här hade bara aldrig fått det.
  const { sheetLift, onFocusInput } = useSheetLift();
  const nameRef = useRef<TextInput>(null);
  const [templates, setTemplates] = useState<MenuTemplate[] | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (visible && householdId) {
      // Ett slängt namn ska inte ligga kvar nästa gång arket öppnas.
      setName('');
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
    <DraggableBottomSheet isDirty={name.trim() !== ''} visible={visible} onRequestClose={onClose} liftOffset={sheetLift} sheetStyle={s.sheet}
      title={str.menuTemplatesModal.title}
      headerRight={
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={str.menuTemplatesModal.close}>
          <Ionicons name="close" size={24} color={SHEET_HEADER_ICON} />
        </Pressable>
      }
    >
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" scrollEnabled>
          <Text style={s.sectionLabel}>{str.menuTemplatesModal.saveSection}</Text>
          <View style={s.saveRow}>
            <TextInput
              ref={nameRef}
              onFocus={onFocusInput(nameRef)}
              style={s.input}
              placeholder={str.menuTemplatesModal.namePlaceholder}
              placeholderTextColor={c.textFaint}
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
            <ActivityIndicator color={c.primary} style={{ marginTop: 16 }} />
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
                    ? <ActivityIndicator color={c.primary} size="small" />
                    : !readOnly && <Ionicons name="add-circle-outline" size={22} color={nyDesign ? ny.skog : c.primary} />}
                </Pressable>
                <Pressable style={s.tplShare} onPress={() => shareTemplate(tpl)} hitSlop={8} accessibilityRole="button" accessibilityLabel={str.menuTemplatesModal.shareA11y(tpl.name)}>
                  <Ionicons name="share-outline" size={18} color={nyDesign ? ny.skog : c.primary} />
                </Pressable>
                <Pressable style={s.tplDelete} onPress={() => confirmDelete(tpl)} hitSlop={8} accessibilityRole="button" accessibilityLabel={str.menuTemplatesModal.deleteA11y(tpl.name)}>
                  <Ionicons name="trash-outline" size={18} color={nyDesign ? ny.textDampad : c.textFaint} />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
    </DraggableBottomSheet>
  );
}

// nyD: den nya designen (beta) skriver over de stilar som skiljer.
const makeStyles = (c: Palette, nyD = false) => StyleSheet.create({
  // Bakgrund, rundning, rubrik och padding kommer från DraggableBottomSheet.
  sheet: { maxHeight: '85%' },
  body: { paddingBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: nyD ? ny.textDampad : c.textFaint, letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
  saveRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: nyD ? ny.ljus : c.inputBg, borderRadius: nyD ? 14 : 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: nyD ? ny.text : c.text },
  saveBtn: { backgroundColor: nyD ? ny.skog : c.primary, borderRadius: nyD ? 14 : 10, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: nyD ? ny.lime : '#fff', fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 13, color: nyD ? ny.textDampad : c.textFaint, marginTop: 8, marginLeft: 4 },
  tplRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: nyD ? ny.ljus : c.surfaceSubtle, borderRadius: nyD ? 16 : 12, marginBottom: 8 },
  tplMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  tplName: nyD
    ? { fontFamily: nyFont.halvfet, fontWeight: 'normal', fontSize: 15, color: ny.text }
    : { fontSize: 15, fontWeight: '600', color: c.text },
  tplMeta: { fontSize: 13, color: nyD ? ny.textDampad : c.textFaint, marginTop: 2 },
  tplShare: { paddingHorizontal: 10, paddingVertical: 14 },
  tplDelete: { paddingHorizontal: 14, paddingVertical: 14 },
});
