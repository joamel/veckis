import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useApiClient, type ShoppingListWithItems } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { EmptyState } from '../../src/components/EmptyState';
import { useHaptics } from '../../src/hooks/useHaptics';
import { useTablet } from '../../src/hooks/useTablet';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { onShoppingChanged } from '../../src/lib/shoppingEvents';
import { useHouseholdSocket } from '../../src/hooks/useHouseholdSocket';
import { useAuth } from '@clerk/clerk-expo';
import { CATEGORY_LABELS, DEFAULT_CATEGORY_ORDER, type StoreCategory, type Store } from '@veckis/shared';

export default function ShoppingScreen() {
  const router = useRouter();
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { showError } = useToast();
  const confirm = useConfirm();
  const { medium } = useHaptics();
  const { fs, sp } = useTablet();
  const [lists, setLists] = useState<ShoppingListWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListStoreId, setNewListStoreId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Store management
  const [stores, setStores] = useState<Store[]>([]);
  const [showStoresModal, setShowStoresModal] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [creatingStore, setCreatingStore] = useState(false);
  const [editingStoreName, setEditingStoreName] = useState<string | null>(null);
  const [editStoreNameValue, setEditStoreNameValue] = useState('');
  const [savingStoreName, setSavingStoreName] = useState(false);
  const [editingCategoryStore, setEditingCategoryStore] = useState<Store | null>(null);
  const [editCategoryOrder, setEditCategoryOrder] = useState<StoreCategory[]>([]);
  const [savingCategoryOrder, setSavingCategoryOrder] = useState(false);

  const [editMode, setEditMode] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const [data, storeList] = await Promise.all([
        client.getShoppingLists(householdId),
        client.getStores(householdId),
      ]);
      setLists(data);
      setStores(storeList);
    } catch {
      confirm({ title: 'Fel', message: 'Kunde inte ladda inköpslistor', buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); return () => setEditMode(false); }, [load]));
  // Refresh when a list changes elsewhere (e.g. deferred clear in the detail view).
  useEffect(() => onShoppingChanged(load), [load]);

  // Live cross-device refresh: the backend emits shopping_list_updated on the
  // household socket when any list's items change, so the overview counts update
  // without waiting for tab focus. Debounced — one mutation can emit several events.
  const { getToken } = useAuth();
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useHouseholdSocket(householdId, getToken, (msg) => {
    if (msg.type === 'shopping_list_updated') {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => load(), 350);
    }
  });

  async function createList() {
    if (!householdId || !newListName.trim()) return;
    setCreating(true);
    try {
      const list = await client.createShoppingList({ householdId, name: newListName.trim(), storeId: newListStoreId ?? undefined });
      setShowModal(false);
      setNewListName('');
      setNewListStoreId(null);
      router.push(`/shopping/${list.id}` as never);
    } catch (e) {
      showError(e, 'Kunde inte skapa lista');
    } finally {
      setCreating(false);
    }
  }

  async function createStore() {
    if (!householdId || !newStoreName.trim()) return;
    setCreatingStore(true);
    try {
      const store = await client.createStore({ householdId, name: newStoreName.trim() });
      setStores(prev => [...prev, store]);
      setNewStoreName('');
    } catch (e) {
      showError(e, 'Kunde inte skapa butik');
    } finally {
      setCreatingStore(false);
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
        : [...DEFAULT_CATEGORY_ORDER]
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
        {
          label: 'Ta bort', style: 'destructive',
          onPress: async () => {
            try {
              await client.deleteStore(storeId);
              setStores(prev => prev.filter(s => s.id !== storeId));
            } catch (e) {
              showError(e, 'Kunde inte ta bort butiken');
            }
          },
        },
        { label: 'Avbryt', style: 'cancel' },
      ],
    });
  }

  async function deleteList(listId: string, listName: string) {
    confirm({
      title: 'Ta bort lista',
      message: `Ta bort "${listName}"?`,
      buttons: [
        {
          label: 'Ta bort',
          style: 'destructive',
          onPress: async () => {
            try {
              await client.deleteShoppingList(listId);
              setLists(prev => prev.filter(l => l.id !== listId));
            } catch (e) {
              showError(e, 'Kunde inte ta bort lista');
            }
          },
        },
        { label: 'Avbryt', style: 'cancel' },
      ],
    });
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title="Inköp"
        actionIcon="storefront-outline"
        actionLabel="Butiker"
        onActionPress={() => setShowStoresModal(true)}
      />

      <FlatList
        data={lists}
        keyExtractor={item => item.id}
        extraData={editMode}
        contentContainerStyle={[styles.list, lists.length === 0 && styles.listEmpty]}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          <EmptyState
            icon="cart-outline"
            title="Inga aktiva listor"
            subtitle="Skapa en inköpslista så kan ni bocka av varor tillsammans."
            actionLabel="Ny lista"
            onAction={() => setShowModal(true)}
          />
        }
        renderItem={({ item }) => {
          const unchecked = item.items.filter(i => !i.isChecked).length;
          const total = item.items.length;
          return (
            <View style={styles.cardWrap}>
              <Pressable
                style={styles.card}
                onPress={() => { if (!editMode) router.push(`/shopping/${item.id}` as never); }}
                onLongPress={() => { medium(); setEditMode(true); }}
              >
                <View style={styles.cardLeft}>
                  <Ionicons name="cart-outline" size={fs(20)} color="#4f46e5" />
                </View>
                <View style={styles.cardContent}>
                  <Text style={[styles.cardTitle, { fontSize: fs(16) }]}>{item.name}</Text>
                  <Text style={[styles.cardMeta, { fontSize: fs(13) }]}>
                    {item.store ? `${item.store.name} · ` : ''}
                    {total === 0 ? 'Tom' : unchecked === 0 ? 'Allt bockat' : `${unchecked} av ${total} kvar`}
                  </Text>
                </View>
                {unchecked === 0 && total > 0 && (
                  <Ionicons name="checkmark-circle" size={fs(20)} color="#10b981" />
                )}
                {!editMode && <Ionicons name="chevron-forward" size={fs(18)} color="#d1d5db" />}
              </Pressable>
              {editMode && (
                <Pressable style={styles.cardDeleteBtn} onPress={() => deleteList(item.id, item.name)}>
                  <Ionicons name="remove-circle" size={fs(22)} color="#ef4444" />
                </Pressable>
              )}
            </View>
          );
        }}
      />

      {editMode ? (
        <Pressable style={styles.editDoneBtn} onPress={() => setEditMode(false)}>
          <Text style={[styles.editDoneBtnText, { fontSize: fs(16) }]}>Klar</Text>
        </Pressable>
      ) : (
        <Pressable style={[styles.fab, { width: sp(56), height: sp(56), borderRadius: sp(28) }]} onPress={() => setShowModal(true)}>
          <Ionicons name="add" size={fs(30)} color="#fff" />
        </Pressable>
      )}

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => { setShowModal(false); setNewListStoreId(null); }}>
        <Pressable style={styles.overlay} onPress={() => { setShowModal(false); setNewListStoreId(null); }} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Ny inköpslista</Text>
            <TextInput
              style={styles.input}
              placeholder="Listans namn, t.ex. ICA fredag"
              placeholderTextColor="#9ca3af"
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createList}
            />
            {stores.length > 0 && (
              <>
                <Text style={styles.pickStoreLabel}>Butik (valfritt)</Text>
                <View style={styles.storeChips}>
                  {stores.map(store => (
                    <Pressable
                      key={store.id}
                      style={[styles.storeChip, newListStoreId === store.id && styles.storeChipActive]}
                      onPress={() => setNewListStoreId(prev => prev === store.id ? null : store.id)}
                    >
                      <Text style={[styles.storeChipText, newListStoreId === store.id && styles.storeChipTextActive]}>
                        {store.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <Pressable
              style={[styles.button, !newListName.trim() && styles.buttonDisabled]}
              onPress={createList}
              disabled={creating || !newListName.trim()}
            >
              {creating
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Skapa lista</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* Stores modal */}
      <Modal visible={showStoresModal} transparent animationType="slide" onRequestClose={() => setShowStoresModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowStoresModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ justifyContent: 'flex-end' }}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Butiker</Text>
          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            {stores.length === 0 && (
              <Text style={styles.storesEmpty}>Inga butiker tillagda än</Text>
            )}
            {stores.map(store => (
              <View key={store.id} style={styles.storeRow}>
                {editingStoreName === store.id ? (
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={editStoreNameValue}
                    onChangeText={setEditStoreNameValue}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => saveStoreName(store.id)}
                  />
                ) : (
                  <Text style={styles.storeName}>{store.name}</Text>
                )}
                <View style={styles.storeActions}>
                  {editingStoreName === store.id ? (
                    <Pressable
                      style={[styles.storeActionBtn, savingStoreName && { opacity: 0.4 }]}
                      onPress={() => saveStoreName(store.id)}
                      disabled={savingStoreName}
                    >
                      {savingStoreName
                        ? <ActivityIndicator size="small" color="#4f46e5" />
                        : <Ionicons name="checkmark" size={18} color="#4f46e5" />}
                    </Pressable>
                  ) : (
                    <Pressable
                      style={styles.storeActionBtn}
                      onPress={() => { setEditingStoreName(store.id); setEditStoreNameValue(store.name); }}
                    >
                      <Ionicons name="pencil-outline" size={18} color="#6b7280" />
                    </Pressable>
                  )}
                  <Pressable
                    style={styles.storeActionBtn}
                    onPress={() => { setShowStoresModal(false); openCategoryEditor(store); }}
                  >
                    <Ionicons name="options-outline" size={18} color="#6b7280" />
                  </Pressable>
                  <Pressable
                    style={styles.storeActionBtn}
                    onPress={() => deleteStore(store.id, store.name)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.newStoreRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Ny butik..."
              placeholderTextColor="#9ca3af"
              value={newStoreName}
              onChangeText={setNewStoreName}
              returnKeyType="done"
              onSubmitEditing={createStore}
              autoCapitalize="words"
            />
            <Pressable
              style={[styles.addStoreBtn, (!newStoreName.trim() || creatingStore) && styles.addStoreBtnDisabled]}
              onPress={createStore}
              disabled={creatingStore || !newStoreName.trim()}
            >
              {creatingStore
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="add" size={22} color="#fff" />}
            </Pressable>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Category order editor */}
      <Modal visible={!!editingCategoryStore} transparent animationType="slide" onRequestClose={() => setEditingCategoryStore(null)}>
        <Pressable style={styles.overlay} onPress={() => setEditingCategoryStore(null)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{editingCategoryStore?.name}</Text>
          <Text style={styles.sheetSub}>Dra om ordningen med pilarna så den matchar butikens layout</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {editCategoryOrder.map((cat, idx) => (
              <View key={cat} style={styles.catRow}>
                <Text style={styles.catRowLabel}>{CATEGORY_LABELS[cat]}</Text>
                <Pressable onPress={() => moveCategoryUp(idx)} disabled={idx === 0} style={styles.catArrow}>
                  <Ionicons name="chevron-up" size={18} color={idx === 0 ? '#e5e7eb' : '#374151'} />
                </Pressable>
                <Pressable onPress={() => moveCategoryDown(idx)} disabled={idx === editCategoryOrder.length - 1} style={styles.catArrow}>
                  <Ionicons name="chevron-down" size={18} color={idx === editCategoryOrder.length - 1 ? '#e5e7eb' : '#374151'} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <Pressable
            style={[styles.button, savingCategoryOrder && styles.buttonDisabled]}
            onPress={saveCategoryOrder}
            disabled={savingCategoryOrder}
          >
            {savingCategoryOrder
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Spara ordning</Text>}
          </Pressable>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 10 },
  listEmpty: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#bbf7d0',
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  cardLeft: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
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
    shadowRadius: 14,
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
  button: { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sheetSub: { fontSize: 13, color: '#6b7280', marginTop: -8 },
  storesEmpty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 16 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  storeName: { flex: 1, fontSize: 16, fontWeight: '500', color: '#111827' },
  storeActions: { flexDirection: 'row', gap: 4 },
  storeActionBtn: { padding: 8 },
  newStoreRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  addStoreBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  addStoreBtnDisabled: { opacity: 0.4 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  catRowLabel: { flex: 1, fontSize: 15, color: '#374151' },
  catArrow: { padding: 6 },
  pickStoreLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: -6 },
  storeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  storeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  storeChipActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  storeChipText: { fontSize: 14, color: '#6b7280' },
  storeChipTextActive: { color: '#4f46e5', fontWeight: '600' },
  cardWrap: { position: 'relative' },
  cardDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: '#fff', borderRadius: 11 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', backgroundColor: '#111827', borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
