import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useTablet } from '../../src/hooks/useTablet';
import { useHaptics } from '../../src/hooks/useHaptics';
import { EmptyState } from '../../src/components/EmptyState';
import { CATEGORY_LABELS, DEFAULT_CATEGORY_ORDER, type StoreCategory, type Store } from '@veckis/shared';

type SortMode = 'name' | 'created';

export default function StoresScreen() {
  const router = useRouter();
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { showError, showToast } = useToast();
  const confirm = useConfirm();
  const { fs, sp } = useTablet();
  const { medium } = useHaptics();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [showSort, setShowSort] = useState(false);

  // Create / edit-name
  const [showCreate, setShowCreate] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingStoreName, setEditingStoreName] = useState<string | null>(null);
  const [editStoreNameValue, setEditStoreNameValue] = useState('');
  const [savingStoreName, setSavingStoreName] = useState(false);

  // Edit-categories
  const [editingCategoryStore, setEditingCategoryStore] = useState<Store | null>(null);
  const [editCategoryOrder, setEditCategoryOrder] = useState<StoreCategory[]>([]);
  const [savingCategoryOrder, setSavingCategoryOrder] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const inputRef = useRef<TextInput | null>(null);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const list = await client.getStores(householdId);
      setStores(list);
    } catch (e) {
      showError(e, 'Kunde inte ladda butiker');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); return () => setEditMode(false); }, [load]));
  useEffect(() => { load(); }, [load]);

  const filteredSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q ? stores.filter(s => s.name.toLowerCase().includes(q)) : stores;
    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name, 'sv');
      // 'created' = i originalordning (API returnerar i createdAt asc)
      return 0;
    });
    return sorted;
  }, [stores, searchQuery, sortMode]);

  async function createStore() {
    if (!householdId || !newStoreName.trim()) return;
    setCreating(true);
    try {
      const store = await client.createStore({ householdId, name: newStoreName.trim() });
      setStores(prev => [...prev, store]);
      setNewStoreName('');
      setShowCreate(false);
      showToast(`${store.name} skapad`, 'success');
    } catch (e) {
      showError(e, 'Kunde inte skapa butik');
    } finally {
      setCreating(false);
    }
  }

  async function saveStoreName(storeId: string) {
    if (!editStoreNameValue.trim()) return;
    setSavingStoreName(true);
    try {
      const updated = await client.updateStore(storeId, { name: editStoreNameValue.trim() });
      setStores(prev => prev.map(s => s.id === updated.id ? updated : s));
      setEditingStoreName(null);
    } catch (e) {
      showError(e, 'Kunde inte byta namn');
    } finally {
      setSavingStoreName(false);
    }
  }

  function openCategoryEditor(store: Store) {
    setEditingCategoryStore(store);
    setEditCategoryOrder(
      (store.categoryOrder as StoreCategory[]).length
        ? store.categoryOrder as StoreCategory[]
        : [...DEFAULT_CATEGORY_ORDER],
    );
  }

  function moveCategoryUp(idx: number) {
    if (idx === 0) return;
    setEditCategoryOrder(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }
  function moveCategoryDown(idx: number) {
    setEditCategoryOrder(prev => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  async function saveCategoryOrder() {
    if (!editingCategoryStore) return;
    setSavingCategoryOrder(true);
    try {
      const updated = await client.updateStore(editingCategoryStore.id, { categoryOrder: editCategoryOrder });
      setStores(prev => prev.map(s => s.id === updated.id ? updated : s));
      setEditingCategoryStore(null);
    } catch (e) {
      showError(e, 'Kunde inte spara ordning');
    } finally {
      setSavingCategoryOrder(false);
    }
  }

  async function deleteStore(storeId: string, storeName: string) {
    confirm({
      title: 'Ta bort butik',
      message: `Ta bort "${storeName}"?`,
      buttons: [
        { label: 'Ta bort', style: 'destructive', onPress: async () => {
          try {
            await client.deleteStore(storeId);
            setStores(prev => prev.filter(s => s.id !== storeId));
            showToast(`${storeName} borttagen`, 'neutral');
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

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="arrow-back" size={26} color="#111827" />
            </Pressable>
            <Text style={s.title}>Butiker</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => setEditMode(v => !v)} hitSlop={8} style={[s.sortBtn, editMode && s.sortBtnActive]}>
              <Ionicons name={editMode ? 'checkmark' : 'create-outline'} size={18} color="#4f46e5" />
            </Pressable>
            <Pressable onPress={() => setShowSort(true)} hitSlop={8} style={s.sortBtn} accessibilityLabel="Sortera butiker">
              <Ionicons name="swap-vertical" size={18} color="#4f46e5" />
            </Pressable>
          </View>
        </View>
        <View style={s.searchRow}>
          <Ionicons name="search" size={16} color="#9ca3af" style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            placeholder="Sök butik…"
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 }}>
        {filteredSorted.length === 0 ? (
          searchQuery ? (
            <Text style={s.empty}>Inga butiker matchar "{searchQuery}"</Text>
          ) : (
            <EmptyState
              icon="storefront-outline"
              title="Inga butiker än"
              subtitle="Lägg till en butik så kan dina inköpslistor sorteras efter butikens layout."
              actionLabel="Lägg till butik"
              onAction={() => setShowCreate(true)}
            />
          )
        ) : (
          filteredSorted.map(store => {
            const catCount = (store.categoryOrder as StoreCategory[]).length || DEFAULT_CATEGORY_ORDER.length;
            const isEditingName = editingStoreName === store.id;
            return (
              <View key={store.id} style={s.card}>
                <Pressable
                  style={s.cardMain}
                  onPress={() => { if (!editMode && !isEditingName) openCategoryEditor(store); }}
                  onLongPress={() => { medium(); setEditMode(true); }}
                  disabled={isEditingName}
                >
                  <View style={s.cardIcon}>
                    <Ionicons name="storefront-outline" size={20} color="#4f46e5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    {isEditingName ? (
                      <TextInput
                        ref={inputRef}
                        style={s.cardEditInput}
                        value={editStoreNameValue}
                        onChangeText={setEditStoreNameValue}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => saveStoreName(store.id)}
                      />
                    ) : (
                      <>
                        <Text style={s.cardTitle}>{store.name}</Text>
                        <Text style={s.cardMeta}>{catCount} kategorier</Text>
                      </>
                    )}
                  </View>
                  {!editMode && !isEditingName && <Ionicons name="chevron-forward" size={18} color="#d1d5db" />}
                </Pressable>
                {(editMode || isEditingName) && (
                  <View style={s.cardActions}>
                    {isEditingName ? (
                      <Pressable
                        style={s.cardActionBtn}
                        onPress={() => saveStoreName(store.id)}
                        disabled={savingStoreName}
                      >
                        {savingStoreName ? <ActivityIndicator size="small" color="#4f46e5" /> : <Ionicons name="checkmark" size={18} color="#4f46e5" />}
                      </Pressable>
                    ) : (
                      <Pressable
                        style={s.cardActionBtn}
                        onPress={() => { setEditingStoreName(store.id); setEditStoreNameValue(store.name); }}
                      >
                        <Ionicons name="pencil-outline" size={18} color="#6b7280" />
                      </Pressable>
                    )}
                    {!isEditingName && (
                      <Pressable
                        style={s.cardActionBtn}
                        onPress={() => deleteStore(store.id, store.name)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <Pressable style={s.fab} onPress={() => setShowCreate(true)}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      {/* Skapa-modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={s.overlay} onPress={() => setShowCreate(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ justifyContent: 'flex-end' }}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Ny butik</Text>
            <TextInput
              style={s.input}
              placeholder="t.ex. Ica, Coop, Willys…"
              placeholderTextColor="#9ca3af"
              value={newStoreName}
              onChangeText={setNewStoreName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createStore}
            />
            <Pressable
              style={[s.primaryBtn, (!newStoreName.trim() || creating) && { opacity: 0.4 }]}
              onPress={createStore}
              disabled={creating || !newStoreName.trim()}
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Skapa</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Sort-modal */}
      <Modal visible={showSort} transparent animationType="slide" onRequestClose={() => setShowSort(false)}>
        <Pressable style={s.overlay} onPress={() => setShowSort(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Sortera</Text>
          {[
            { v: 'name' as const, label: 'A–Ö' },
            { v: 'created' as const, label: 'I tilläggsordning' },
          ].map(o => (
            <Pressable
              key={o.v}
              style={s.sortRow}
              onPress={() => { setSortMode(o.v); setShowSort(false); }}
            >
              <Text style={s.sortRowText}>{o.label}</Text>
              {sortMode === o.v && <Ionicons name="checkmark" size={20} color="#4f46e5" />}
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* Kategori-editor */}
      <Modal visible={!!editingCategoryStore} transparent animationType="slide" onRequestClose={() => setEditingCategoryStore(null)}>
        <Pressable style={s.overlay} onPress={() => setEditingCategoryStore(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Kategorier · {editingCategoryStore?.name}</Text>
          <Text style={s.sheetSub}>Ordningen matchar butikens layout — pilarna flyttar uppåt/nedåt.</Text>
          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            {editCategoryOrder.map((cat, idx) => (
              <View key={cat} style={s.catRow}>
                <Text style={s.catName}>{CATEGORY_LABELS[cat] ?? cat}</Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <Pressable
                    style={[s.catBtn, idx === 0 && { opacity: 0.3 }]}
                    disabled={idx === 0}
                    onPress={() => moveCategoryUp(idx)}
                  >
                    <Ionicons name="chevron-up" size={18} color="#4f46e5" />
                  </Pressable>
                  <Pressable
                    style={[s.catBtn, idx === editCategoryOrder.length - 1 && { opacity: 0.3 }]}
                    disabled={idx === editCategoryOrder.length - 1}
                    onPress={() => moveCategoryDown(idx)}
                  >
                    <Ionicons name="chevron-down" size={18} color="#4f46e5" />
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable
            style={[s.primaryBtn, savingCategoryOrder && { opacity: 0.4 }]}
            onPress={saveCategoryOrder}
            disabled={savingCategoryOrder}
          >
            {savingCategoryOrder ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Spara</Text>}
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  sortBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef2ff' },
  sortBtnActive: { backgroundColor: '#c7d2fe' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  searchIcon: {},
  searchInput: { flex: 1, fontSize: 15, color: '#111827', paddingVertical: 4 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40 },
  card: { backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden' },
  cardMain: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  cardEditInput: { fontSize: 16, fontWeight: '600', color: '#111827', borderBottomWidth: 1, borderBottomColor: '#a78bfa', paddingVertical: 2 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  cardActionBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  sheetSub: { fontSize: 13, color: '#6b7280', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, color: '#111827' },
  primaryBtn: { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sortRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  sortRowText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  catName: { fontSize: 15, color: '#111827' },
  catBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef2ff' },
});
