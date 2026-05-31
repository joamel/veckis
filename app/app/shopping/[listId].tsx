import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import { capitalize } from '../../src/lib/text';
import { ConflictBanner } from '../../src/components/ConflictBanner';
import { emitShoppingChanged } from '../../src/lib/shoppingEvents';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Dimensions,
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
import RNAnimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { useApiClient, type ShoppingListWithItems, type ShoppingItemWithRecipe } from '../../src/api/client';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useSpotlightTip } from '../../src/context/SpotlightTipContext';
import { useOnceFlag } from '../../src/hooks/useOnceFlag';
import { useHousehold } from '../../src/context/HouseholdContext';
import { usePendingRemoval } from '../../src/context/PendingRemovalContext';
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
  // From a list we always want to land on the lists overview. After the
  // import-from-menu flow (dismissTo) the back stack can be empty, so back()
  // would throw "GO_BACK was not handled" — fall back to the shopping tab.
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/shopping' as never);
  }, [router]);
  const client = useApiClient();
  const { showToast: showGlobalToast, showError } = useToast();
  const confirm = useConfirm();
  const showTip = useSpotlightTip();
  const mergeTip = useOnceFlag('seen-merge-tip');
  const mergeTipShownRef = useRef(false);
  const dupeBadgeRef = useRef<View>(null);
  const listActionsTip = useOnceFlag('seen-list-actions-tip');
  const listActionsTipShownRef = useRef(false);
  const listActionsBtnRef = useRef<View>(null);
  const { householdId } = useHousehold();
  const { pendingMenuItemRemovals } = usePendingRemoval();
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
  const mergeScrollRef = useRef<ScrollView>(null);
  const mergeRowY = useRef(0); // qty/unit row offset within the merge scroll content
  const [manualPickerSelected, setManualPickerSelected] = useState<Set<string>>(new Set());

  // Category browser modal
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserCategory, setBrowserCategory] = useState<StoreCategory | null>(null);

  // Item edit modal
  const [editingItem, setEditingItem] = useState<ShoppingItemWithRecipe | null>(null);
  const [editConflict, setEditConflict] = useState<{ msg: string; latest?: ShoppingItemWithRecipe } | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editCategory, setEditCategory] = useState<StoreCategory>('other');
  const [editCustomCategory, setEditCustomCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pure transform-only collapsing header (UI-thread, no layout = zero lag).
  // The title area (background + title) slides up under the navbar as you scroll;
  // the title text additionally scales/translates so it lands centered in the navbar.
  const insets = useSafeAreaInsets();
  const NAVBAR_HEIGHT = 48;
  const TITLE_AREA_HEIGHT = 44;
  const COLLAPSE_RANGE = TITLE_AREA_HEIGHT;
  const HEADER_TOP = insets.top;
  const TITLE_SCALE = 0.62;
  const TITLE_LEFT_PADDING = 20;
  const screenW = Dimensions.get('window').width;
  const [titleWidth, setTitleWidth] = useState(0);
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });
  // Whole title-area slides up so its background disappears under the navbar.
  const titleAreaAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [0, COLLAPSE_RANGE], [0, -TITLE_AREA_HEIGHT], Extrapolation.CLAMP) }],
  }));
  // Title text shrinks and slides diagonally from left-aligned (expanded) to
  // navbar-center (compact). translateX target computed from measured natural width
  // so it lands exactly centered regardless of title length.
  // Default transform-origin is the text's own center → scaling around center keeps
  // the natural center fixed at (LEFT_PADDING + titleWidth/2). To center the scaled
  // text on screen, translate so that new center = screenW/2.
  const targetTranslateX = titleWidth > 0
    ? screenW / 2 - (TITLE_LEFT_PADDING + titleWidth / 2)
    : 0;
  const titleTextAnimStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [0, COLLAPSE_RANGE], [0, 1], Extrapolation.CLAMP);
    const adjustY = (NAVBAR_HEIGHT - TITLE_AREA_HEIGHT) / 2;
    return {
      // Cast: reanimated 4's transform typing rejects the inferred union of
      // single-key objects; runtime is unaffected.
      transform: [
        { translateY: adjustY * t },
        { translateX: targetTranslateX * t },
        { scale: 1 - (1 - TITLE_SCALE) * t },
      ],
    } as never;
  });

  // Collapsed categories — tap category header to fold/unfold its items.
  const [collapsedCategories, setCollapsedCategories] = useState<Set<StoreCategory | 'checked'>>(new Set());
  function toggleCategoryCollapsed(cat: StoreCategory | 'checked') {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  // Staple edit modal (long-press on suggestion chip)
  const [editingStaple, setEditingStaple] = useState<StapleItem | null>(null);
  const [stapleName, setStapleName] = useState('');
  const [stapleUnit, setStapleUnit] = useState('');
  const [stapleCategory, setStapleCategory] = useState<StoreCategory>('other');
  const [savingStaple, setSavingStaple] = useState(false);

  // Store picker modal
  const [showStorePicker, setShowStorePicker] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  async function saveRename() {
    if (!listId) return;
    const newName = renameValue.trim();
    if (!newName) return;
    setRenaming(true);
    const prev = list?.name;
    setList(p => p ? { ...p, name: newName } : p);
    setShowRenameModal(false);
    try {
      await client.updateShoppingList(listId, { name: newName });
    } catch (e) {
      setList(p => p && prev !== undefined ? { ...p, name: prev } : p);
      showError(e, 'Kunde inte byta namn');
    } finally {
      setRenaming(false);
    }
  }
  const [creatingStore, setCreatingStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');

  // Category order editor
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [editCategoryOrder, setEditCategoryOrder] = useState<StoreCategory[]>([]);
  const [editCustomCategories, setEditCustomCategories] = useState<string[]>([]);
  const [newCustomCategory, setNewCustomCategory] = useState('');
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
    if (msg.type === 'items_auto_merged') {
      showGlobalToast(`Slog ihop ${msg.data.count} ${capitalize(msg.data.name)}`, 'success');
      return;
    }
    // Conflict warning: someone else changed/removed the item you have open for
    // editing. Last-write-wins still applies — this just makes the overwrite
    // visible instead of silent.
    if ((msg.type === 'item_updated' || msg.type === 'item_deleted') && editingItem && msg.data.id === editingItem.id) {
      const who = msg.actor ?? 'Någon';
      if (msg.type === 'item_deleted') {
        // Modal closes → a root toast is visible again.
        showGlobalToast(`${who} tog bort ${capitalize(editingItem.name)}`, 'neutral');
        setEditingItem(null);
        setEditConflict(null);
      } else {
        // Modal stays open → show an inline banner (toast would be behind it).
        // Distinguish a check-toggle from a real content edit so the message and
        // the "Visa senaste" button (only useful when content changed) fit.
        const n = msg.data;
        const contentChanged =
          n.name !== editingItem.name ||
          n.quantity !== editingItem.quantity ||
          (n.unit ?? '') !== (editingItem.unit ?? '') ||
          n.category !== editingItem.category;
        const checkChanged = n.isChecked !== editingItem.isChecked;
        const verb = checkChanged && !contentChanged
          ? (n.isChecked ? 'bockade av' : 'avmarkerade')
          : 'ändrade';
        setEditConflict({ msg: `${who} ${verb} ${capitalize(editingItem.name)}`, latest: contentChanged ? n : undefined });
      }
    }
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
    setTimeout(() => mergeScrollRef.current?.scrollTo({ y: 0, animated: false }), 0);
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

  // First time the merge button pulses for the user: förklara vad den är.
  useEffect(() => {
    if (mergeTip.seen !== false || mergeTipShownRef.current) return;
    if (duplicateGroups.length === 0) return;
    // Mark up-front to prevent re-scheduling if effect re-runs during the delay.
    mergeTipShownRef.current = true;
    // Small delay so the dupe button's pulse animation has measurable bounds
    // before SpotlightTip reads measureInWindow.
    setTimeout(() => {
      const shown = showTip({
        title: 'Slå ihop dubbletter',
        message: 'Den här lilla knappen visas när vi ser likadana varor på listan. Tryck på den för att slå ihop dem till en vara med samlad mängd.',
        targetRef: dupeBadgeRef,
      });
      if (shown) mergeTip.markSeen(); // else: retry next session (no markSeen)
    }, 1500); // wait for the existing pulse to finish so user sees it pulse first
  }, [duplicateGroups.length, mergeTip.seen, mergeTip.markSeen, showTip]);

  // ListActions-tip (3-prickar): visas när listan har innehåll och inget annat
  // tip körs. Förklarar att det gömmer sig fler val (rensa lista, byt butik,
  // importera veckomeny, klarmarka alla …) bakom ikonen.
  useEffect(() => {
    if (listActionsTip.seen !== false || listActionsTipShownRef.current) return;
    if (!list || list.items.length === 0) return;
    listActionsTipShownRef.current = true;
    // Generous delay so any merge tip on the same screen gets to fire first.
    const t = setTimeout(() => {
      const shown = showTip({
        title: 'Mer du kan göra med listan',
        message: 'Tryck på prickarna för fler val: byt namn, byt butik, klarmarka alla, rensa listan eller importera veckomeny.',
        targetRef: listActionsBtnRef,
      });
      if (shown) listActionsTip.markSeen();
    }, 3500);
    return () => clearTimeout(t);
  }, [list, listActionsTip.seen, listActionsTip.markSeen, showTip]);

  useEffect(() => {
    if (pendingOpenNextDupe.current && !mergeSheet && duplicateGroups.length > 0) {
      pendingOpenNextDupe.current = false;
      openMergeForDupes(duplicateGroups[0]);
    }
  }, [mergeSheet, duplicateGroups, openMergeForDupes]);

  const searchList = useMemo(() => {
    // Only surface staples added more than once — a one-off (often a typo or a
    // mistakenly added item) shouldn't pollute search. Curated ingredient
    // suggestions still cover common names, so legit items remain searchable.
    const searchableStaples = staples.filter(s => s.usageCount >= 2);
    const stapleNames = new Set(searchableStaples.map(s => s.name.toLowerCase()));
    const extra = ingredientSuggestions
      .filter(s => !stapleNames.has(s.name.toLowerCase()))
      .map(s => ({ name: s.name, id: `suggestion:${s.name}`, category: s.category } as unknown as StapleItem));
    return [...searchableStaples, ...extra];
  }, [staples, ingredientSuggestions]);

  const fuse = useMemo(() => new Fuse(searchList, { keys: ['name'], threshold: 0.35, minMatchCharLength: 1 }), [searchList]);
  const suggestions = newItem.trim().length >= 1
    ? fuse.search(newItem).slice(0, 8).map(r => r.item)
    : [];

  // Most-added staples (getStaples returns them usageCount-desc) — shown as
  // quick-add chips when the add field is empty so återkommande inköp går snabbt.
  const topStaples = useMemo(() => staples.filter(s => s.usageCount > 0).slice(0, 8), [staples]);

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
      confirm({ title: 'Fel', message: 'Kunde inte ladda listan', buttons: [{ label: 'OK' }] });
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

  // RN doesn't auto-scroll a focused TextInput into view. The merge sheet's qty/
  // unit row sits far down the content, so on focus we scroll it near the top of
  // the (keyboard-shrunk) viewport using its content-relative offset from
  // onLayout — robust vs the window/keyboard coordinate math that misfired.
  function scrollMergeRowIntoView() {
    setTimeout(() => mergeScrollRef.current?.scrollTo({ y: Math.max(0, mergeRowY.current - 16), animated: true }), 250);
  }

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
      customCategory: null,
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
      showError(err, 'Kunde inte lägga till vara');
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
      // Build the post-merge list locally so we can find next dupes synchronously
      const baseItems = list?.items ?? [];
      const updatedItems: ShoppingItemWithRecipe[] = [
        ...baseItems.filter(i => !hideIds.has(i.id) && i.id !== container.id),
        { ...container, recipe: null } as ShoppingItemWithRecipe,
      ];
      setList(prev => prev ? { ...prev, items: updatedItems } : prev);
      Keyboard.dismiss(); // drop the keyboard when moving on / closing the sheet

      // Compute next auto-dupe group from the new items
      const nameMap = new Map<string, ShoppingItemWithRecipe[]>();
      for (const it of updatedItems.filter(i => !i.isChecked && !i.id.startsWith('optimistic-'))) {
        const key = it.name.toLowerCase().trim();
        if (!nameMap.has(key)) nameMap.set(key, []);
        nameMap.get(key)!.push(it);
      }
      const justMergedKey = name.toLowerCase().trim();
      const nextGroup = [...nameMap.entries()]
        .filter(([k]) => k !== justMergedKey) // skip the group we just dealt with
        .map(([, g]) => g)
        .find(g => g.length >= 2 && !dismissedDupeKeys.has(g[0].name.toLowerCase().trim()));
      if (nextGroup) openMergeForDupes(nextGroup);
      else setMergeSheet(null);
      // Undo = delete the container, which fully unmerges (restores the sources).
      showGlobalToast(`Slog ihop ${selected.length} ${capitalize(name)}`, 'success', {
        label: 'Ångra',
        onPress: async () => {
          try { await client.deleteShoppingItem(container.id); load(); }
          catch (e) { showError(e, 'Kunde inte ångra ihopslagningen'); }
        },
      });
    } catch (e) {
      showError(e, 'Kunde inte slå ihop varor');
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
    } catch (e) {
      setList(prev => prev ? { ...prev, items: prev.items.map(i => ids.includes(i.id) ? { ...i, isChecked: false } : i) } : prev);
      showError(e, 'Kunde inte klarmarkera alla varor');
    }
  }

  async function toggleItem(item: ShoppingItemWithRecipe) {
    setList(prev =>
      prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, isChecked: !i.isChecked } : i) } : prev
    );
    try {
      const updated = await client.checkShoppingItem(item.id, !item.isChecked);
      setList(prev => prev ? { ...prev, items: prev.items.map(i => i.id === updated.id ? { ...updated, recipe: item.recipe } : i) } : prev);
    } catch (e) {
      setList(prev =>
        prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? item : i) } : prev
      );
      showError(e, 'Kunde inte bocka av varan');
    }
  }

  function fillEditForm(item: ShoppingItemWithRecipe) {
    setEditName(capitalize(item.name));
    setEditQty(item.quantity !== 1 || item.unit ? String(item.quantity) : '');
    setEditUnit(item.unit ?? '');
    setEditCategory(item.category as StoreCategory);
    setEditCustomCategory((item as { customCategory?: string | null }).customCategory ?? null);
  }

  function openEditItem(item: ShoppingItemWithRecipe) {
    setEditingItem(item);
    setEditConflict(null);
    fillEditForm(item);
  }

  // "Visa senaste": pull the concurrent edit's values into the form on demand.
  function applyLatestEdit() {
    if (!editConflict?.latest) return;
    fillEditForm(editConflict.latest);
    setEditConflict(null);
  }

  async function saveEditItem() {
    if (!editingItem) return;
    setSaving(true);
    const qty = parseFloat(editQty.replace(',', '.')) || 1;
    const unit = editUnit.trim() || null;
    const name = (editName.trim() || editingItem.name).toLowerCase();
    const snapshot = editingItem;
    // Optimistic: update list + close modal before awaiting backend
    const optimisticItems = (list?.items ?? []).map(i =>
      i.id === editingItem.id ? { ...i, name, quantity: qty, unit, category: editCategory, customCategory: editCustomCategory } : i
    );
    setList(prev => prev ? { ...prev, items: optimisticItems } : prev);
    setEditingItem(null);
    try {
      const updated = await client.updateShoppingItem(snapshot.id, {
        name,
        quantity: qty,
        unit,
        category: editCategory,
        customCategory: editCustomCategory,
      });
      const savedRecipe = snapshot.recipe;
      const finalItems = optimisticItems.map(i =>
        i.id === updated.id ? { ...updated, recipe: savedRecipe } : i
      );
      setList(prev => prev ? { ...prev, items: finalItems } : prev);
      if (householdId) {
        const categoryChanged = editCategory !== snapshot.category;
        const unitChanged = unit !== snapshot.unit;
        if (categoryChanged || unitChanged) {
          client.upsertStaple({ householdId, name, category: editCategory, unit }).catch(() => {});
        }
      }
      const dupes = finalItems.filter(i => !i.isChecked && i.name.toLowerCase().trim() === name);
      if (dupes.length >= 2) {
        // Auto-merge silently if all dupes share the same unit (normalized)
        const norm = (u: string | null | undefined) => (u ?? '').trim().toLowerCase();
        const sameUnit = dupes.every(d => norm(d.unit) === norm(unit));
        if (sameUnit) {
          autoMergeDupes(dupes, name, editCategory, unit);
        } else {
          openMergeForDupes(dupes, updated);
        }
      }
    } catch (e) {
      // Rollback optimistic
      setList(prev => prev ? { ...prev, items: prev.items.map(i => i.id === snapshot.id ? snapshot : i) } : prev);
      showError(e, 'Kunde inte spara ändringen');
    } finally {
      setSaving(false);
    }
  }

  async function autoMergeDupes(
    dupes: ShoppingItemWithRecipe[],
    name: string,
    category: StoreCategory,
    unit: string | null,
  ) {
    const totalQty = dupes.reduce((sum, d) => sum + (d.quantity ?? 1), 0);
    const sourceIds = dupes.map(d => d.id);
    const hideIds = new Set(sourceIds);
    try {
      const container = await client.mergeShoppingItems({
        sourceIds, name, quantity: totalQty, unit, category,
      });
      setList(prev => prev ? {
        ...prev,
        items: [
          ...prev.items.filter(i => !hideIds.has(i.id) && i.id !== container.id),
          { ...container, recipe: null } as ShoppingItemWithRecipe,
        ],
      } : prev);
      showGlobalToast(`Slog ihop ${dupes.length} ${capitalize(name)}`, 'success', {
        label: 'Ångra',
        onPress: async () => {
          try { await client.deleteShoppingItem(container.id); load(); }
          catch (e) { showError(e, 'Kunde inte ångra ihopslagningen'); }
        },
      });
    } catch {
      // Silent — user can still merge manually via dupe button
    }
  }

  async function deleteItem(itemId: string) {
    setList(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== itemId) } : prev);
    try {
      await client.deleteShoppingItem(itemId);
      emitShoppingChanged(); // keep menu's "I inköpslistan"-tag + filters in sync
    } catch (e) {
      showError(e, 'Kunde inte ta bort vara');
      load();
    }
  }

  async function completeList() {
    if (!listId) return;
    confirm({
      title: 'Rensa lista?',
      message: 'Alla varor tas bort men listan finns kvar.',
      buttons: [
      { label: 'Rensa', style: 'destructive', onPress: () => {
        // Optimistic clear with undo: hide items from UI, defer backend call 5s
        const snapshot = list?.items ?? [];
        setList(prev => prev ? { ...prev, items: [] } : prev);
        let cancelled = false;
        showGlobalToast('Inköpslistan rensad', 'neutral', {
          label: 'Ångra',
          onPress: () => {
            cancelled = true;
            setList(prev => prev ? { ...prev, items: snapshot } : prev);
          },
        });
        setTimeout(async () => {
          if (cancelled) return;
          try {
            await client.clearShoppingList(listId);
            emitShoppingChanged(); // refresh the lists overview's count
          } catch (e) {
            setList(prev => prev ? { ...prev, items: snapshot } : prev);
            showError(e, 'Kunde inte rensa listan');
          }
        }, 5000);
      }},
      { label: 'Avbryt', style: 'cancel' },
      ],
    });
  }

  function openStapleEditor(suggestion: StapleItem) {
    // Suggestion chips include both real staples (DB row, has cuid id) and ingredient
    // suggestions (synthetic id "suggestion:<name>", no DB row yet). For the latter we
    // open the editor in "create" mode — saving creates the staple.
    setEditingStaple(suggestion);
    setStapleName(suggestion.name);
    setStapleUnit(suggestion.unit ?? '');
    setStapleCategory(suggestion.category as StoreCategory);
  }

  async function saveStapleEdit() {
    if (!editingStaple || !householdId) return;
    const newName = stapleName.trim().toLowerCase();
    if (!newName) return;
    setSavingStaple(true);
    const original = editingStaple;
    const isNew = original.id.startsWith('suggestion:');
    const optimistic: StapleItem = { ...original, name: newName, unit: stapleUnit.trim() || null, category: stapleCategory };
    if (!isNew) {
      setStaples(prev => prev.map(s2 => s2.id === original.id ? optimistic : s2));
    }
    setEditingStaple(null);
    try {
      // Rename of existing staple: delete old, create new (upsert keyed on householdId+name).
      if (!isNew && newName !== original.name) {
        await client.deleteStaple(original.id);
      }
      const saved = await client.upsertStaple({
        householdId,
        name: newName,
        category: stapleCategory,
        unit: stapleUnit.trim() || null,
      });
      setStaples(prev => {
        const without = prev.filter(s2 => s2.id !== original.id && s2.id !== saved.id);
        return [...without, saved];
      });
      showGlobalToast(isNew ? `${capitalize(newName)} sparad som basvara` : `${capitalize(newName)} uppdaterad`, 'success');
    } catch (e) {
      if (!isNew) setStaples(prev => prev.map(s2 => s2.id === original.id ? original : s2));
      showError(e, 'Kunde inte spara basvaran');
    } finally {
      setSavingStaple(false);
    }
  }

  async function deleteStaple() {
    if (!editingStaple) return;
    const target = editingStaple;
    if (target.id.startsWith('suggestion:')) {
      // Synthetic suggestion — nothing to delete server-side, just close.
      setEditingStaple(null);
      return;
    }
    confirm({
      title: 'Ta bort basvara',
      message: `Ta bort "${capitalize(target.name)}" från basvarorna?`,
      buttons: [
        { label: 'Ta bort', style: 'destructive', onPress: async () => {
          setStaples(prev => prev.filter(s2 => s2.id !== target.id));
          setEditingStaple(null);
          try {
            await client.deleteStaple(target.id);
          } catch (e) {
            setStaples(prev => [...prev, target]);
            showError(e, 'Kunde inte ta bort basvaran');
          }
        } },
        { label: 'Avbryt', style: 'cancel' },
      ],
    });
  }

  async function selectStore(storeId: string | null) {
    if (!listId) return;
    try {
      const updated = await client.updateShoppingList(listId, { storeId });
      setList(updated);
      setShowStorePicker(false);
    } catch (e) {
      showError(e, 'Kunde inte byta butik');
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
    } catch (e) {
      showError(e, 'Kunde inte skapa butik');
    } finally {
      setCreatingStore(false);
    }
  }

  function openCategoryEditor(store: Store) {
    setEditingStore(store);
    setEditCategoryOrder((store.categoryOrder as StoreCategory[]).length
      ? store.categoryOrder as StoreCategory[]
      : [...DEFAULT_CATEGORY_ORDER]);
    setEditCustomCategories([...((store.customCategories as string[] | undefined) ?? [])]);
    setNewCustomCategory('');
  }

  function addCustomCategory() {
    const trimmed = newCustomCategory.trim();
    if (!trimmed) return;
    if (editCustomCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      confirm({ title: 'Finns redan', message: `Kategorin "${trimmed}" finns redan.`, buttons: [{ label: 'OK' }] });
      return;
    }
    setEditCustomCategories(prev => [...prev, trimmed]);
    setNewCustomCategory('');
  }

  function removeCustomCategory(name: string) {
    setEditCustomCategories(prev => prev.filter(c => c !== name));
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
      const updated = await client.updateStore(editingStore.id, { categoryOrder: editCategoryOrder, customCategories: editCustomCategories });
      setStores(prev => prev.map(s => s.id === updated.id ? updated : s));
      if (list?.store?.id === updated.id) {
        setList(prev => prev ? { ...prev, store: updated } : prev);
      }
      setEditingStore(null);
    } catch (e) {
      showError(e, 'Kunde inte spara ordning');
    } finally {
      setSavingOrder(false);
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  if (!list) return null;

  // Items tied to a meal that's pending removal stay visible but rendered
  // in a pending state (faded + strikethrough) until backend commits in 5s.
  const isPending = (item: ShoppingItemWithRecipe) => !!item.menuItemId && pendingMenuItemRemovals.has(item.menuItemId);
  const unchecked = list.items.filter(i => !i.isChecked);
  const checked = list.items.filter(i => i.isChecked);
  const allItems = [...unchecked, ...checked];
  const customCategories: string[] = (list?.store?.customCategories as string[] | undefined) ?? [];
  const categoryGroups = buildCategoryGroups(unchecked, categoryOrder, customCategories);

  return (
    <View style={s.container}>
      <RNAnimated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.list, allItems.length === 0 && s.listEmpty, { paddingTop: HEADER_TOP + NAVBAR_HEIGHT + TITLE_AREA_HEIGHT + 8 }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* Butik + dubblettknapp som första scrollbara rad — försvinner upp
            tillsammans med kategorierna när användaren scrollar. */}
        <View style={s.scrollMeta}>
          <Pressable onPress={() => setShowStorePicker(true)} style={s.storeBtn}>
            <Ionicons name="storefront-outline" size={16} color="#4f46e5" />
            <Text style={s.storeBtnText}>{list.store?.name ?? 'Välj butik'}</Text>
          </Pressable>
          {duplicateGroups.length > 0 && (
            <Animated.View ref={dupeBadgeRef} style={{ transform: [{ scale: dupeButtonScale }] }}>
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
        {categoryGroups.map(group => {
          const key = group.isCustom ? `c:${group.category}` : group.category as string;
          const collapsed = collapsedCategories.has(key as StoreCategory | 'checked');
          const label = group.isCustom
            ? `🏷️ ${group.category}`
            : `${CATEGORY_EMOJIS[group.category as StoreCategory]} ${CATEGORY_LABELS[group.category as StoreCategory]}`;
          return (
            <View key={key} style={s.categoryGroup}>
              <Pressable style={s.categoryHeader} onPress={() => toggleCategoryCollapsed(key as StoreCategory | 'checked')} hitSlop={4}>
                <Text style={s.categoryLabel}>
                  {label}
                  {collapsed ? ` (${group.items.length})` : ''}
                </Text>
                <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color="#9ca3af" />
              </Pressable>
              {!collapsed && group.items.map(item => (
                <ItemRow key={item.id} item={item} pending={isPending(item)} onToggle={() => toggleItem(item)} onEdit={() => openEditItem(item)} />
              ))}
            </View>
          );
        })}

        {/* Checked items */}
        {checked.length > 0 && (() => {
          const collapsed = collapsedCategories.has('checked');
          return (
            <View style={s.categoryGroup}>
              <Pressable style={s.categoryHeader} onPress={() => toggleCategoryCollapsed('checked')} hitSlop={4}>
                <Text style={[s.categoryLabel, { color: '#9ca3af' }]}>
                  Bockat{collapsed ? ` (${checked.length})` : ''}
                </Text>
                <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color="#d1d5db" />
              </Pressable>
              {!collapsed && checked.map(item => (
                <ItemRow key={item.id} item={item} pending={isPending(item)} onToggle={() => toggleItem(item)} onEdit={() => openEditItem(item)} />
              ))}
            </View>
          );
        })()}
      </RNAnimated.ScrollView>

      {/* Navbar background — pinned (incl. safe area top) */}
      <View style={[s.navbarBgAbs, { height: HEADER_TOP + NAVBAR_HEIGHT }]} pointerEvents="none" />

      {/* Title-area background — slides up so it visually scrolls away too */}
      <RNAnimated.View
        style={[s.titleAreaAbs, { top: HEADER_TOP + NAVBAR_HEIGHT, height: TITLE_AREA_HEIGHT }, titleAreaAnimStyle]}
        pointerEvents="none"
      />

      {/* Title text — absolutely positioned over the title-area, slides with it.
          Inner wrap uses alignSelf:flex-start so the text View shrinks to its
          natural width (needed for onLayout to give us the actual text width). */}
      <RNAnimated.View
        style={[s.titleTextWrap, { top: HEADER_TOP + NAVBAR_HEIGHT, height: TITLE_AREA_HEIGHT }, titleAreaAnimStyle]}
        pointerEvents="none"
      >
        <RNAnimated.View style={[{ alignSelf: 'flex-start' }, titleTextAnimStyle]}>
          <Text
            style={s.title}
            numberOfLines={1}
            onLayout={e => setTitleWidth(e.nativeEvent.layout.width)}
          >
            {list.name}
          </Text>
        </RNAnimated.View>
      </RNAnimated.View>

      {/* Progress bar — pinned under the navbar so it's always visible */}
      {checked.length > 0 && unchecked.length > 0 && (
        <View style={[s.progressBar, { position: 'absolute', top: HEADER_TOP + NAVBAR_HEIGHT, left: 0, right: 0, zIndex: 35 }]}>
          <View style={[s.progressFill, { width: `${(checked.length / allItems.length) * 100}%` as `${number}%` }]} />
        </View>
      )}

      {/* Navbar buttons — rendered last so they always sit on top */}
      <View style={[s.navbarButtonsAbs, { top: HEADER_TOP, height: NAVBAR_HEIGHT }]}>
        <Pressable onPress={goBack} style={s.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Tillbaka">
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable ref={listActionsBtnRef} onPress={() => setShowActionsMenu(true)} style={s.doneBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fler åtgärder">
          <Ionicons name="ellipsis-vertical" size={20} color="#111827" />
        </Pressable>
      </View>

      {/* Autocomplete chips + add bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        enabled={keyboardVisible}
      >
        {suggestions.length > 0 ? (
          <View style={s.chipScroll}>
            <View style={s.chipRow}>
              {suggestions.map(s2 => (
                <TouchableOpacity
                  key={s2.id}
                  style={s.chip}
                  onPress={() => openQtySheet(s2.name, s2.category as StoreCategory)}
                  onLongPress={() => openStapleEditor(s2)}
                  delayLongPress={350}
                >
                  <Text style={s.chipText}>{capitalize(s2.name)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : keyboardVisible && newItem.trim().length === 0 && topStaples.length > 0 ? (
          <View style={s.commonScroll}>
            <Text style={s.chipHint}>Dina vanligaste</Text>
            <View style={s.chipRowWrap}>
              {topStaples.map(s2 => (
                <TouchableOpacity
                  key={s2.id}
                  style={s.chip}
                  onPress={() => openQtySheet(s2.name, s2.category as StoreCategory)}
                  onLongPress={() => openStapleEditor(s2)}
                  delayLongPress={350}
                >
                  <Text style={s.chipText}>{capitalize(s2.name)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
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
              <Pressable
                style={[s.storeOption, s.storeOptionFlex, list.storeId === store.id && s.storeOptionActive]}
                onPress={() => selectStore(store.id)}
                onLongPress={() => { setShowStorePicker(false); openCategoryEditor(store); }}
                delayLongPress={350}
              >
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
                  // Mest använda överst, alfabetiskt som andrahandssortering.
                  .sort((a, b) => ((b.usageCount ?? 0) - (a.usageCount ?? 0)) || a.name.localeCompare(b.name, 'sv'))
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kavWrap} pointerEvents="box-none">
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <ConflictBanner message={editConflict?.msg ?? null} onShowLatest={editConflict?.latest ? applyLatestEdit : undefined} />
          <Text style={s.editLabel}>Namn</Text>
          <TextInput
            style={s.editInput}
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
              onChangeText={v => setEditUnit(v.toLowerCase())}
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
              {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => {
                const active = !editCustomCategory && editCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    style={[s.catChip, active && s.catChipActive]}
                    onPress={() => { setEditCategory(cat); setEditCustomCategory(null); }}
                  >
                    <Text style={[s.catChipText, active && s.catChipTextActive]} numberOfLines={1}>
                      {CATEGORY_EMOJIS[cat]} {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                );
              })}
              {customCategories.map(name => {
                const active = editCustomCategory === name;
                return (
                  <Pressable
                    key={`c:${name}`}
                    style={[s.catChip, active && s.catChipActive]}
                    onPress={() => setEditCustomCategory(active ? null : name)}
                  >
                    <Text style={[s.catChipText, active && s.catChipTextActive]} numberOfLines={1}>
                      🏷️ {name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Staple edit modal (from long-press on suggestion chip) */}
      <Modal visible={!!editingStaple} transparent animationType="slide" onRequestClose={() => setEditingStaple(null)}>
        <Pressable style={s.overlay} onPress={() => setEditingStaple(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kavWrap} pointerEvents="box-none">
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>
            {editingStaple?.id.startsWith('suggestion:') ? 'Spara som basvara' : 'Redigera basvara'}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={s.editLabel}>Namn</Text>
          <TextInput
            style={s.editInput}
            value={stapleName}
            onChangeText={setStapleName}
            placeholder="Varunamn"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            returnKeyType="done"
          />
          <Text style={s.editLabel}>Enhet (valfritt)</Text>
          <TextInput
            style={s.editInput}
            value={stapleUnit}
            onChangeText={v => setStapleUnit(v.toLowerCase())}
            placeholder="t.ex. st, dl, paket"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            returnKeyType="done"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.unitChipScroll} keyboardShouldPersistTaps="handled">
            <View style={s.unitChipRow}>
              {['st', 'dl', 'ml', 'l', 'g', 'kg', 'msk', 'tsk', 'krm', 'paket', 'påse', 'burk', 'flaska'].map(u => (
                <Pressable key={u} style={[s.unitChip, stapleUnit === u && s.unitChipActive]} onPress={() => setStapleUnit(v => v === u ? '' : u)}>
                  <Text style={[s.unitChipText, stapleUnit === u && s.unitChipTextActive]}>{u}</Text>
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
                  style={[s.catChip, stapleCategory === cat && s.catChipActive]}
                  onPress={() => setStapleCategory(cat)}
                >
                  <Text style={[s.catChipText, stapleCategory === cat && s.catChipTextActive]} numberOfLines={1}>
                    {CATEGORY_EMOJIS[cat]} {CATEGORY_LABELS[cat]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          </ScrollView>
          <View style={s.editActions}>
            {!editingStaple?.id.startsWith('suggestion:') && (
              <Pressable style={s.deleteBtn} onPress={deleteStaple}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={s.deleteBtnText}>Ta bort</Text>
              </Pressable>
            )}
            <Pressable
              style={[s.saveBtn, (savingStaple || !stapleName.trim()) && s.saveBtnDisabled, { flex: 1, marginTop: 0 }]}
              onPress={saveStapleEdit}
              disabled={savingStaple || !stapleName.trim()}
            >
              {savingStaple ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Spara</Text>}
            </Pressable>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Category order editor */}
      <Modal visible={!!editingStore} transparent animationType="slide" onRequestClose={() => setEditingStore(null)}>
        <Pressable style={s.overlay} onPress={() => setEditingStore(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kavWrap} pointerEvents="box-none">
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{editingStore?.name} — kategoriordning</Text>
          <ScrollView style={{ maxHeight: '70%' }} contentContainerStyle={{ paddingBottom: 12 }}>
            <Text style={s.sheetSub}>Dra om ordningen med pilarna så den matchar butikens layout</Text>
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
            <Text style={[s.sheetSub, { marginTop: 16 }]}>Egna kategorier</Text>
            {editCustomCategories.map(name => (
              <View key={name} style={s.catRow}>
                <Text style={s.catRowLabel}>🏷️ {name}</Text>
                <Pressable onPress={() => removeCustomCategory(name)} style={s.catArrow} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color="#ef4444" />
                </Pressable>
              </View>
            ))}
            <View style={s.newStoreRow}>
              <TextInput
                style={[s.addInput, { flex: 1 }]}
                placeholder="Ny egen kategori"
                placeholderTextColor="#9ca3af"
                value={newCustomCategory}
                onChangeText={setNewCustomCategory}
                returnKeyType="done"
                onSubmitEditing={addCustomCategory}
              />
              <Pressable
                style={[s.addBtn, !newCustomCategory.trim() && s.addBtnDisabled]}
                onPress={addCustomCategory}
                disabled={!newCustomCategory.trim()}
              >
                <Ionicons name="add" size={22} color="#fff" />
              </Pressable>
            </View>
          </ScrollView>
          <Pressable style={[s.saveBtn, savingOrder && s.saveBtnDisabled]} onPress={saveCategoryOrder} disabled={savingOrder}>
            {savingOrder ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Spara</Text>}
          </Pressable>
        </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* Quantity sheet */}
      <Modal visible={!!qtySheet} transparent animationType="slide" onRequestClose={() => setQtySheet(null)}>
        <Pressable style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.3)' }]} onPress={() => setQtySheet(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kavWrap} pointerEvents="box-none">
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
                onChangeText={v => setQtyUnit(v.toLowerCase())}
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kavWrap} pointerEvents="box-none">
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
            <ScrollView ref={mergeScrollRef} style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
                    {capitalize(item.name)} — {String(item.quantity ?? 1).replace('.', ',')}{item.unit ? ` ${item.unit.toLowerCase()}` : ''}
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
              <View
                style={[s.qtyStepper, { gap: 6, marginVertical: 4 }]}
                onLayout={e => { mergeRowY.current = e.nativeEvent.layout.y; }}
              >
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
                  onFocus={scrollMergeRowIntoView}
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
                  onChangeText={v => setMergeUnit(v.toLowerCase())}
                  placeholder="enhet"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  onFocus={scrollMergeRowIntoView}
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
            {/* Fixed action bar — always visible, but hidden while typing so it
                doesn't float above the keyboard and steal the list's height. */}
            {mergeSheet && mergeSheet.items.length > 0 && !keyboardVisible && (<>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Actions menu (3-dot) */}
      <Modal visible={showActionsMenu} transparent animationType="fade" onRequestClose={() => setShowActionsMenu(false)}>
        <Pressable style={s.overlay} onPress={() => setShowActionsMenu(false)} />
        <View style={s.actionsMenu}>
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => { setShowActionsMenu(false); setRenameValue(list.name); setShowRenameModal(true); }}
          >
            <Ionicons name="create-outline" size={20} color="#4f46e5" />
            <Text style={s.actionsMenuText}>Byt namn på listan</Text>
          </Pressable>
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => { setShowActionsMenu(false); setShowStorePicker(true); }}
          >
            <Ionicons name="storefront-outline" size={20} color="#4f46e5" />
            <Text style={s.actionsMenuText}>{list.store?.name ? `Butik: ${list.store.name}` : 'Välj butik'}</Text>
          </Pressable>
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

      {/* Rename list modal */}
      <Modal visible={showRenameModal} transparent animationType="slide" onRequestClose={() => setShowRenameModal(false)}>
        <Pressable style={s.overlay} onPress={() => setShowRenameModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kavWrap} pointerEvents="box-none">
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Byt namn på listan</Text>
            <TextInput
              style={s.editInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Listans namn"
              placeholderTextColor="#9ca3af"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveRename}
            />
            <Pressable
              style={[s.saveBtn, (!renameValue.trim() || renaming) && s.saveBtnDisabled]}
              onPress={saveRename}
              disabled={!renameValue.trim() || renaming}
            >
              {renaming ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Spara</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
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
                      {capitalize(item.name)} — {String(item.quantity ?? 1).replace('.', ',')}{item.unit ? ` ${item.unit.toLowerCase()}` : ''}
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
    </View>
  );
}

type CategoryGroup = { category: StoreCategory | string; isCustom: boolean; items: ShoppingItemWithRecipe[] };

function buildCategoryGroups(
  items: ShoppingItemWithRecipe[],
  order: StoreCategory[],
  customCategories: string[] = [],
): CategoryGroup[] {
  // Items with customCategory go under that key; others under their enum category.
  const enumMap = new Map<StoreCategory, ShoppingItemWithRecipe[]>();
  const customMap = new Map<string, ShoppingItemWithRecipe[]>();
  for (const item of items) {
    if (item.customCategory) {
      if (!customMap.has(item.customCategory)) customMap.set(item.customCategory, []);
      customMap.get(item.customCategory)!.push(item);
    } else {
      const cat = item.category as StoreCategory;
      if (!enumMap.has(cat)) enumMap.set(cat, []);
      enumMap.get(cat)!.push(item);
    }
  }
  const orderedEnum = [...order.filter(c => enumMap.has(c))];
  for (const cat of enumMap.keys()) {
    if (!orderedEnum.includes(cat)) orderedEnum.push(cat);
  }
  const orderedCustom = [...customCategories.filter(c => customMap.has(c))];
  for (const cat of customMap.keys()) {
    if (!orderedCustom.includes(cat)) orderedCustom.push(cat);
  }
  const sortItems = (arr: ShoppingItemWithRecipe[]) => arr.sort((a, b) => {
    if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
    return a.name.localeCompare(b.name, 'sv');
  });
  return [
    ...orderedEnum.map(cat => ({ category: cat, isCustom: false, items: sortItems(enumMap.get(cat)!) })),
    ...orderedCustom.map(cat => ({ category: cat, isCustom: true, items: sortItems(customMap.get(cat)!) })),
  ];
}

function ItemRow({ item, onToggle, onEdit, pending }: { item: ShoppingItemWithRecipe; onToggle: () => void; onEdit: () => void; pending?: boolean }) {
  return (
    <Pressable
      style={[s.item, item.isChecked && s.itemChecked, pending && s.itemPending]}
      onPress={pending ? undefined : onToggle}
      onLongPress={pending ? undefined : onEdit}
    >
      <Ionicons name={item.isChecked ? 'checkbox' : 'square-outline'} size={24} color={item.isChecked ? '#10b981' : '#4f46e5'} />
      <View style={s.itemContent}>
        <View style={s.itemRow}>
          <Text style={[s.itemName, (item.isChecked || pending) && s.itemNameChecked]}>{capitalize(item.name)}</Text>
          {(item.quantity !== 1 || item.unit) && (
            <Text style={[s.itemQty, (item.isChecked || pending) && s.itemNameChecked]}>{String(item.quantity).replace('.', ',')}{item.unit ? ` ${item.unit}` : ''}</Text>
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
  headerNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  headerStack: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  titleSlide: { paddingHorizontal: 20, paddingBottom: 6 },
  scrollMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8, paddingTop: 4, gap: 8 },
  titleAreaAbs: { position: 'absolute', left: 0, right: 0, backgroundColor: '#f9fafb', zIndex: 10 },
  navbarBgAbs: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#f9fafb', zIndex: 5 },
  navbarButtonsAbs: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, zIndex: 30 },
  titleTextWrap: { position: 'absolute', left: 20, right: 20, justifyContent: 'center', alignItems: 'flex-start', zIndex: 25 },
  headerNavPinned: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  headerTitleAbs: { position: 'absolute', left: 0, right: 0, zIndex: 10, paddingHorizontal: 20, backgroundColor: '#fff', overflow: 'hidden' },
  actionsMenu: { position: 'absolute', top: 56, right: 12, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 6, minWidth: 220, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  actionsMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  actionsMenuText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  actionsMenuDivider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 4 },
  headerTitle: { paddingHorizontal: 20, paddingTop: 5, paddingBottom: 5 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  backBtn: { padding: 4 },
  doneBtn: { padding: 4 },
  title: { fontSize: 26, fontWeight: '700', color: '#111827' },
  titleCompact: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#111827', paddingHorizontal: 8 },
  storeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  storeBtnText: { fontSize: 16, color: '#4f46e5', fontWeight: '600' },
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
  itemPending: { opacity: 0.4, backgroundColor: '#fef2f2' },
  itemContent: { flex: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  itemName: { fontSize: 16, color: '#111827', flex: 1 },
  itemNameChecked: { textDecorationLine: 'line-through', color: '#9ca3af' },
  itemQty: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  chipScroll: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6', maxHeight: 44 },
  commonScroll: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 6, paddingBottom: 2 },
  chipHint: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5, paddingHorizontal: 12 },
  chipRowWrap: { paddingHorizontal: 12, paddingVertical: 6, gap: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  chipRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row', alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#eef2ff', borderRadius: 20 },
  chipText: { fontSize: 13, color: '#4f46e5', fontWeight: '500' },
  addBar: { flexDirection: 'row', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6', gap: 10, alignItems: 'center' },
  browseBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  addInput: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, backgroundColor: '#f9fafb' },
  addBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  addBtnDisabled: { opacity: 0.4 },
  overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.7)' },
  kavWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 12, maxHeight: '85%' },
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
