import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import { capitalize } from '../../src/lib/text';
import {
  ActivityIndicator,
  Animated,
  Alert,
  GestureResponderEvent,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { useApiClient, type ShoppingListWithItems, type ShoppingItemWithRecipe } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useShoppingSocket } from '../../src/hooks/useShoppingSocket';
import { CATEGORY_LABELS, DEFAULT_CATEGORY_ORDER, type StoreCategory, type StapleItem, type Store } from '@veckis/shared';

const CATEGORY_EMOJIS: Record<StoreCategory, string> = {
  fruit_veg: '🥦', meat_fish: '🥩', dairy_eggs: '🥛',
  bread_bakery: '🍞', frozen: '🧊', canned_dry: '🥫',
  snacks_sweets: '🍫', beverages: '🥤', cleaning: '🧹',
  personal_care: '🧴', other: '📦',
};

// Survives navigation within the session; resets on app restart
const dismissedDupesStore = new Map<string, Set<string>>();

export default function ShoppingListScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const router = useRouter();
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { getToken } = useAuth();

  const [list, setList] = useState<ShoppingListWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [staples, setStaples] = useState<StapleItem[]>([]);
  const [ingredientSuggestions, setIngredientSuggestions] = useState<{ name: string; category: string }[]>([]);

  // Quick-add quantity sheet (chip tap)
  const [qtySheet, setQtySheet] = useState<{ name: string; category?: StoreCategory } | null>(null);
  const [qtyCategory, setQtyCategory] = useState<StoreCategory>('other');
  const [qtyValue, setQtyValue] = useState('1');
  const [qtyUnit, setQtyUnit] = useState('');
  const [mergeSheet, setMergeSheet] = useState<{ name: string; category: StoreCategory; items: ShoppingItemWithRecipe[] } | null>(null);
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [mergeQty, setMergeQty] = useState('1');
  const [mergeUnit, setMergeUnit] = useState('');
  const [mergeName, setMergeName] = useState('');
  const [mergeCategory, setMergeCategory] = useState<StoreCategory>('other');
  const [manualPickerOpen, setManualPickerOpen] = useState(false);
  const [manualPickerSelected, setManualPickerSelected] = useState<Set<string>>(new Set());

  // Category browser modal
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserCategory, setBrowserCategory] = useState<StoreCategory | null>(null);

  // Item edit modal
  const [editingItem, setEditingItem] = useState<ShoppingItemWithRecipe | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editCategory, setEditCategory] = useState<StoreCategory>('other');
  const [saving, setSaving] = useState(false);

  // Store picker modal
  const [showStorePicker, setShowStorePicker] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [creatingStore, setCreatingStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');

  // Category order editor
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [editCategoryOrder, setEditCategoryOrder] = useState<StoreCategory[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const editQtyRef = useRef<TextInput>(null);
  const editUnitRef = useRef<TextInput>(null);
  const qtyUnitRef = useRef<TextInput>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMessage, setToastMessage] = useState('');
  const dupeButtonScale = useRef(new Animated.Value(1)).current;
  const hasPulsedDupes = useRef(false);
  const pendingOpenNextDupe = useRef(false);

  function showToast(msg: string) {
    setToastMessage(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }

  useShoppingSocket(listId, getToken, (msg) => {
    setList(prev => {
      if (!prev) return prev;
      switch (msg.type) {
        case 'item_added': {
          const exists = prev.items.some(i => i.id === msg.data.id);
          if (exists) return prev;
          return { ...prev, items: [...prev.items, { ...msg.data, recipe: null }] };
        }
        case 'item_updated':
          return {
            ...prev,
            items: prev.items.map(i =>
              i.id === msg.data.id ? { ...msg.data, recipe: i.recipe } : i,
            ),
          };
        case 'item_deleted':
          return { ...prev, items: prev.items.filter(i => i.id !== msg.data.id) };
        case 'list_cleared':
          return { ...prev, items: [] };
        default:
          return prev;
      }
    });
  });

  const openMergeForDupes = useCallback((
    dupes: ShoppingItemWithRecipe[],
    lastItem?: { quantity?: number | null; unit?: string | null },
  ) => {
    if (dupes.length < 2) return;
    const totalQty = dupes.reduce((sum, d) => sum + (d.quantity ?? 1), 0);
    const bestUnit = lastItem?.unit
      || [...dupes].reverse().map(d => d.unit ?? '').find(Boolean)
      || '';
    setMergeSheet({ name: dupes[0].name.toLowerCase().trim(), category: dupes[0].category as StoreCategory, items: dupes });
    setMergeSelected(new Set(dupes.map(i => i.id)));
    setMergeQty(String(totalQty).replace('.', ','));
    setMergeUnit(bestUnit);
    setMergeName(capitalize(dupes[0].name));
    setMergeCategory(dupes[0].category as StoreCategory);
  }, []);

  const categoryOrder: StoreCategory[] = (list?.store?.categoryOrder as StoreCategory[]) ?? DEFAULT_CATEGORY_ORDER;

  const [dismissedDupeKeys, setDismissedDupeKeys] = useState<Set<string>>(
    () => dismissedDupesStore.get(listId ?? '') ?? new Set(),
  );

  const duplicateGroups = useMemo(() => {
    if (!list) return [];
    const nameMap = new Map<string, ShoppingItemWithRecipe[]>();
    for (const item of list.items.filter(i => !i.isChecked && !i.id.startsWith('optimistic-'))) {
      const key = item.name.toLowerCase().trim();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key)!.push(item);
    }
    return [...nameMap.values()].filter(g => g.length >= 2 && !dismissedDupeKeys.has(g[0].name.toLowerCase().trim()));
  }, [list, dismissedDupeKeys]);

  function dismissDupeGroup(name: string) {
    const key = name.toLowerCase().trim();
    const next = new Set([...dismissedDupeKeys, key]);
    dismissedDupesStore.set(listId ?? '', next);
    setDismissedDupeKeys(next);
  }

  useEffect(() => {
    if (duplicateGroups.length > 0 && !hasPulsedDupes.current) {
      hasPulsedDupes.current = true;
      Animated.sequence([
        Animated.timing(dupeButtonScale, { toValue: 1.2, duration: 220, useNativeDriver: true }),
        Animated.timing(dupeButtonScale, { toValue: 0.9, duration: 180, useNativeDriver: true }),
        Animated.timing(dupeButtonScale, { toValue: 1.15, duration: 180, useNativeDriver: true }),
        Animated.timing(dupeButtonScale, { toValue: 0.95, duration: 160, useNativeDriver: true }),
        Animated.timing(dupeButtonScale, { toValue: 1.1, duration: 160, useNativeDriver: true }),
        Animated.timing(dupeButtonScale, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
    if (duplicateGroups.length === 0) hasPulsedDupes.current = false;
  }, [duplicateGroups.length]);

  useEffect(() => {
    if (pendingOpenNextDupe.current && !mergeSheet && duplicateGroups.length > 0) {
      pendingOpenNextDupe.current = false;
      openMergeForDupes(duplicateGroups[0]);
    }
  }, [mergeSheet, duplicateGroups, openMergeForDupes]);

  const searchList = useMemo(() => {
    const stapleNames = new Set(staples.map(s => s.name.toLowerCase()));
    const extra = ingredientSuggestions
      .filter(s => !stapleNames.has(s.name.toLowerCase()))
      .map(s => ({ name: s.name, id: `suggestion:${s.name}`, category: s.category } as unknown as StapleItem));
    return [...staples, ...extra];
  }, [staples, ingredientSuggestions]);

  const fuse = useMemo(() => new Fuse(searchList, { keys: ['name'], threshold: 0.35, minMatchCharLength: 1 }), [searchList]);
  const suggestions = newItem.trim().length >= 1
    ? fuse.search(newItem).slice(0, 8).map(r => r.item)
    : [];

  const load = useCallback(async () => {
    if (!listId || !householdId) return;
    try {
      const [data, storeList, stapleList, suggestions] = await Promise.all([
        client.getShoppingList(listId),
        client.getStores(householdId),
        client.getStaples(householdId),
        client.getIngredientSuggestions(householdId).catch(() => [] as { name: string; category: string }[]),
      ]);
      setList(data);
      setStores(storeList);
      setStaples(stapleList);
      setIngredientSuggestions(suggestions);
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda listan');
    } finally {
      setLoading(false);
    }
  }, [listId, householdId, openMergeForDupes]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  async function addItem(name?: string, category?: StoreCategory, quantity?: number, unit?: string) {
    let itemName = (name ?? newItem).trim().toLowerCase();
    if (!listId || !itemName) return;

    const tempId = `optimistic-${Date.now()}`;
    const optimisticItem: ShoppingItemWithRecipe = {
      id: tempId,
      listId,
      name: itemName,
      quantity: quantity ?? 1,
      unit: unit ?? null,
      category: category ?? 'other',
      isChecked: false,
      checkedBy: null,
      addedBy: '',
      note: null,
      recipeId: null,
      menuItemId: null,
      recipe: null,
    };

    setList(prev => prev ? { ...prev, items: [...(prev.items ?? []), optimisticItem] } : prev);
    setNewItem('');
    Keyboard.dismiss();
    setAdding(true);

    try {
      const item = await client.addShoppingItem(listId, {
        name: itemName,
        ...(category ? { category } : {}),
        ...(quantity && quantity !== 1 ? { quantity } : {}),
        ...(unit ? { unit } : {}),
      });
      setList(prev => {
        if (!prev) return prev;
        const itemExists = prev.items.some(i => i.id === item.id);
        if (itemExists) {
          // Server merged with an existing item — remove optimistic entry and update real one
          return {
            ...prev,
            items: prev.items
              .filter(i => i.id !== tempId)
              .map(i => i.id === item.id ? { ...item, recipe: i.recipe } : i),
          };
        }
        // Replace optimistic entry with real item
        return {
          ...prev,
          items: prev.items.map(i => i.id === tempId ? { ...item, recipe: null } : i),
        };
      });
      if (householdId) {
        client.upsertStaple({
          householdId,
          name: itemName,
          ...(category ? { category } : {}),
          ...(quantity && quantity !== 1 ? { defaultQuantity: quantity } : {}),
          ...(unit ? { unit } : {}),
        }).then(s => {
          setStaples(prev => {
            const exists = prev.find(p => p.id === s.id);
            return exists ? prev.map(p => p.id === s.id ? s : p) : [...prev, s].sort((a, b) => a.name.localeCompare(b.name));
          });
          showToast(itemName.charAt(0).toUpperCase() + itemName.slice(1) + ' tillagd till inköpslistan');
        }).catch(() => {});
      }
      setList(prev => {
        if (!prev) return prev;
        const currentItems = prev.items.filter(i => i.id !== tempId);
        const realItem = currentItems.find(i => i.id === item.id) ?? { ...item, recipe: null };
        const dupes = currentItems.filter(i => !i.isChecked && i.name.toLowerCase().trim() === itemName);
        if (dupes.length >= 2) openMergeForDupes(dupes, realItem);
        return prev;
      });
    } catch (err) {
      console.error('Failed to add item:', err);
      setList(prev => prev ? { ...prev, items: (prev.items ?? []).filter(i => i.id !== tempId) } : prev);
      Alert.alert('Fel', 'Kunde inte lägga till vara');
    } finally {
      setAdding(false);
    }
  }

  function openQtySheet(name: string, category?: StoreCategory) {
    const staple = staples.find(s => s.name.toLowerCase() === name.toLowerCase());
    setQtyValue(staple?.defaultQuantity ? String(staple.defaultQuantity) : '1');
    setQtyUnit(staple?.unit ?? '');
    setQtyCategory((category ?? staple?.category ?? 'other') as StoreCategory);
    setQtySheet({ name, category });
    Keyboard.dismiss();
  }

  async function confirmQtySheet() {
    if (!qtySheet) return;
    const qty = parseFloat(qtyValue.replace(',', '.'));
    const unit = qtyUnit.trim() || undefined;
    await addItem(qtySheet.name, qtyCategory, isNaN(qty) ? 1 : qty, unit);
    setQtySheet(null);
  }

  function toggleMergeSelected(id: string) {
    setMergeSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmMerge() {
    if (!mergeSheet) return;
    const selected = mergeSheet.items.filter(i => mergeSelected.has(i.id));
    if (selected.length < 2) return;
    const qty = parseFloat(mergeQty.replace(',', '.'));
    const unit = mergeUnit.trim() || undefined;
    const name = (mergeName.trim() || selected[0].name).toLowerCase();
    const sourceIds = selected.map(i => i.id);
    const hideIds = new Set(sourceIds);
    setAdding(true);
    try {
      const container = await client.mergeShoppingItems({
        sourceIds,
        name,
        quantity: isNaN(qty) ? 1 : qty,
        unit: unit ?? null,
        category: mergeCategory,
      });
      setList(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: [
            ...prev.items.filter(i => !hideIds.has(i.id) && i.id !== container.id),
            { ...container, recipe: null },
          ],
        };
      });
      pendingOpenNextDupe.current = true;
      setMergeSheet(null);
    } catch {
      Alert.alert('Fel', 'Kunde inte slå ihop varor');
    } finally {
      setAdding(false);
    }
  }

  function goToBulkTransfer() {
    router.push(`/(tabs)/menu?bulkTransfer=1&originListId=${listId}` as never);
  }

  async function checkAllUnchecked() {
    if (!list) return;
    const targets = list.items.filter(i => !i.isChecked && !i.id.startsWith('optimistic-'));
    if (targets.length === 0) return;
    const ids = targets.map(i => i.id);
    setList(prev => prev ? { ...prev, items: prev.items.map(i => ids.includes(i.id) ? { ...i, isChecked: true } : i) } : prev);
    try {
      await Promise.all(ids.map(id => client.checkShoppingItem(id, true)));
    } catch {
      setList(prev => prev ? { ...prev, items: prev.items.map(i => ids.includes(i.id) ? { ...i, isChecked: false } : i) } : prev);
      Alert.alert('Fel', 'Kunde inte klarmarkera alla varor');
    }
  }

  async function toggleItem(item: ShoppingItemWithRecipe) {
    setList(prev =>
      prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, isChecked: !i.isChecked } : i) } : prev
    );
    try {
      const updated = await client.checkShoppingItem(item.id, !item.isChecked);
      setList(prev => prev ? { ...prev, items: prev.items.map(i => i.id === updated.id ? { ...updated, recipe: item.recipe } : i) } : prev);
    } catch {
      setList(prev =>
        prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? item : i) } : prev
      );
    }
  }

  function openEditItem(item: ShoppingItemWithRecipe) {
    setEditingItem(item);
    setEditName(capitalize(item.name));
    setEditQty(item.quantity !== 1 || item.unit ? String(item.quantity) : '');
    setEditUnit(item.unit ?? '');
    setEditCategory(item.category as StoreCategory);
  }

  async function saveEditItem() {
    if (!editingItem) return;
    setSaving(true);
    const qty = parseFloat(editQty.replace(',', '.')) || 1;
    const unit = editUnit.trim() || null;
    const name = (editName.trim() || editingItem.name).toLowerCase();
    try {
      const updated = await client.updateShoppingItem(editingItem.id, {
        name,
        quantity: qty,
        unit,
        category: editCategory,
      });
      const savedRecipe = editingItem.recipe;
      const updatedItems = (list?.items ?? []).map(i =>
        i.id === updated.id ? { ...updated, recipe: savedRecipe } : i
      );
      setList(prev => prev ? { ...prev, items: updatedItems } : prev);
      setEditingItem(null);
      if (householdId && editCategory !== editingItem.category) {
        client.upsertStaple({ householdId, name, category: editCategory }).catch(() => {});
      }
      const dupes = updatedItems.filter(i => !i.isChecked && i.name.toLowerCase().trim() === name);
      if (dupes.length >= 2) openMergeForDupes(dupes, updated);
    } catch {
      Alert.alert('Fel', 'Kunde inte spara ändringen');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(itemId: string) {
    setList(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== itemId) } : prev);
    try {
      await client.deleteShoppingItem(itemId);
    } catch {
      Alert.alert('Fel', 'Kunde inte ta bort vara');
      load();
    }
  }

  async function completeList() {
    if (!listId) return;
    Alert.alert('Rensa lista?', 'Alla varor tas bort men listan finns kvar.', [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Rensa', style: 'destructive', onPress: async () => {
        try {
          await client.clearShoppingList(listId);
          setList(prev => prev ? { ...prev, items: [] } : prev);
          showToast('Inköpslistan rensad');
        } catch {
          Alert.alert('Fel', 'Kunde inte rensa listan');
        }
      }},
    ]);
  }

  async function selectStore(storeId: string | null) {
    if (!listId) return;
    try {
      const updated = await client.updateShoppingList(listId, { storeId });
      setList(updated);
      setShowStorePicker(false);
    } catch {
      Alert.alert('Fel', 'Kunde inte byta butik');
    }
  }

  async function createStore() {
    if (!householdId || !newStoreName.trim()) return;
    setCreatingStore(true);
    try {
      const store = await client.createStore({ householdId, name: newStoreName.trim() });
      setStores(prev => [...prev, store]);
      await selectStore(store.id);
      setNewStoreName('');
    } catch {
      Alert.alert('Fel', 'Kunde inte skapa butik');
    } finally {
      setCreatingStore(false);
    }
  }

  function openCategoryEditor(store: Store) {
    setEditingStore(store);
    setEditCategoryOrder((store.categoryOrder as StoreCategory[]).length
      ? store.categoryOrder as StoreCategory[]
      : [...DEFAULT_CATEGORY_ORDER]);
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
    if (!editingStore) return;
    setSavingOrder(true);
    try {
      const updated = await client.updateStore(editingStore.id, { categoryOrder: editCategoryOrder });
      setStores(prev => prev.map(s => s.id === updated.id ? updated : s));
      if (list?.store?.id === updated.id) {
        setList(prev => prev ? { ...prev, store: updated } : prev);
      }
      setEditingStore(null);
    } catch {
      Alert.alert('Fel', 'Kunde inte spara ordning');
    } finally {
      setSavingOrder(false);
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  if (!list) return null;

  const unchecked = list.items.filter(i => !i.isChecked);
  const checked = list.items.filter(i => i.isChecked);
  const allItems = [...unchecked, ...checked];
  const categoryGroups = buildCategoryGroups(unchecked, categoryOrder);

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerNav}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={26} color="#111827" />
          </Pressable>
          <Pressable onPress={() => setShowActionsMenu(true)} style={s.doneBtn} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={26} color="#111827" />
          </Pressable>
        </View>
        <View style={s.headerTitle}>
          <Text style={s.title} numberOfLines={1}>{list.name}</Text>
          <View style={s.headerMeta}>
            <Pressable onPress={() => setShowStorePicker(true)} style={s.storeBtn}>
              <Ionicons name="storefront-outline" size={12} color="#4f46e5" />
              <Text style={s.storeBtnText}>{list.store?.name ?? 'Välj butik'}</Text>
            </Pressable>
            {duplicateGroups.length > 0 && (
              <Animated.View style={{ transform: [{ scale: dupeButtonScale }] }}>
                <Pressable
                  style={s.dupeBadge}
                  onPress={() => openMergeForDupes(duplicateGroups[0])}
                  hitSlop={8}
                >
                  <Ionicons name="git-merge-outline" size={12} color="#7c3aed" />
                  <Text style={s.dupeBadgeText}>
                    {duplicateGroups.length === 1 ? '1 dubblett' : `${duplicateGroups.length} dubbletter`}
                  </Text>
                </Pressable>
              </Animated.View>
            )}
          </View>
        </View>
      </View>

      {/* Progress bar */}
      {checked.length > 0 && unchecked.length > 0 && (
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${(checked.length / allItems.length) * 100}%` as `${number}%` }]} />
        </View>
      )}

      <ScrollView contentContainerStyle={[s.list, allItems.length === 0 && s.listEmpty]}>
        {allItems.length === 0 && (
          <View style={s.emptyContainer}>
            <Pressable onPress={goToBulkTransfer} style={s.emptyImportBtn} hitSlop={12}>
              <Ionicons name="add-circle" size={64} color="#4f46e5" />
            </Pressable>
            <Text style={s.emptyText}>Listan är tom</Text>
            <Text style={s.emptySubtext}>Tryck på + för att importera veckomenyn, eller lägg till varor nedan</Text>
          </View>
        )}

        {/* Category groups */}
        {categoryGroups.map(group => (
          <View key={group.category} style={s.categoryGroup}>
            <View style={s.categoryHeader}>
              <Text style={s.categoryLabel}>{CATEGORY_EMOJIS[group.category]} {CATEGORY_LABELS[group.category]}</Text>
            </View>
            {group.items.map(item => (
              <ItemRow key={item.id} item={item} onToggle={() => toggleItem(item)} onEdit={() => openEditItem(item)} />
            ))}
          </View>
        ))}

        {/* Checked items */}
        {checked.length > 0 && (
          <View style={s.categoryGroup}>
            <View style={s.categoryHeader}>
              <Text style={[s.categoryLabel, { color: '#9ca3af' }]}>Bockat</Text>
            </View>
            {checked.map(item => (
              <ItemRow key={item.id} item={item} onToggle={() => toggleItem(item)} onEdit={() => openEditItem(item)} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Autocomplete chips + add bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        enabled={keyboardVisible}
      >
        {suggestions.length > 0 && (
          <View style={s.chipScroll}>
            <View style={s.chipRow}>
              {suggestions.map(s2 => (
                <TouchableOpacity
                  key={s2.id}
                  style={s.chip}
                  onPress={() => openQtySheet(s2.name, s2.category as StoreCategory)}
                >
                  <Text style={s.chipText}>{capitalize(s2.name)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        <View style={s.addBar}>
          <Pressable style={s.browseBtn} onPress={() => { setBrowserCategory(null); setShowBrowser(true); }}>
            <Ionicons name="grid-outline" size={22} color="#4f46e5" />
          </Pressable>
          <TextInput
            ref={inputRef}
            style={s.addInput}
            placeholder="Lägg till vara..."
            placeholderTextColor="#9ca3af"
            value={newItem}
            onChangeText={setNewItem}
            returnKeyType="done"
            onSubmitEditing={() => { const n = newItem.trim(); if (!n) return; setNewItem(''); openQtySheet(n); }}
            blurOnSubmit={false}
            autoCapitalize="none"
          />
          <Pressable
            style={[s.addBtn, (!newItem.trim() || adding) && s.addBtnDisabled]}
            onPress={() => { const n = newItem.trim(); if (!n) return; setNewItem(''); openQtySheet(n); }}
            disabled={adding || !newItem.trim()}
          >
            {adding ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add" size={22} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Store picker modal */}
      <Modal visible={showStorePicker} transparent animationType="slide" onRequestClose={() => setShowStorePicker(false)}>
        <Pressable style={s.overlay} onPress={() => setShowStorePicker(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Välj butik</Text>

          <Pressable style={[s.storeOption, !list.storeId && s.storeOptionActive]} onPress={() => selectStore(null)}>
            <Ionicons name="close-circle-outline" size={20} color="#6b7280" />
            <Text style={s.storeOptionText}>Utan butik</Text>
            {!list.storeId && <Ionicons name="checkmark" size={18} color="#4f46e5" />}
          </Pressable>

          {stores.map(store => (
            <View key={store.id} style={s.storeRow}>
              <Pressable style={[s.storeOption, s.storeOptionFlex, list.storeId === store.id && s.storeOptionActive]} onPress={() => selectStore(store.id)}>
                <Ionicons name="storefront-outline" size={20} color="#4f46e5" />
                <Text style={[s.storeOptionText, { flex: 1 }]}>{store.name}</Text>
                {list.storeId === store.id && <Ionicons name="checkmark" size={18} color="#4f46e5" />}
              </Pressable>
              <Pressable style={s.editStoreBtn} onPress={() => { setShowStorePicker(false); openCategoryEditor(store); }}>
                <Ionicons name="options-outline" size={18} color="#6b7280" />
              </Pressable>
            </View>
          ))}

          <View style={s.newStoreRow}>
            <TextInput
              style={[s.addInput, { flex: 1 }]}
              placeholder="Ny butik..."
              placeholderTextColor="#9ca3af"
              value={newStoreName}
              onChangeText={setNewStoreName}
              returnKeyType="done"
              onSubmitEditing={createStore}
            />
            <Pressable
              style={[s.addBtn, (!newStoreName.trim() || creatingStore) && s.addBtnDisabled]}
              onPress={createStore}
              disabled={creatingStore || !newStoreName.trim()}
            >
              {creatingStore ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add" size={22} color="#fff" />}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Category browser modal */}
      <Modal visible={showBrowser} transparent animationType="slide" onRequestClose={() => setShowBrowser(false)}>
        <Pressable style={s.overlay} onPress={() => setShowBrowser(false)} />
        <View style={[s.sheet, s.browserSheet]}>
          <View style={s.sheetHandle} />
          {browserCategory === null ? (
            <>
              <Text style={s.sheetTitle}>Välj kategori</Text>
              <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={[s.categoryGrid, { paddingBottom: 24 }]}>
                {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => (
                  <Pressable key={cat} style={s.categoryTile} onPress={() => setBrowserCategory(cat)}>
                    <Text style={s.categoryTileEmoji}>{CATEGORY_EMOJIS[cat]}</Text>
                    <Text style={s.categoryTileLabel}>{CATEGORY_LABELS[cat]}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={s.browserHeader}>
                <Pressable style={s.browserBack} onPress={() => setBrowserCategory(null)}>
                  <Ionicons name="chevron-back" size={20} color="#4f46e5" />
                  <Text style={s.browserBackText}>Tillbaka</Text>
                </Pressable>
                <Text style={s.browserTitle}>{CATEGORY_EMOJIS[browserCategory]} {CATEGORY_LABELS[browserCategory]}</Text>
              </View>
              <ScrollView style={s.browserList}>
                {searchList
                  .filter(s2 => s2.category === browserCategory)
                  .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
                  .map(s2 => (
                    <Pressable
                      key={s2.name}
                      style={s.browserItem}
                      onPress={() => { setShowBrowser(false); openQtySheet(s2.name, browserCategory ?? undefined); }}
                    >
                      <Text style={s.browserItemText}>{capitalize(s2.name)}</Text>
                      <Ionicons name="add-circle-outline" size={20} color="#4f46e5" />
                    </Pressable>
                  ))
                }
              </ScrollView>
            </>
          )}
        </View>
      </Modal>

      {/* Item edit modal */}
      <Modal visible={!!editingItem} transparent animationType="slide" onRequestClose={() => setEditingItem(null)}>
        <Pressable style={s.overlay} onPress={() => setEditingItem(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <TextInput
            style={[s.sheetTitle, { padding: 0, marginBottom: 4 }]}
            value={editName}
            onChangeText={setEditName}
            placeholder="Varunamn"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            returnKeyType="next"
            onSubmitEditing={() => editQtyRef.current?.focus()}
          />
          <View style={s.qtyStepper}>
            <Pressable
              style={s.qtyBtn}
              onPress={() => setEditQty(v => String(Math.max(0.5, (parseFloat(v.replace(',', '.')) || 1) - 1)))}
            >
              <Ionicons name="remove" size={22} color="#4f46e5" />
            </Pressable>
            <TextInput
              ref={editQtyRef}
              style={s.qtyInput}
              value={editQty}
              onChangeText={setEditQty}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor="#9ca3af"
              selectTextOnFocus
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => editUnitRef.current?.focus()}
            />
            <Pressable
              style={s.qtyBtn}
              onPress={() => setEditQty(v => String((parseFloat(v.replace(',', '.')) || 0) + 1))}
            >
              <Ionicons name="add" size={22} color="#4f46e5" />
            </Pressable>
            <TextInput
              ref={editUnitRef}
              style={s.qtyUnitInput}
              value={editUnit}
              onChangeText={setEditUnit}
              placeholder="enhet"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              returnKeyType="done"
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.unitChipScroll}>
            <View style={s.unitChipRow}>
              {['st', 'dl', 'ml', 'l', 'g', 'kg', 'msk', 'tsk', 'krm', 'paket', 'påse', 'burk', 'flaska'].map(u => (
                <Pressable key={u} style={[s.unitChip, editUnit === u && s.unitChipActive]} onPress={() => setEditUnit(v => v === u ? '' : u)}>
                  <Text style={[s.unitChipText, editUnit === u && s.unitChipTextActive]}>{u}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <Text style={s.editLabel}>Kategori</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catChipScroll}>
            <View style={s.catChipRow}>
              {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => (
                <Pressable
                  key={cat}
                  style={[s.catChip, editCategory === cat && s.catChipActive]}
                  onPress={() => setEditCategory(cat)}
                >
                  <Text style={[s.catChipText, editCategory === cat && s.catChipTextActive]} numberOfLines={1}>
                    {CATEGORY_EMOJIS[cat]} {CATEGORY_LABELS[cat]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <View style={s.editActions}>
            <Pressable style={s.deleteBtn} onPress={() => { setEditingItem(null); if (editingItem) deleteItem(editingItem.id); }}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={s.deleteBtnText}>Ta bort</Text>
            </Pressable>
            <Pressable style={[s.saveBtn, saving && s.saveBtnDisabled, { flex: 1, marginTop: 0 }]} onPress={saveEditItem} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Spara</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Category order editor */}
      <Modal visible={!!editingStore} transparent animationType="slide" onRequestClose={() => setEditingStore(null)}>
        <Pressable style={s.overlay} onPress={() => setEditingStore(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{editingStore?.name} — kategoriordning</Text>
          <Text style={s.sheetSub}>Dra om ordningen med pilarna så den matchar butikens layout</Text>
          <ScrollView style={{ maxHeight: 380 }}>
            {editCategoryOrder.map((cat, idx) => (
              <View key={cat} style={s.catRow}>
                <Text style={s.catRowLabel}>{CATEGORY_LABELS[cat]}</Text>
                <Pressable onPress={() => moveCategoryUp(idx)} disabled={idx === 0} style={s.catArrow}>
                  <Ionicons name="chevron-up" size={18} color={idx === 0 ? '#e5e7eb' : '#374151'} />
                </Pressable>
                <Pressable onPress={() => moveCategoryDown(idx)} disabled={idx === editCategoryOrder.length - 1} style={s.catArrow}>
                  <Ionicons name="chevron-down" size={18} color={idx === editCategoryOrder.length - 1 ? '#e5e7eb' : '#374151'} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <Pressable style={[s.saveBtn, savingOrder && s.saveBtnDisabled]} onPress={saveCategoryOrder} disabled={savingOrder}>
            {savingOrder ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Spara ordning</Text>}
          </Pressable>
        </View>
      </Modal>
      {/* Quantity sheet */}
      <Modal visible={!!qtySheet} transparent animationType="slide" onRequestClose={() => setQtySheet(null)}>
        <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.3)' }]} onPress={() => setQtySheet(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{capitalize(qtySheet?.name)}</Text>
            <View style={s.qtyStepper}>
              <Pressable
                style={s.qtyBtn}
                onPress={() => setQtyValue(v => String(Math.max(0.5, (parseFloat(v.replace(',', '.')) || 1) - 1)))}
              >
                <Ionicons name="remove" size={22} color="#4f46e5" />
              </Pressable>
              <TextInput
                style={s.qtyInput}
                value={qtyValue}
                onChangeText={setQtyValue}
                keyboardType="decimal-pad"
                selectTextOnFocus
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => qtyUnitRef.current?.focus()}
              />
              <Pressable
                style={s.qtyBtn}
                onPress={() => setQtyValue(v => String((parseFloat(v.replace(',', '.')) || 0) + 1))}
              >
                <Ionicons name="add" size={22} color="#4f46e5" />
              </Pressable>
              <TextInput
                ref={qtyUnitRef}
                style={s.qtyUnitInput}
                value={qtyUnit}
                onChangeText={setQtyUnit}
                placeholder="enhet"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={confirmQtySheet}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.unitChipScroll}>
              <View style={s.unitChipRow}>
                {['st', 'dl', 'ml', 'l', 'g', 'kg', 'msk', 'tsk', 'krm', 'paket', 'påse', 'burk', 'flaska'].map(u => (
                  <Pressable key={u} style={[s.unitChip, qtyUnit === u && s.unitChipActive]} onPress={() => setQtyUnit(v => v === u ? '' : u)}>
                    <Text style={[s.unitChipText, qtyUnit === u && s.unitChipTextActive]}>{u}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Text style={s.editLabel}>Kategori</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catChipScroll}>
              <View style={s.catChipRow}>
                {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => (
                  <Pressable
                    key={cat}
                    style={[s.catChip, qtyCategory === cat && s.catChipActive]}
                    onPress={() => setQtyCategory(cat)}
                  >
                    <Text style={[s.catChipText, qtyCategory === cat && s.catChipTextActive]} numberOfLines={1}>
                      {CATEGORY_EMOJIS[cat]} {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Pressable style={s.qtyConfirm} onPress={confirmQtySheet} disabled={adding}>
              {adding
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.qtyConfirmText}>Lägg till</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Animated.View style={[s.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={s.toastText}>{toastMessage}</Text>
      </Animated.View>

      {/* Merge duplicates sheet */}
      <Modal visible={!!mergeSheet} transparent animationType="slide" onRequestClose={() => setMergeSheet(null)}>
        <Pressable style={s.overlay} onPress={() => setMergeSheet(null)} />
        <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.mergeHeaderRow}>
              <Text style={s.sheetTitle}>Dubbletter</Text>
              {!manualPickerOpen && (
                <Pressable
                  style={s.dupeBadge}
                  onPress={() => { setManualPickerSelected(new Set()); setManualPickerOpen(true); }}
                  hitSlop={8}
                >
                  <Ionicons name="checkbox-outline" size={12} color="#7c3aed" />
                  <Text style={s.dupeBadgeText}>Markera själv</Text>
                </Pressable>
              )}
            </View>
            <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {mergeSheet && mergeSheet.items.length > 0 ? (
                <Text style={s.sheetSub}>Markera vilka som ska slås ihop</Text>
              ) : (
                <Text style={s.sheetSub}>Inga föreslagna dubbletter — markera själv för att slå ihop varor</Text>
              )}
              {mergeSheet?.items.map(item => (
                <Pressable key={item.id} style={s.mergeItem} onPress={() => toggleMergeSelected(item.id)}>
                  <Ionicons
                    name={mergeSelected.has(item.id) ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={mergeSelected.has(item.id) ? '#4f46e5' : '#9ca3af'}
                  />
                  <Text style={s.mergeItemText} numberOfLines={1}>
                    {capitalize(item.name)} — {String(item.quantity ?? 1).replace('.', ',')}{item.unit ? ` ${item.unit}` : ''}
                  </Text>
                </Pressable>
              ))}
              {mergeSheet && mergeSheet.items.length > 0 && (<>
              <View style={s.mergeDivider} />
              <Text style={s.editLabel}>Namn</Text>
              <TextInput
                style={s.editInput}
                value={mergeName}
                onChangeText={setMergeName}
                placeholder="Varunamn"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
              />
              <Text style={s.editLabel}>Ny mängd och enhet</Text>
              <View style={[s.qtyStepper, { gap: 6, marginVertical: 4 }]}>
                <Pressable
                  style={[s.qtyBtn, { width: 36, height: 36, borderRadius: 18 }]}
                  onPress={() => setMergeQty(v => String(Math.max(0.5, (parseFloat(v.replace(',', '.')) || 1) - 1)).replace('.', ','))}
                >
                  <Ionicons name="remove" size={18} color="#4f46e5" />
                </Pressable>
                <TextInput
                  style={[s.qtyInput, { fontSize: 16, fontWeight: '600', paddingVertical: 6 }]}
                  value={mergeQty}
                  onChangeText={setMergeQty}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                <Pressable
                  style={[s.qtyBtn, { width: 36, height: 36, borderRadius: 18 }]}
                  onPress={() => setMergeQty(v => String((parseFloat(v.replace(',', '.')) || 0) + 1).replace('.', ','))}
                >
                  <Ionicons name="add" size={18} color="#4f46e5" />
                </Pressable>
                <TextInput
                  style={[s.qtyUnitInput, { fontSize: 13, paddingVertical: 6, paddingHorizontal: 8 }]}
                  value={mergeUnit}
                  onChangeText={setMergeUnit}
                  placeholder="enhet"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.unitChipScroll} keyboardShouldPersistTaps="handled">
                <View style={s.unitChipRow}>
                  {['st', 'dl', 'ml', 'l', 'g', 'kg', 'msk', 'tsk', 'krm', 'paket', 'påse', 'burk', 'flaska'].map(u => (
                    <Pressable key={u} style={[s.unitChip, mergeUnit === u && s.unitChipActive]} onPress={() => setMergeUnit(v => v === u ? '' : u)}>
                      <Text style={[s.unitChipText, mergeUnit === u && s.unitChipTextActive]}>{u}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <Text style={s.editLabel}>Kategori</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catChipScroll} keyboardShouldPersistTaps="handled">
                <View style={s.catChipRow}>
                  {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => (
                    <Pressable
                      key={cat}
                      style={[s.catChip, mergeCategory === cat && s.catChipActive]}
                      onPress={() => setMergeCategory(cat)}
                    >
                      <Text style={[s.catChipText, mergeCategory === cat && s.catChipTextActive]} numberOfLines={1}>
                        {CATEGORY_EMOJIS[cat]} {CATEGORY_LABELS[cat]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              </>)}
            </ScrollView>
            {mergeSheet && mergeSheet.items.length > 0 && (<>
            <Pressable
              style={[s.qtyConfirm, (mergeSelected.size < 2 || adding) && s.saveBtnDisabled]}
              onPress={confirmMerge}
              disabled={adding || mergeSelected.size < 2}
            >
              {adding
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.qtyConfirmText}>Slå ihop {mergeSelected.size} varor</Text>}
            </Pressable>
            {duplicateGroups.length > 1 && (
              <Pressable
                style={s.mergeIgnoreBtn}
                onPress={() => {
                  if (!mergeSheet) return;
                  const idx = duplicateGroups.findIndex(g => g[0].name.toLowerCase().trim() === mergeSheet.name);
                  const next = duplicateGroups[(idx + 1) % duplicateGroups.length];
                  if (next && next !== duplicateGroups[idx]) openMergeForDupes(next);
                }}
              >
                <Text style={[s.mergeIgnoreBtnText, { color: '#4f46e5' }]}>Nästa dubblett →</Text>
              </Pressable>
            )}
            <Pressable
              style={s.mergeIgnoreBtn}
              onPress={() => {
                if (mergeSheet) dismissDupeGroup(mergeSheet.name);
                pendingOpenNextDupe.current = true;
                setMergeSheet(null);
              }}
            >
              <Text style={s.mergeIgnoreBtnText}>Ignorera</Text>
            </Pressable>
            </>)}
        </View>
      </Modal>

      {/* Actions menu (3-dot) */}
      <Modal visible={showActionsMenu} transparent animationType="fade" onRequestClose={() => setShowActionsMenu(false)}>
        <Pressable style={s.overlay} onPress={() => setShowActionsMenu(false)} />
        <View style={s.actionsMenu}>
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => { setShowActionsMenu(false); checkAllUnchecked(); }}
          >
            <Ionicons name="checkbox-outline" size={20} color="#4f46e5" />
            <Text style={s.actionsMenuText}>Klarmarkera alla</Text>
          </Pressable>
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => { setShowActionsMenu(false); goToBulkTransfer(); }}
          >
            <Ionicons name="restaurant-outline" size={20} color="#4f46e5" />
            <Text style={s.actionsMenuText}>Importera veckomeny</Text>
          </Pressable>
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => {
              setShowActionsMenu(false);
              if (duplicateGroups.length > 0) openMergeForDupes(duplicateGroups[0]);
              else setMergeSheet({ name: '', category: 'other' as StoreCategory, items: [] });
            }}
          >
            <Ionicons name="git-merge-outline" size={20} color="#7c3aed" />
            <Text style={s.actionsMenuText}>
              Hantera dubbletter{duplicateGroups.length > 0 ? ` (${duplicateGroups.length})` : ''}
            </Text>
          </Pressable>
          <View style={s.actionsMenuDivider} />
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => { setShowActionsMenu(false); completeList(); }}
          >
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
            <Text style={[s.actionsMenuText, { color: '#ef4444' }]}>Rensa lista</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Manual duplicate picker */}
      <Modal visible={manualPickerOpen} transparent animationType="slide" onRequestClose={() => setManualPickerOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setManualPickerOpen(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Markera dubbletter själv</Text>
          <Text style={s.sheetSub}>Välj minst två varor som ska slås ihop</Text>
          <ScrollView style={s.mergeList} showsVerticalScrollIndicator={false}>
            {list?.items
              .filter(i => !i.isChecked && !i.id.startsWith('optimistic-'))
              .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
              .map(item => {
                const checked = manualPickerSelected.has(item.id);
                return (
                  <Pressable
                    key={item.id}
                    style={s.mergeItem}
                    onPress={() => setManualPickerSelected(prev => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                      return next;
                    })}
                  >
                    <Ionicons
                      name={checked ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={checked ? '#4f46e5' : '#9ca3af'}
                    />
                    <Text style={s.mergeItemText} numberOfLines={1}>
                      {capitalize(item.name)} — {String(item.quantity ?? 1).replace('.', ',')}{item.unit ? ` ${item.unit}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
          </ScrollView>
          <Pressable
            style={[s.qtyConfirm, manualPickerSelected.size < 2 && s.saveBtnDisabled]}
            disabled={manualPickerSelected.size < 2}
            onPress={() => {
              if (!list) return;
              const selected = list.items.filter(i => manualPickerSelected.has(i.id));
              if (selected.length < 2) return;
              setManualPickerOpen(false);
              openMergeForDupes(selected);
            }}
          >
            <Text style={s.qtyConfirmText}>Fortsätt med {manualPickerSelected.size} varor</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

type CategoryGroup = { category: StoreCategory; items: ShoppingItemWithRecipe[] };

function buildCategoryGroups(items: ShoppingItemWithRecipe[], order: StoreCategory[]): CategoryGroup[] {
  const map = new Map<StoreCategory, ShoppingItemWithRecipe[]>();
  for (const item of items) {
    const cat = item.category as StoreCategory;
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(item);
  }
  const orderedKeys = [...order.filter(c => map.has(c))];
  // append any categories not in order
  for (const cat of map.keys()) {
    if (!orderedKeys.includes(cat)) orderedKeys.push(cat);
  }
  return orderedKeys.map(cat => ({
    category: cat,
    items: map.get(cat)!.sort((a, b) => {
      if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
      return a.name.localeCompare(b.name, 'sv');
    }),
  }));
}

function ItemRow({ item, onToggle, onEdit }: { item: ShoppingItemWithRecipe; onToggle: () => void; onEdit: () => void }) {
  return (
    <Pressable
      style={[s.item, item.isChecked && s.itemChecked]}
      onPress={onToggle}
      onLongPress={onEdit}
    >
      <Ionicons name={item.isChecked ? 'checkbox' : 'square-outline'} size={24} color={item.isChecked ? '#10b981' : '#4f46e5'} />
      <View style={s.itemContent}>
        <View style={s.itemRow}>
          <Text style={[s.itemName, item.isChecked && s.itemNameChecked]}>{capitalize(item.name)}</Text>
          {(item.quantity !== 1 || item.unit) && (
            <Text style={[s.itemQty, item.isChecked && s.itemNameChecked]}>{String(item.quantity).replace('.', ',')}{item.unit ? ` ${item.unit}` : ''}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 12 },
  headerNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  actionsMenu: { position: 'absolute', top: 56, right: 12, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 6, minWidth: 220, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  actionsMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  actionsMenuText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  actionsMenuDivider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 4 },
  headerTitle: { paddingHorizontal: 20, paddingTop: 2 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  backBtn: { padding: 10 },
  doneBtn: { padding: 10 },
  title: { fontSize: 26, fontWeight: '700', color: '#111827' },
  storeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  storeBtnText: { fontSize: 12, color: '#4f46e5', fontWeight: '500' },
  progressBar: { height: 3, backgroundColor: '#e5e7eb' },
  progressFill: { height: 3, backgroundColor: '#10b981' },
  list: { padding: 16, gap: 16, paddingBottom: 8 },
  listEmpty: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyImportBtn: { marginBottom: 4 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#374151', marginTop: 12 },
  emptySubtext: { fontSize: 13, color: '#9ca3af', marginTop: 4, textAlign: 'center', paddingHorizontal: 32 },
  dupeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ede9fe', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  dupeBadgeText: { fontSize: 12, fontWeight: '600', color: '#7c3aed' },
  mergeIgnoreBtn: { paddingVertical: 10 },
  mergeIgnoreBtnText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  mergeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryGroup: { gap: 4 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingVertical: 4 },
  categoryLabel: { fontSize: 12, fontWeight: '700', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: 0.6, flex: 1 },
  categoryCount: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  itemChecked: { opacity: 0.55 },
  itemContent: { flex: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  itemName: { fontSize: 16, color: '#111827', flex: 1 },
  itemNameChecked: { textDecorationLine: 'line-through', color: '#9ca3af' },
  itemQty: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  chipScroll: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6', maxHeight: 44 },
  chipRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row', alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#eef2ff', borderRadius: 20 },
  chipText: { fontSize: 13, color: '#4f46e5', fontWeight: '500' },
  addBar: { flexDirection: 'row', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6', gap: 10, alignItems: 'center' },
  browseBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  addInput: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, backgroundColor: '#f9fafb' },
  addBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  addBtnDisabled: { opacity: 0.4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 12, maxHeight: '80%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  sheetSub: { fontSize: 13, color: '#6b7280', marginTop: -4 },
  storeOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10, backgroundColor: '#f9fafb' },
  storeOptionFlex: { flex: 1 },
  storeOptionActive: { backgroundColor: '#eef2ff' },
  storeOptionText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  storeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  editStoreBtn: { padding: 12, backgroundColor: '#f9fafb', borderRadius: 10 },
  newStoreRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  catRowLabel: { flex: 1, fontSize: 15, color: '#374151' },
  catArrow: { padding: 6 },
  saveBtn: { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 4 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  editRow: { flexDirection: 'row', gap: 12 },
  editLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  editInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, backgroundColor: '#f9fafb' },
  catChipScroll: { marginBottom: 4 },
  catChipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  catChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', flexShrink: 0 },
  catChipActive: { backgroundColor: '#eef2ff', borderColor: '#4f46e5' },
  catChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  catChipTextActive: { color: '#4f46e5', fontWeight: '600' },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fff7f7' },
  deleteBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
  browserSheet: { maxHeight: '90%', gap: 0 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  categoryTile: { width: '47%', backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  categoryTileEmoji: { fontSize: 28 },
  categoryTileLabel: { fontSize: 13, fontWeight: '600', color: '#374151', textAlign: 'center' },
  browserHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  browserBack: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  browserBackText: { fontSize: 14, color: '#4f46e5', fontWeight: '500' },
  browserTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'right' },
  browserList: { marginTop: 12, maxHeight: 400 },
  browserItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  browserItemText: { flex: 1, fontSize: 16, color: '#111827' },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  qtyInput: { flex: 1, textAlign: 'center', fontSize: 22, fontWeight: '700', color: '#111827', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 8 },
  qtyUnitInput: { flex: 1, fontSize: 16, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  qtyConfirm: { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  qtyConfirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  toast: { position: 'absolute', bottom: 76, alignSelf: 'center', backgroundColor: '#34d399', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  mergeList: { maxHeight: 200, flexGrow: 0 },
  unitChipScroll: { marginVertical: 4 },
  unitChipRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  unitChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  unitChipActive: { backgroundColor: '#eef2ff', borderColor: '#4f46e5' },
  unitChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  unitChipTextActive: { color: '#4f46e5', fontWeight: '600' },
  mergeItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  mergeItemText: { fontSize: 16, color: '#374151', flex: 1 },
  mergeDivider: { height: 1, backgroundColor: '#e5e7eb', marginTop: 4 },
  itemWrap: { position: 'relative' },
  itemDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: '#fff', borderRadius: 11 },
  editDoneBtn: { backgroundColor: '#111827', padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
