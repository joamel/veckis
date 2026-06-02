import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { CATEGORY_LABELS, DEFAULT_CATEGORY_ORDER, SUB_TAXONOMY, subsForParent, type StoreCategory, type SubCategory, type Store } from '@veckis/shared';

export default function StoreDetailScreen() {
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const router = useRouter();
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { showError, showToast } = useToast();
  const confirm = useConfirm();

  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  // Synliga enum-kategorier (i ordning) + dolda räknas ut från diffen mellan
  // alla DEFAULT_CATEGORY_ORDER och visibleEnum.
  const [visibleEnum, setVisibleEnum] = useState<StoreCategory[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  // Subs som hushållet brutit ut som egna sektioner under sin parent.
  const [expandedSubs, setExpandedSubs] = useState<string[]>([]);
  // UI-state: vilka parents användaren har "fällt ut" lokalt för att se sub-listan.
  const [openParents, setOpenParents] = useState<Set<StoreCategory>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [newCustom, setNewCustom] = useState('');

  const hiddenEnum = useMemo(
    () => DEFAULT_CATEGORY_ORDER.filter(c => !visibleEnum.includes(c)),
    [visibleEnum],
  );

  const load = useCallback(async () => {
    if (!householdId || !storeId) return;
    try {
      const stores = await client.getStores(householdId);
      const found = stores.find(s => s.id === storeId) ?? null;
      setStore(found);
      if (found) {
        const order = (found.categoryOrder as StoreCategory[]).length
          ? (found.categoryOrder as StoreCategory[])
          : [...DEFAULT_CATEGORY_ORDER];
        setVisibleEnum(order);
        setCustomCategories([...((found.customCategories as string[] | undefined) ?? [])]);
        setExpandedSubs([...((found as { expandedSubs?: string[] }).expandedSubs ?? [])]);
        setDirty(false);
      }
    } catch (e) {
      showError(e, 'Kunde inte ladda butiken');
    } finally {
      setLoading(false);
    }
  }, [householdId, storeId]);

  useEffect(() => { load(); }, [load]);

  function moveEnumUp(idx: number) {
    if (idx === 0) return;
    setVisibleEnum(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    setDirty(true);
  }
  function moveEnumDown(idx: number) {
    setVisibleEnum(prev => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    setDirty(true);
  }
  function hideEnum(cat: StoreCategory) {
    setVisibleEnum(prev => prev.filter(c => c !== cat));
    setDirty(true);
  }
  function showEnum(cat: StoreCategory) {
    setVisibleEnum(prev => prev.includes(cat) ? prev : [...prev, cat]);
    setDirty(true);
  }

  function moveCustomUp(idx: number) {
    if (idx === 0) return;
    setCustomCategories(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
    setDirty(true);
  }
  function moveCustomDown(idx: number) {
    setCustomCategories(prev => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
    setDirty(true);
  }
  function removeCustom(name: string) {
    setCustomCategories(prev => prev.filter(c => c !== name));
    setDirty(true);
  }
  function toggleSubExpanded(sub: string) {
    setExpandedSubs(prev =>
      prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub],
    );
    setDirty(true);
  }
  function toggleParentOpen(p: StoreCategory) {
    setOpenParents(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function addCustom() {
    const trimmed = newCustom.trim();
    if (!trimmed) return;
    if (customCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      confirm({ title: 'Finns redan', message: `Kategorin "${trimmed}" finns redan.`, buttons: [{ label: 'OK' }] });
      return;
    }
    setCustomCategories(prev => [...prev, trimmed]);
    setNewCustom('');
    setDirty(true);
  }

  async function save() {
    if (!store) return;
    setSaving(true);
    try {
      const updated = await client.updateStore(store.id, {
        categoryOrder: visibleEnum,
        customCategories,
        expandedSubs,
      });
      setStore(updated);
      setDirty(false);
      showToast('Sparat', 'success');
    } catch (e) {
      showError(e, 'Kunde inte spara');
    } finally {
      setSaving(false);
    }
  }

  async function renameStore() {
    if (!store || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const updated = await client.updateStore(store.id, { name: renameValue.trim() });
      setStore(updated);
      setShowRename(false);
      showToast('Namn ändrat', 'success');
    } catch (e) {
      showError(e, 'Kunde inte byta namn');
    } finally {
      setRenaming(false);
    }
  }

  function deleteStore() {
    if (!store) return;
    confirm({
      title: 'Ta bort butik',
      message: `Ta bort "${store.name}"?`,
      buttons: [
        { label: 'Ta bort', style: 'destructive', onPress: async () => {
          try {
            await client.deleteStore(store.id);
            showToast(`${store.name} borttagen`, 'neutral');
            router.back();
          } catch (e) {
            showError(e, 'Kunde inte ta bort butiken');
          }
        } },
        { label: 'Avbryt', style: 'cancel' },
      ],
    });
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }
  if (!store) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={26} color="#111827" />
          </Pressable>
        </View>
        <Text style={s.empty}>Butiken kunde inte hittas.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="arrow-back" size={26} color="#111827" />
            </Pressable>
            <Text style={s.title} numberOfLines={1}>{store.name}</Text>
          </View>
          <Pressable onPress={() => setShowMenu(true)} hitSlop={8} style={s.menuBtn} accessibilityLabel="Mer">
            <Ionicons name="ellipsis-vertical" size={20} color="#111827" />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.sectionSub}>
          Ordningen matchar butikens layout. Dölj kategorier du inte använder
          och lägg till egna under "Egna kategorier".
        </Text>

        <Text style={s.sectionLabel}>SYNLIGA KATEGORIER</Text>
        <View style={s.catList}>
          {visibleEnum.length === 0 ? (
            <Text style={s.emptyHint}>Alla standardkategorier är dolda — du måste välja minst en.</Text>
          ) : (
            visibleEnum.map((cat, idx) => {
              const subs = subsForParent(cat);
              const isOpen = openParents.has(cat);
              const expandedHere = subs.filter(s => expandedSubs.includes(s)).length;
              return (
                <View key={cat}>
                  <View style={s.catRow}>
                    <Pressable
                      onPress={() => toggleParentOpen(cat)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
                      hitSlop={6}
                    >
                      <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color="#6b7280" />
                      <Text style={s.catName}>{CATEGORY_LABELS[cat] ?? cat}</Text>
                      {expandedHere > 0 && <Text style={s.expandedBadge}>{expandedHere}</Text>}
                    </Pressable>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pressable
                        style={[s.catBtn, idx === 0 && { opacity: 0.3 }]}
                        disabled={idx === 0}
                        onPress={() => moveEnumUp(idx)}
                      >
                        <Ionicons name="chevron-up" size={18} color="#4f46e5" />
                      </Pressable>
                      <Pressable
                        style={[s.catBtn, idx === visibleEnum.length - 1 && { opacity: 0.3 }]}
                        disabled={idx === visibleEnum.length - 1}
                        onPress={() => moveEnumDown(idx)}
                      >
                        <Ionicons name="chevron-down" size={18} color="#4f46e5" />
                      </Pressable>
                      <Pressable style={s.catBtnDanger} onPress={() => hideEnum(cat)}>
                        <Ionicons name="eye-off-outline" size={16} color="#ef4444" />
                      </Pressable>
                    </View>
                  </View>
                  {isOpen && subs.length > 0 && (
                    <View style={s.subList}>
                      <Text style={s.subListHint}>
                        Slå på sub-kategorier som du vill se som egna sektioner i listan. Övriga samlas under {CATEGORY_LABELS[cat]}.
                      </Text>
                      {subs.map(sub => {
                        const active = expandedSubs.includes(sub);
                        return (
                          <Pressable
                            key={sub}
                            style={s.subRow}
                            onPress={() => toggleSubExpanded(sub)}
                          >
                            <Text style={[s.subName, active && s.subNameActive]}>{SUB_TAXONOMY[sub].label}</Text>
                            <View style={[s.subToggle, active && s.subToggleActive]}>
                              {active && <Ionicons name="checkmark" size={14} color="#fff" />}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* "Egna kategorier"-UI dolt — feature ersätts av kommande 2-nivå-taxonomi
            (se BACKLOG.md "Kategorier"-sektionen). Befintliga customCategories
            kvar i schema och renderas fortfarande i list-grupperingar; bara
            input-vägen är borttagen. */}

        {hiddenEnum.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>DOLDA</Text>
            <Text style={s.sectionSub}>
              Standardkategorier du har dolt. Tryck visa-knappen för att lägga tillbaka dem sist i listan.
            </Text>
            <View style={s.catList}>
              {hiddenEnum.map(cat => (
                <View key={cat} style={[s.catRow, s.catRowMuted]}>
                  <Text style={[s.catName, s.catNameMuted]}>{CATEGORY_LABELS[cat] ?? cat}</Text>
                  <Pressable style={s.catBtn} onPress={() => showEnum(cat)}>
                    <Ionicons name="eye-outline" size={16} color="#4f46e5" />
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: dirty ? 100 : 40 }} />
      </ScrollView>

      {dirty && (
        <View style={s.saveBar}>
          <Pressable
            style={[s.primaryBtn, (saving || visibleEnum.length === 0) && { opacity: 0.4 }]}
            onPress={save}
            disabled={saving || visibleEnum.length === 0}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Spara ändringar</Text>}
          </Pressable>
        </View>
      )}

      {/* 3-prickar-meny */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={s.menuSheet}>
            <Pressable
              style={s.menuItem}
              onPress={() => { setShowMenu(false); setRenameValue(store.name); setShowRename(true); }}
            >
              <Ionicons name="create-outline" size={18} color="#111827" />
              <Text style={s.menuItemText}>Byt namn</Text>
            </Pressable>
            <Pressable
              style={s.menuItem}
              onPress={() => { setShowMenu(false); deleteStore(); }}
            >
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={[s.menuItemText, { color: '#ef4444' }]}>Ta bort butik</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Byt namn-modal */}
      <Modal visible={showRename} transparent animationType="slide" onRequestClose={() => setShowRename(false)}>
        <Pressable style={s.overlay} onPress={() => setShowRename(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ justifyContent: 'flex-end' }}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Byt namn</Text>
            <TextInput
              style={s.input}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={renameStore}
            />
            <Pressable
              style={[s.primaryBtn, (!renameValue.trim() || renaming) && { opacity: 0.4 }]}
              onPress={renameStore}
              disabled={renaming || !renameValue.trim()}
            >
              {renaming ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Spara</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', flexShrink: 1 },
  menuBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40 },
  emptyHint: { padding: 14, color: '#ef4444', fontSize: 13, textAlign: 'center' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5, marginBottom: 6 },
  sectionSub: { fontSize: 13, color: '#6b7280', marginBottom: 14, lineHeight: 18 },
  catList: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden' },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  catRowMuted: { backgroundColor: '#f9fafb' },
  catName: { fontSize: 15, color: '#111827', flex: 1 },
  catNameMuted: { color: '#9ca3af' },
  catBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef2ff' },
  catBtnDanger: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f2' },
  expandedBadge: { fontSize: 11, fontWeight: '700', color: '#7c3aed', backgroundColor: '#ede9fe', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  subList: { paddingLeft: 24, paddingRight: 14, paddingVertical: 8, backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  subListHint: { fontSize: 12, color: '#9ca3af', marginBottom: 8, lineHeight: 17 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  subName: { fontSize: 14, color: '#374151' },
  subNameActive: { color: '#7c3aed', fontWeight: '600' },
  subToggle: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  subToggleActive: { borderColor: '#7c3aed', backgroundColor: '#7c3aed' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addInput: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#111827', backgroundColor: '#fff' },
  addBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4f46e5' },
  saveBar: { position: 'absolute', left: 16, right: 16, bottom: 20 },
  primaryBtn: { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  menuOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)' },
  menuSheet: { position: 'absolute', top: 70, right: 12, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 6, minWidth: 200, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  menuItemText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, color: '#111827' },
});
