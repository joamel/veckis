import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
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
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type ShoppingListWithItems, type ShoppingItemWithRecipe } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { CATEGORY_LABELS, DEFAULT_CATEGORY_ORDER, type StoreCategory, type StapleItem, type Store } from '@veckis/shared';

const CATEGORY_EMOJIS: Record<StoreCategory, string> = {
  fruit_veg: '🥦', meat_fish: '🥩', dairy_eggs: '🥛',
  bread_bakery: '🍞', frozen: '🧊', canned_dry: '🥫',
  snacks_sweets: '🍫', beverages: '🥤', cleaning: '🧹',
  personal_care: '🧴', other: '📦',
};

export default function ShoppingListScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const router = useRouter();
  const client = useApiClient();
  const { householdId } = useHousehold();

  const [list, setList] = useState<ShoppingListWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);
  const [stores, setStores] = useState<Store[]>([]);
  const [staples, setStaples] = useState<StapleItem[]>([]);
  const [ingredientSuggestions, setIngredientSuggestions] = useState<{ name: string; category: string }[]>([]);

  // Quick-add quantity sheet (chip tap)
  const [qtySheet, setQtySheet] = useState<{ name: string; category?: StoreCategory } | null>(null);
  const [qtyValue, setQtyValue] = useState('1');
  const [qtyUnit, setQtyUnit] = useState('');
  const [mergeSheet, setMergeSheet] = useState<{ name: string; category: StoreCategory; items: ShoppingItemWithRecipe[] } | null>(null);
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [mergeQty, setMergeQty] = useState('1');
  const [mergeUnit, setMergeUnit] = useState('');

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
  const [creatingStore, setCreatingStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');

  // Category order editor
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [editCategoryOrder, setEditCategoryOrder] = useState<StoreCategory[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMessage, setToastMessage] = useState('');

  function showToast(msg: string) {
    setToastMessage(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }

  const openMergeForDupes = useCallback((
    dupes: ShoppingItemWithRecipe[],
    lastItem?: { quantity?: number | null; unit?: string | null },
  ) => {
    if (dupes.length < 2) return;
    const allSameUnit = dupes.every(d => (d.unit ?? '') === (dupes[0].unit ?? ''));
    const totalQty = allSameUnit
      ? dupes.reduce((sum, d) => sum + (d.quantity ?? 1), 0)
      : (lastItem?.quantity ?? dupes[0].quantity ?? 1);
    setMergeSheet({ name: dupes[0].name.toLowerCase().trim(), category: dupes[0].category as StoreCategory, items: dupes });
    setMergeSelected(new Set(dupes.map(i => i.id)));
    setMergeQty(String(totalQty));
    setMergeUnit(allSameUnit ? (dupes[0].unit ?? '') : (lastItem?.unit ?? ''));
  }, []);

  const categoryOrder: StoreCategory[] = (list?.store?.categoryOrder as StoreCategory[]) ?? DEFAULT_CATEGORY_ORDER;

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
      // Detect duplicates (e.g. after recipe transfer from menu)
      const unchecked = data.items.filter(i => !i.isChecked);
      const nameMap = new Map<string, typeof unchecked>();
      for (const item of unchecked) {
        const key = item.name.toLowerCase().trim();
        if (!nameMap.has(key)) nameMap.set(key, []);
        nameMap.get(key)!.push(item);
      }
      const firstGroup = [...nameMap.values()].find(g => g.length >= 2);
      if (firstGroup) openMergeForDupes(firstGroup);
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
    setAdding(true);
    Keyboard.dismiss();
    try {
      const item = await client.addShoppingItem(listId, {
        name: itemName,
        ...(category ? { category } : {}),
        ...(quantity && quantity !== 1 ? { quantity } : {}),
        ...(unit ? { unit } : {}),
      });
      const prevItems = list?.items ?? [];
      const itemExists = prevItems.some(i => i.id === item.id);
      const updatedItems = itemExists
        ? prevItems.map(i => i.id === item.id ? { ...item, recipe: i.recipe } : i)
        : [...prevItems, { ...item, recipe: null }];
      setList(prev => prev ? { ...prev, items: updatedItems } : prev);
      setNewItem('');
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
      const dupes = updatedItems.filter(
        i => !i.isChecked && i.name.toLowerCase().trim() === itemName,
      );
      if (dupes.length >= 2) openMergeForDupes(dupes, item);
    } catch (err) {
      console.error('Failed to add item:', err);
      Alert.alert('Fel', 'Kunde inte lägga till vara');
    } finally {
      setAdding(false);
    }
  }

  function openQtySheet(name: string, category?: StoreCategory) {
    const staple = staples.find(s => s.name.toLowerCase() === name.toLowerCase());
    setQtyValue(staple?.defaultQuantity ? String(staple.defaultQuantity) : '1');
    setQtyUnit(staple?.unit ?? '');
    setQtySheet({ name, category });
    Keyboard.dismiss();
  }

  async function confirmQtySheet() {
    if (!qtySheet) return;
    const qty = parseFloat(qtyValue.replace(',', '.'));
    const unit = qtyUnit.trim() || undefined;
    await addItem(qtySheet.name, qtySheet.category, isNaN(qty) ? 1 : qty, unit);
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
    const [keep, ...remove] = selected;
    const deleteIds = new Set(remove.map(i => i.id));
    setAdding(true);
    try {
      await Promise.all([
        client.updateShoppingItem(keep.id, { quantity: isNaN(qty) ? 1 : qty, unit: unit ?? null }),
        ...remove.map(i => client.deleteShoppingItem(i.id)),
      ]);
      setList(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items
            .filter(i => !deleteIds.has(i.id))
            .map(i => i.id === keep.id
              ? { ...i, quantity: isNaN(qty) ? 1 : qty, unit: unit ?? null }
              : i
            ),
        };
      });
      setMergeSheet(null);
    } catch {
      Alert.alert('Fel', 'Kunde inte slå ihop varor');
    } finally {
      setAdding(false);
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
    setEditName(item.name);
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
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </Pressable>
          {list.items.length > 0 && (
            <Pressable onPress={completeList} style={s.doneBtn}>
              <Ionicons name="checkmark-done-outline" size={24} color="#4f46e5" />
            </Pressable>
          )}
        </View>
        <View style={s.headerTitle}>
          <Text style={s.title} numberOfLines={1}>{list.name}</Text>
          <Pressable onPress={() => setShowStorePicker(true)} style={s.storeBtn}>
            <Ionicons name="storefront-outline" size={12} color="#4f46e5" />
            <Text style={s.storeBtnText}>{list.store?.name ?? 'Välj butik'}</Text>
          </Pressable>
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
            <Ionicons name="add-circle-outline" size={48} color="#d1d5db" />
            <Text style={s.emptyText}>Listan är tom</Text>
            <Text style={s.emptySubtext}>Lägg till varor nedan</Text>
          </View>
        )}

        {/* Category groups */}
        {categoryGroups.map(group => (
          <View key={group.category} style={s.categoryGroup}>
            <View style={s.categoryHeader}>
              <Text style={s.categoryLabel}>{CATEGORY_LABELS[group.category]}</Text>
              <Text style={s.categoryCount}>{group.items.length}</Text>
            </View>
            {group.items.map(item => (
              <ItemRow key={item.id} item={item} onToggle={() => toggleItem(item)} onDelete={() => deleteItem(item.id)} onEdit={() => openEditItem(item)} />
            ))}
          </View>
        ))}

        {/* Checked items */}
        {checked.length > 0 && (
          <View style={s.categoryGroup}>
            <View style={s.categoryHeader}>
              <Text style={[s.categoryLabel, { color: '#9ca3af' }]}>Bockat</Text>
              <Text style={s.categoryCount}>{checked.length}</Text>
            </View>
            {checked.map(item => (
              <ItemRow key={item.id} item={item} onToggle={() => toggleItem(item)} onDelete={() => deleteItem(item.id)} onEdit={() => openEditItem(item)} />
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
                  <Text style={s.chipText}>{s2.name}</Text>
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
            value={newItem}
            onChangeText={setNewItem}
            returnKeyType="done"
            onSubmitEditing={() => addItem()}
            blurOnSubmit={false}
            autoCapitalize="none"
          />
          <Pressable
            style={[s.addBtn, (!newItem.trim() || adding) && s.addBtnDisabled]}
            onPress={() => addItem()}
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
              <View style={s.categoryGrid}>
                {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => (
                  <Pressable key={cat} style={s.categoryTile} onPress={() => setBrowserCategory(cat)}>
                    <Text style={s.categoryTileEmoji}>{CATEGORY_EMOJIS[cat]}</Text>
                    <Text style={s.categoryTileLabel}>{CATEGORY_LABELS[cat]}</Text>
                  </Pressable>
                ))}
              </View>
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
                {ingredientSuggestions
                  .filter(s2 => s2.category === browserCategory)
                  .map(s2 => (
                    <Pressable
                      key={s2.name}
                      style={s.browserItem}
                      onPress={() => { setShowBrowser(false); openQtySheet(s2.name, browserCategory ?? undefined); }}
                    >
                      <Text style={s.browserItemText}>{s2.name}</Text>
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
          <Text style={s.editLabel}>Namn</Text>
          <TextInput
            style={s.editInput}
            value={editName}
            onChangeText={setEditName}
            placeholder="Varunamn"
            autoCapitalize="none"
          />
          <View style={s.editRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.editLabel}>Antal</Text>
              <TextInput
                style={s.editInput}
                value={editQty}
                onChangeText={setEditQty}
                keyboardType="decimal-pad"
                placeholder="1"
                selectTextOnFocus
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.editLabel}>Enhet</Text>
              <TextInput
                style={s.editInput}
                value={editUnit}
                onChangeText={setEditUnit}
                placeholder="g, dl, st…"
                autoCapitalize="none"
              />
            </View>
          </View>
          <Text style={s.editLabel}>Kategori</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catChipScroll}>
            <View style={s.catChipRow}>
              {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => (
                <Pressable
                  key={cat}
                  style={[s.catChip, editCategory === cat && s.catChipActive]}
                  onPress={() => setEditCategory(cat)}
                >
                  <Text style={[s.catChipText, editCategory === cat && s.catChipTextActive]}>
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
            <Text style={s.sheetTitle}>{qtySheet?.name}</Text>
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
              />
              <Pressable
                style={s.qtyBtn}
                onPress={() => setQtyValue(v => String((parseFloat(v.replace(',', '.')) || 0) + 1))}
              >
                <Ionicons name="add" size={22} color="#4f46e5" />
              </Pressable>
              <TextInput
                style={s.qtyUnitInput}
                value={qtyUnit}
                onChangeText={setQtyUnit}
                placeholder="enhet"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
              />
            </View>
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
            <Text style={s.sheetTitle}>{mergeSheet?.name}</Text>
            <Text style={s.sheetSub}>Markera vilka som ska slås ihop</Text>
            <ScrollView style={s.mergeList} showsVerticalScrollIndicator={false}>
              {mergeSheet?.items.map(item => (
                <Pressable key={item.id} style={s.mergeItem} onPress={() => toggleMergeSelected(item.id)}>
                  <Ionicons
                    name={mergeSelected.has(item.id) ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={mergeSelected.has(item.id) ? '#4f46e5' : '#9ca3af'}
                  />
                  <Text style={s.mergeItemText}>
                    {String(item.quantity ?? 1).replace('.', ',')}{item.unit ? ` ${item.unit}` : ''}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={s.mergeDivider} />
            <Text style={s.editLabel}>Ny mängd och enhet</Text>
            <View style={s.qtyStepper}>
              <Pressable
                style={s.qtyBtn}
                onPress={() => setMergeQty(v => String(Math.max(0.5, (parseFloat(v.replace(',', '.')) || 1) - 1)))}
              >
                <Ionicons name="remove" size={22} color="#4f46e5" />
              </Pressable>
              <TextInput
                style={s.qtyInput}
                value={mergeQty}
                onChangeText={setMergeQty}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
              <Pressable
                style={s.qtyBtn}
                onPress={() => setMergeQty(v => String((parseFloat(v.replace(',', '.')) || 0) + 1))}
              >
                <Ionicons name="add" size={22} color="#4f46e5" />
              </Pressable>
              <TextInput
                style={s.qtyUnitInput}
                value={mergeUnit}
                onChangeText={setMergeUnit}
                placeholder="enhet"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
              />
            </View>
            <Pressable
              style={[s.qtyConfirm, (mergeSelected.size < 2 || adding) && s.saveBtnDisabled]}
              onPress={confirmMerge}
              disabled={adding || mergeSelected.size < 2}
            >
              {adding
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.qtyConfirmText}>Slå ihop {mergeSelected.size} varor</Text>}
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

function ItemRow({ item, onToggle, onDelete, onEdit }: { item: ShoppingItemWithRecipe; onToggle: () => void; onDelete: () => void; onEdit: () => void }) {
  return (
    <Pressable
      style={[s.item, item.isChecked && s.itemChecked]}
      onPress={onToggle}
      onLongPress={onEdit}
    >
      <Ionicons name={item.isChecked ? 'checkbox' : 'square-outline'} size={24} color={item.isChecked ? '#10b981' : '#4f46e5'} />
      <View style={s.itemContent}>
        <View style={s.itemRow}>
          <Text style={[s.itemName, item.isChecked && s.itemNameChecked]}>{item.name}</Text>
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
  headerTitle: { paddingHorizontal: 20, paddingTop: 2 },
  backBtn: { padding: 4 },
  doneBtn: { padding: 4 },
  title: { fontSize: 26, fontWeight: '700', color: '#111827' },
  storeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  storeBtnText: { fontSize: 12, color: '#4f46e5', fontWeight: '500' },
  progressBar: { height: 3, backgroundColor: '#e5e7eb' },
  progressFill: { height: 3, backgroundColor: '#10b981' },
  list: { padding: 16, gap: 16, paddingBottom: 8 },
  listEmpty: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#374151', marginTop: 12 },
  emptySubtext: { fontSize: 13, color: '#9ca3af', marginTop: 4 },
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
  catChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
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
  mergeList: { height: 176, flexShrink: 0 },
  mergeItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  mergeItemText: { fontSize: 16, color: '#374151', flex: 1 },
  mergeDivider: { height: 1, backgroundColor: '#e5e7eb', marginTop: 4 },
});
