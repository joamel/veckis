import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { runOnJS } from 'react-native-reanimated';
import { useApiClient, type WeekMenuItemWithRecipe, type RecipeWithIngredients, type ShoppingListWithItems } from '../../src/api/client';
import { useToast } from '../../src/context/ToastContext';
import { useHousehold } from '../../src/context/HouseholdContext';
import { usePendingRemoval } from '../../src/context/PendingRemovalContext';
import { getISOWeek, addWeeks, getISOWeekMonday } from '../../src/lib/week';
import { useHaptics } from '../../src/hooks/useHaptics';
import { useTablet } from '../../src/hooks/useTablet';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState } from '../../src/components/EmptyState';
import { MenuTemplatesModal } from '../../src/components/MenuTemplatesModal';
import { WeekNav } from '../../src/components/WeekNav';
import { DatePickerModal } from '../../src/components/DatePickerModal';
import type { WeekDay } from '@veckis/shared';

const DAYS: { key: WeekDay; label: string; short: string }[] = [
  { key: 'mon', label: 'Måndag', short: 'Mån' },
  { key: 'tue', label: 'Tisdag', short: 'Tis' },
  { key: 'wed', label: 'Onsdag', short: 'Ons' },
  { key: 'thu', label: 'Torsdag', short: 'Tor' },
  { key: 'fri', label: 'Fredag', short: 'Fre' },
  { key: 'sat', label: 'Lördag', short: 'Lör' },
  { key: 'sun', label: 'Söndag', short: 'Sön' },
];

const MONTH_NAMES = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

function getWeekMonday(weekOffset: number): Date {
  const d = addWeeks(new Date(), weekOffset);
  const dow = d.getDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

interface AggIngredient {
  key: string;
  name: string;
  unit: string | null;
  category: string | undefined;
  totalQty: number | null; // null = unmeasured (no quantity to do math on)
  measured: boolean;
  recipeTitles: string[];
  sources: { menuItemId: string; recipeId: string; qty: number | null }[];
}

export default function MenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bulkTransfer?: string; originListId?: string; addRecipeId?: string; day?: string }>();
  const addRecipeTriggeredRef = useRef(false);
  const bulkTransferTriggeredRef = useRef(false);
  const client = useApiClient();
  const { showToast: showGlobalToast, showError } = useToast();
  const scaleWarnedRef = useRef<Set<string>>(new Set());
  const { householdId } = useHousehold();
  const { markPending, clearPending, cancelAllPending, pendingMenuItemRemovals, pendingCount } = usePendingRemoval();
  const { fs, sp } = useTablet();

  const [weekOffset, setWeekOffset] = useState(0);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const weekMonday = useMemo(() => getWeekMonday(weekOffset), [weekOffset]);
  const { weekYear, weekNumber } = useMemo(() => getISOWeek(weekMonday), [weekMonday]);

  const weekLabel = useMemo(() => {
    const date = new Date(weekMonday);
    const year = date.getFullYear();
    return `Vecka ${weekNumber}, ${year}`;
  }, [weekMonday, weekNumber]);

  const [menuItems, setMenuItems] = useState<WeekMenuItemWithRecipe[]>([]);
  const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingListWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferSheet, setTransferSheet] = useState<WeekMenuItemWithRecipe | null>(null);
  const [transferringListId, setTransferringListId] = useState<string | null>(null);
  const [bulkTransferringListId, setBulkTransferringListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  // Per-menu-item: which lists have items from it (keyed by menuItemId for per-instance tracking)
  type ListEntry = { listId: string; listName: string; itemCount: number };
  const [recipeListMap, setRecipeListMap] = useState<Record<string, ListEntry[]>>({});
  // Cleanup prompt after removing from menu
  const [cleanupPrompt, setCleanupPrompt] = useState<{ menuItem: WeekMenuItemWithRecipe; lists: ListEntry[] } | null>(null);
  const [selectedCleanupLists, setSelectedCleanupLists] = useState<Set<string>>(new Set());

  // Two-step modal: 'day' → pick a day, 'recipe' → pick a recipe
  const [showPicker, setShowPicker] = useState(false);
  const [pickerStep, setPickerStep] = useState<'day' | 'recipe'>('day');
  const [pickingForDay, setPickingForDay] = useState<WeekDay | null>(null);

  // Bulk transfer modal: select which recipes to transfer
  const [showBulkTransferModal, setShowBulkTransferModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedRecipesForTransfer, setSelectedRecipesForTransfer] = useState<Set<string>>(new Set());
  const [bulkTransferStep, setBulkTransferStep] = useState<'week' | 'recipe' | 'ingredients' | 'list'>('recipe');
  // Inventory step (aggregated across selected recipes). ONE source of truth that
  // both tabs read/write: `haveAtHome` (amount on hand) for measured ingredients,
  // `hadUnmeasured` (have it / not) for ingredients without a quantity. The tab is
  // only a view/input switch — both always apply to the transfer.
  const [inventoryMode, setInventoryMode] = useState<'check' | 'amount'>('check');
  const [haveAtHome, setHaveAtHome] = useState<Record<string, number>>({}); // aggKey -> amount on hand
  const [hadUnmeasured, setHadUnmeasured] = useState<Set<string>>(new Set()); // unmeasured ingredients marked "har hemma"
  const [allMenus, setAllMenus] = useState<WeekMenuItemWithRecipe[]>([]);
  const [bulkTransferWeek, setBulkTransferWeek] = useState<{ weekYear: number; weekNumber: number } | null>(null);

  // Replace recipe: item being replaced
  const [replaceTarget, setReplaceTarget] = useState<WeekMenuItemWithRecipe | null>(null);

  const [editMode, setEditMode] = useState(false);

  // Edit recipe modal
  const [menuItemServings, setMenuItemServings] = useState<Record<string, number>>({});

  function getScaleRatio(item: WeekMenuItemWithRecipe): number {
    const base = item.recipe.servings;
    const scaled = menuItemServings[item.id] ?? base;
    return base > 0 ? scaled / base : 1;
  }

  function scaleQty(qty: number | null, ratio: number): number | null {
    if (qty == null) return null;
    const n = qty * ratio;
    if (n % 1 === 0) return n;
    if (n < 1) return Math.round(n * 4) / 4;
    return Math.round(n * 2) / 2;
  }

  const fmtQty = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

  function resetInventory() {
    setInventoryMode('check');
    setHaveAtHome({});
    setHadUnmeasured(new Set());
  }

  // Menu items already transferred — scoped to the target list when we came from
  // a specific list (originListId), otherwise across all lists (matches the
  // "I inköpslistan"-markering). Used to exclude them from selection + inventory.
  const transferredMenuItemIds = useMemo(() => {
    const lists = params.originListId
      ? shoppingLists.filter(l => l.id === params.originListId)
      : shoppingLists;
    return new Set(lists.flatMap(l => l.items.map(i => i.menuItemId).filter(Boolean) as string[]));
  }, [shoppingLists, params.originListId]);

  // Ingredients across the selected recipes, merged into one row per name+unit
  // (with provenance), so a shared ingredient isn't inventoried multiple times.
  // Restricted to the active week and excludes already-transferred recipes so it
  // matches exactly what step 1 offered + the user picked.
  const aggregatedInventory = useMemo<AggIngredient[]>(() => {
    const pool = bulkTransferWeek
      ? allMenus.filter(m => m.weekYear === bulkTransferWeek.weekYear && m.weekNumber === bulkTransferWeek.weekNumber)
      : menuItems;
    const selected = pool.filter(m => selectedRecipesForTransfer.has(m.id) && !transferredMenuItemIds.has(m.id));
    const map = new Map<string, AggIngredient>();
    for (const item of selected) {
      const ratio = getScaleRatio(item);
      for (const ing of item.recipe.ingredients) {
        const unit = ing.unit ?? null;
        const key = `${ing.name.toLowerCase().trim()}|${(unit ?? '').toLowerCase().trim()}`;
        const qty = scaleQty(ing.quantity ?? null, ratio);
        let agg = map.get(key);
        if (!agg) {
          agg = { key, name: ing.name, unit, category: ing.category, totalQty: 0, measured: true, recipeTitles: [], sources: [] };
          map.set(key, agg);
        }
        agg.sources.push({ menuItemId: item.id, recipeId: item.recipeId, qty });
        if (!agg.recipeTitles.includes(item.recipe.title)) agg.recipeTitles.push(item.recipe.title);
        if (qty == null) agg.measured = false;
        if (agg.measured && agg.totalQty != null) agg.totalQty += qty ?? 0;
      }
    }
    return [...map.values()]
      .map(a => (a.measured && (a.totalQty ?? 0) > 0 ? a : { ...a, measured: false, totalQty: null }))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  }, [selectedRecipesForTransfer, bulkTransferWeek, allMenus, menuItems, menuItemServings, transferredMenuItemIds]);

  // Inventory tabs are two pages of a native horizontal pager (reliable swipe +
  // tap, unlike a Pan gesture fighting the list's vertical scroll).
  const INV_PAGE_W = Dimensions.get('window').width - 48; // sheet has padding 24 each side
  // Bounded height so each page's vertical FlatList can scroll inside the
  // horizontal pager; grows with row count up to a cap.
  const invListHeight = Math.min(400, Math.max(120, aggregatedInventory.length * 56));
  const invPagerRef = useRef<ScrollView>(null);
  const goToInvMode = (mode: 'check' | 'amount') => {
    setInventoryMode(mode);
    invPagerRef.current?.scrollTo({ x: mode === 'amount' ? INV_PAGE_W : 0, animated: true });
  };

  // One inventory row, rendered for a given tab. Shared by both pager pages.
  function renderInvRow(agg: AggIngredient, mode: 'check' | 'amount') {
    const unitLabel = agg.unit ? ` ${agg.unit}` : '';

    if (!agg.measured) {
      const have = hadUnmeasured.has(agg.key);
      return (
        <Pressable
          style={s.invRow}
          onPress={() => setHadUnmeasured(prev => {
            const n = new Set(prev);
            if (n.has(agg.key)) n.delete(agg.key); else n.add(agg.key);
            return n;
          })}
        >
          <Ionicons name={have ? 'checkbox' : 'square-outline'} size={22} color={have ? '#10b981' : '#9ca3af'} />
          <View style={{ flex: 1 }}>
            <Text style={[s.invName, have && s.invNameDone]}>{agg.name}</Text>
            {have ? <Text style={s.invProvenance}>har hemma</Text> : null}
          </View>
        </Pressable>
      );
    }

    const total = agg.totalQty ?? 0;
    const haveAmt = haveAtHome[agg.key] ?? 0;
    const toBuy = Math.max(0, Math.round((total - haveAmt) * 100) / 100);
    const covered = toBuy <= 0;
    const partial = haveAmt > 0 && !covered;
    const secondLine = covered ? 'har hemma' : partial ? `köp ${fmtQty(toBuy)}${unitLabel}` : '';
    const nameLine = (
      <View style={{ flex: 1 }}>
        <Text style={[s.invName, covered && s.invNameDone]}>{fmtQty(total)}{unitLabel} {agg.name}</Text>
        {secondLine ? <Text style={[s.invProvenance, partial && s.invBuy]}>{secondLine}</Text> : null}
      </View>
    );

    if (mode === 'check') {
      const icon = covered ? 'checkbox' : partial ? 'remove-circle' : 'square-outline';
      const iconColor = covered ? '#10b981' : partial ? '#f59e0b' : '#9ca3af';
      return (
        <Pressable style={s.invRow} onPress={() => setHaveAtHome(prev => ({ ...prev, [agg.key]: covered ? 0 : total }))}>
          <Ionicons name={icon as never} size={22} color={iconColor} />
          {nameLine}
        </Pressable>
      );
    }

    return (
      <View style={s.invRow}>
        {nameLine}
        <View style={s.invAmountWrap}>
          <Text style={s.invAmountLabel}>har</Text>
          <TextInput
            style={s.invAmountInput}
            keyboardType="numeric"
            value={haveAmt ? fmtQty(haveAmt) : ''}
            placeholder="0"
            placeholderTextColor="#d1d5db"
            onChangeText={t => {
              const v = parseFloat(t.replace(',', '.'));
              setHaveAtHome(prev => ({ ...prev, [agg.key]: isNaN(v) ? 0 : v }));
            }}
          />
          <Text style={s.invUnit}>{agg.unit ?? ''}</Text>
        </View>
      </View>
    );
  }

  const toastOpacity = useRef(new RNAnimated.Value(0)).current;
  const [toastMessage, setToastMessage] = useState('');

  function showToast(msg: string) {
    setToastMessage(msg);
    RNAnimated.sequence([
      RNAnimated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      RNAnimated.delay(2500),
      RNAnimated.timing(toastOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }

  // Drag state — only y is used for hover detection; x kept for future use
  type DragState = { item: WeekMenuItemWithRecipe; y: number };
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverDay, setHoverDay] = useState<WeekDay | null | 'unscheduled' | undefined>(undefined);

  // Refs for measuring day section positions (screen coords)
  const daySectionRefs = useRef<Record<string, View | null>>({});
  const dayLayouts = useRef<Record<string, { y: number; height: number }>>({});

  // Auto-scroll during drag near screen edges
  const menuScrollRef = useRef<ScrollView | null>(null);
  const scrollOffsetY = useRef(0);
  const autoScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopAutoScroll = useCallback(() => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  }, []);
  const ensureAutoScroll = useCallback((dragY: number, screenH: number) => {
    const EDGE = 100;
    const SPEED = 8;
    let dir = 0;
    if (dragY < EDGE) dir = -1;
    else if (dragY > screenH - EDGE) dir = 1;
    if (dir === 0) {
      stopAutoScroll();
      return;
    }
    if (autoScrollIntervalRef.current) return;
    autoScrollIntervalRef.current = setInterval(() => {
      const next = Math.max(0, scrollOffsetY.current + dir * SPEED);
      scrollOffsetY.current = next;
      menuScrollRef.current?.scrollTo({ y: next, animated: false });
    }, 16);
  }, [stopAutoScroll]);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const [menu, recs, activeLists] = await Promise.all([
        client.getWeekMenu(householdId, weekYear, weekNumber),
        client.getRecipes(householdId),
        client.getShoppingLists(householdId),
      ]);
      setMenuItems(menu);
      setRecipes(recs);
      setShoppingLists(activeLists);
      const transferred = new Set<string>();
      const listMap: Record<string, ListEntry[]> = {};
      menu.forEach(menuItem => {
        if (!listMap[menuItem.id]) listMap[menuItem.id] = [];
        activeLists.forEach(l => {
          // Hidden items under a merge container won't appear in l.items, so trust
          // l.linkedMenuItemIds (visible + hidden) as the source of truth.
          const linked = (l as { linkedMenuItemIds?: string[] }).linkedMenuItemIds ?? [];
          const isLinked = linked.includes(menuItem.id) ||
            l.items.some(item => !item.menuItemId && item.recipeId === menuItem.recipeId); // legacy
          if (isLinked) {
            transferred.add(menuItem.recipeId);
            const visibleCount = l.items.filter(item => item.menuItemId === menuItem.id).length;
            if (!listMap[menuItem.id].find(e => e.listId === l.id)) {
              listMap[menuItem.id].push({ listId: l.id, listName: l.name, itemCount: visibleCount });
            }
          }
        });
      });
      setRecipeListMap(listMap);
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda menyn');
    } finally {
      setLoading(false);
    }
  }, [householdId, weekYear, weekNumber]);

  useFocusEffect(useCallback(() => { load(); return () => setEditMode(false); }, [load]));

  useEffect(() => {
    if (params.bulkTransfer === '1' && householdId && !bulkTransferTriggeredRef.current) {
      bulkTransferTriggeredRef.current = true;
      openWeekPicker();
      router.setParams({ bulkTransfer: undefined });
    }
    if (params.bulkTransfer !== '1') bulkTransferTriggeredRef.current = false;
  }, [params.bulkTransfer, householdId]);

  // When returning from "Skapa nytt recept"-flödet, auto-add the new recipe
  // to the requested day so the user doesn't have to re-open the picker.
  useEffect(() => {
    if (params.addRecipeId && recipes.length > 0 && !addRecipeTriggeredRef.current) {
      const recipe = recipes.find(r => r.id === params.addRecipeId);
      if (recipe) {
        addRecipeTriggeredRef.current = true;
        const day = (params.day && params.day.length > 0 ? params.day : null) as WeekDay | null;
        addRecipeToDay(recipe, day);
        router.setParams({ addRecipeId: undefined, day: undefined });
      }
    }
    if (!params.addRecipeId) addRecipeTriggeredRef.current = false;
  }, [params.addRecipeId, recipes]);

  function handleCancelBulkTransfer() {
    const originListId = params.originListId;
    setShowBulkTransferModal(false);
    if (originListId) {
      // Pop the /menu route off the stack so back from the shopping list
      // goes to wherever the user was before (lists overview etc.),
      // not back into the menu tab they never intentionally visited.
      try {
        (router as { dismissTo?: (h: string) => void }).dismissTo?.(`/shopping/${originListId}`);
      } catch {
        router.navigate(`/shopping/${originListId}` as never);
      }
    }
  }

  // Hardware/gesture back steps through the wizard instead of closing it.
  function handleBulkBack() {
    if (bulkTransferStep === 'list') { setBulkTransferStep('ingredients'); return; }
    if (bulkTransferStep === 'ingredients') { setBulkTransferStep('recipe'); return; }
    handleCancelBulkTransfer();
  }

  async function openWeekPicker() {
    if (!householdId) return;
    try {
      const all = await client.getAllMenus(householdId);
      setAllMenus(all);
      setBulkTransferStep('week');
      setShowBulkTransferModal(true);
    } catch (e) {
      showError(e, 'Kunde inte hämta veckomenyer');
    }
  }

  useEffect(() => {
    if (!showBulkTransferModal) {
      if (params.originListId) router.setParams({ originListId: undefined });
      setBulkTransferWeek(null);
    }
  }, [showBulkTransferModal, params.originListId]);

  function openPicker(day: WeekDay | null | 'ask') {
    if (day === 'ask') {
      setPickingForDay(null);
      setPickerStep('day');
    } else {
      setPickingForDay(day);
      setPickerStep('recipe');
    }
    setReplaceTarget(null);
    setShowPicker(true);
  }

  function startReplaceRecipe(item: WeekMenuItemWithRecipe) {
    setReplaceTarget(item);
    setPickerStep('recipe');
    setShowPicker(true);
  }

  function closePicker() {
    setShowPicker(false);
    setReplaceTarget(null);
  }

  function enterEditMode() {
    setEditMode(true);
  }

  function exitEditMode() {
    setEditMode(false);
  }

  function onDragStart(item: WeekMenuItemWithRecipe, _x: number, y: number) {
    setDragState({ item, y });
  }

  function onDragMove(_x: number, y: number) {
    setDragState(prev => prev ? { ...prev, y } : null);
    // Auto-scroll the menu list when finger nears screen edge
    const { height: screenH } = Dimensions.get('window');
    ensureAutoScroll(y, screenH);
    // Find which day section we're hovering over
    let found: WeekDay | null | 'unscheduled' | undefined = undefined;
    for (const [key, layout] of Object.entries(dayLayouts.current)) {
      if (y >= layout.y && y <= layout.y + layout.height) {
        found = key === 'unscheduled' ? 'unscheduled' : key as WeekDay;
        break;
      }
    }
    setHoverDay(found);
  }

  function onDragEnd() {
    stopAutoScroll();
    if (!dragState) return;
    const item = dragState.item;
    setDragState(null);
    setHoverDay(undefined);
    if (hoverDay === undefined) return;
    const targetDay = hoverDay === 'unscheduled' ? null : hoverDay as WeekDay | null;
    if (targetDay !== item.day) {
      moveToDay(item, targetDay);
    }
  }

  function measureDaySection(key: string, ref: View | null) {
    if (!ref) return;
    daySectionRefs.current[key] = ref;
    ref.measure((_x, _y, _w, h, _px, py) => {
      dayLayouts.current[key] = { y: py, height: h };
    });
  }

  async function addRecipeToDay(recipe: RecipeWithIngredients, dayOverride?: WeekDay | null) {
    if (!householdId) return;

    if (replaceTarget) {
      closePicker();
      const day = replaceTarget.day;
      const oldId = replaceTarget.id;
      try {
        await client.deleteWeekMenuItem(oldId);
        const item = await client.addToWeekMenu({ householdId, recipeId: recipe.id, day, weekYear, weekNumber });
        setMenuItems(prev => prev.filter(i => i.id !== oldId).concat(item));
      } catch (e) {
        showError(e, 'Kunde inte byta ut rätten');
      }
      return;
    }

    const day = dayOverride !== undefined ? dayOverride : pickingForDay;

    if (day !== null && menuItems.some(i => i.day === day)) {
      const dayLabel = DAYS.find(d => d.key === day)?.label ?? day;
      const confirmed = await new Promise<boolean>(resolve =>
        Alert.alert(
          'Dag redan planerad',
          `${dayLabel} har redan en rätt planerad. Lägga till ändå?`,
          [
            { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Lägg till', onPress: () => resolve(true) },
          ]
        )
      );
      if (!confirmed) { closePicker(); return; }
    }

    if (menuItems.some(i => i.recipeId === recipe.id)) {
      const confirmed = await new Promise<boolean>(resolve =>
        Alert.alert(
          'Rätt redan tillagd',
          `${recipe.title} är redan planerad denna vecka. Lägga till ändå?`,
          [
            { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Lägg till', onPress: () => resolve(true) },
          ]
        )
      );
      if (!confirmed) { closePicker(); return; }
    }

    closePicker();
    const tempId = `optimistic-menu-${Date.now()}`;
    const optimistic: WeekMenuItemWithRecipe = {
      id: tempId,
      householdId,
      recipeId: recipe.id,
      day: day ?? null,
      weekYear,
      weekNumber,
      note: null,
      createdBy: '',
      createdAt: new Date().toISOString(),
      recipe,
    } as WeekMenuItemWithRecipe;
    setMenuItems(prev => [...prev, optimistic]);
    try {
      const item = await client.addToWeekMenu({ householdId, recipeId: recipe.id, day, weekYear, weekNumber });
      setMenuItems(prev => prev.map(m => m.id === tempId ? item : m));
      showToast('Recept tillagd till menyn');
    } catch (e) {
      setMenuItems(prev => prev.filter(m => m.id !== tempId));
      showError(e, 'Kunde inte lägga till rätt');
    }
  }

  async function removeFromMenu(item: WeekMenuItemWithRecipe) {
    const ok = await new Promise<boolean>(resolve => {
      Alert.alert(
        'Ta bort från menyn?',
        item.recipe.title,
        [
          { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Ta bort', style: 'destructive', onPress: () => resolve(true) },
        ],
      );
    });
    if (!ok) return;
    let cancelled = false;
    // Mark as pending — meal card stays visible with fade/strikethrough during the
    // 5s undo window, and the open shopping-list screen renders ingredients in pending
    // state instead of either hiding them or making them pop back on undo.
    // Register cancel callback so the toast's "Ångra" can roll back this and any other
    // meals currently in the pending queue with one tap.
    markPending(item.id, () => { cancelled = true; });
    // Show stacked toast: count is current pendingCount + 1 (this call) since state hasn't flushed.
    const upcomingCount = pendingCount + 1;
    showGlobalToast(
      upcomingCount === 1 ? 'Recept borttagen från menyn' : `${upcomingCount} recept tas bort`,
      'neutral',
      { label: 'Ångra', onPress: cancelAllPending },
    );
    setTimeout(async () => {
      if (cancelled) return;
      try {
        await client.deleteWeekMenuItem(item.id);
        const linked = recipeListMap[item.id] ?? [];
        if (linked.length > 0) await executeCleanup(item, linked.map(l => l.listId));
        // Backend committed — drop from local state so it doesn't reappear when
        // the pending flag clears.
        setMenuItems(prev => prev.filter(i => i.id !== item.id));
        setRecipeListMap(prev => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      } catch (e) {
        showError(e, 'Kunde inte ta bort');
      } finally {
        clearPending(item.id);
      }
    }, 5000);
  }

  async function executeCleanup(menuItem: WeekMenuItemWithRecipe, listIds: string[]) {
    const ops: Promise<unknown>[] = [];
    for (const listId of listIds) {
      const list = shoppingLists.find(l => l.id === listId);
      if (!list) continue;

      // New: delete by menuItemId if items are tagged (visible OR hidden under a merge container)
      const linked = (list as { linkedMenuItemIds?: string[] }).linkedMenuItemIds ?? [];
      const hasVisibleTagged = list.items.some(i => i.menuItemId === menuItem.id);
      if (hasVisibleTagged || linked.includes(menuItem.id)) {
        ops.push(client.deleteItemsByMenuItemId(listId, menuItem.id));
        continue;
      }

      // Legacy: subtract quantities by name+unit match (items without menuItemId)
      for (const ing of menuItem.recipe.ingredients) {
        const name = ing.name.toLowerCase().trim();
        const unit = (ing.unit ?? '').toLowerCase().trim();
        const item = list.items.find(
          i => !i.isChecked &&
            i.name.toLowerCase().trim() === name &&
            (i.unit ?? '').toLowerCase().trim() === unit
        );
        if (!item) continue;
        const newQty = (item.quantity ?? 0) - (ing.quantity ?? 1);
        if (newQty <= 0.001) ops.push(client.deleteShoppingItem(item.id));
        else ops.push(client.updateShoppingItem(item.id, { quantity: Math.round(newQty * 100) / 100 }));
      }
    }
    try {
      await Promise.all(ops);
      setRecipeListMap(prev => { const n = { ...prev }; delete n[menuItem.id]; return n; });
      load();
    } catch (e) {
      showError(e, 'Kunde inte ta bort ingredienserna');
    }
  }

  async function createListAndContinue() {
    if (!householdId || !newListName.trim()) return;
    setCreatingList(true);
    try {
      const list = await client.createShoppingList({ householdId, name: newListName.trim() });
      setShoppingLists(prev => [...prev, list]);
      setNewListName('');
    } catch (e) {
      showError(e, 'Kunde inte skapa lista');
    } finally {
      setCreatingList(false);
    }
  }

  async function transferWeekMenu() {
    if (menuItems.length === 0) {
      Alert.alert('Tomt', 'Ingen rätt planerad denna vecka');
      return;
    }

    const notTransferred = menuItems.filter(m => !transferredMenuItemIds.has(m.id));
    if (notTransferred.length === 0) {
      Alert.alert('Redan överförd', 'Alla rätter denna vecka är redan överförda till en inköpslista');
      return;
    }

    setSelectedRecipesForTransfer(new Set(notTransferred.map(m => m.id)));
    resetInventory();
    setBulkTransferStep('recipe');
    setShowBulkTransferModal(true);
  }

  async function executeBulkTransfer(listId: string) {
    if (selectedRecipesForTransfer.size === 0) {
      Alert.alert('Ingen rätt vald', 'Välj minst en rätt att överföra');
      return;
    }

    try {
      const sourcePool = bulkTransferWeek ? allMenus : menuItems;
      const toTransfer = sourcePool.filter(item => selectedRecipesForTransfer.has(item.id));
      const existingMenuItemIds = new Set(shoppingLists
        .find(l => l.id === listId)?.items
        .map(i => i.menuItemId)
        .filter(Boolean) ?? []);

      const actuallyTransfer = toTransfer.filter(item => !existingMenuItemIds.has(item.id));

      if (actuallyTransfer.length === 0) {
        Alert.alert('Redan med', 'Alla valda rätter är redan överförda till denna lista');
        return;
      }

      // Build the transfer from the aggregated inventory: for each ingredient
      // compute the shortfall (what's still needed after "har hemma"), then
      // apportion it back across the contributing recipes (menuItemId) so the
      // backend's per-meal dedupe/merge + recipe-removal keep working.
      const actuallyIds = new Set(actuallyTransfer.map(i => i.id));
      const allIngredients: { name: string; quantity: number | null; unit: string | null; category?: string; recipeId: string; menuItemId: string }[] = [];
      for (const agg of aggregatedInventory) {
        const srcs = agg.sources.filter(s => actuallyIds.has(s.menuItemId));
        if (srcs.length === 0) continue;

        if (!agg.measured) {
          // No quantity to do math on — include each source as-is unless marked "har hemma".
          if (hadUnmeasured.has(agg.key)) continue;
          for (const s of srcs) {
            allIngredients.push({ name: agg.name, quantity: s.qty, unit: agg.unit, category: agg.category, recipeId: s.recipeId, menuItemId: s.menuItemId });
          }
          continue;
        }

        // Single rule regardless of tab: buy what's left after "har hemma".
        const total = agg.totalQty ?? 0;
        const needed = Math.max(0, total - (haveAtHome[agg.key] ?? 0));
        if (needed <= 0) continue;

        let remaining = needed;
        for (const s of srcs) {
          if (remaining <= 0) break;
          const give = Math.min(s.qty ?? 0, remaining);
          if (give <= 0) continue;
          allIngredients.push({
            name: agg.name,
            quantity: Math.round(give * 100) / 100,
            unit: agg.unit,
            category: agg.category,
            recipeId: s.recipeId,
            menuItemId: s.menuItemId,
          });
          remaining -= give;
        }
      }

      setBulkTransferringListId(listId);
      await client.transferToShopping(listId, allIngredients);
      const targetList = shoppingLists.find(l => l.id === listId);
      if (targetList) {
        setRecipeListMap(prev => {
          const next = { ...prev };
          for (const item of actuallyTransfer) {
            next[item.id] = [{ listId, listName: targetList.name, itemCount: item.recipe.ingredients.length }];
          }
          return next;
        });
      }
      setBulkTransferringListId(null);
      setShowBulkTransferModal(false);
      load();
      showToast(`${actuallyTransfer.length} ${actuallyTransfer.length === 1 ? 'rätt' : 'rätter'} överförd${actuallyTransfer.length === 1 ? '' : 'a'} till inköpslistan`);
    } catch (e) {
      setBulkTransferringListId(null);
      showError(e, 'Kunde inte överföra ingredienserna');
    }
  }

  async function doTransfer(listId: string) {
    if (!transferSheet || transferringListId) return;
    const menuItemId = transferSheet.id;
    const recipe = transferSheet.recipe;
    const scaleRatio = getScaleRatio(transferSheet);
    setTransferringListId(listId);
    try {
      await client.transferToShopping(listId, recipe.ingredients.map(ing => ({
        name: ing.name,
        quantity: scaleQty(ing.quantity ?? null, scaleRatio),
        unit: ing.unit ?? null,
        category: ing.category ?? undefined,
        recipeId: recipe.id,
        menuItemId,
      })));
      const targetList = shoppingLists.find(l => l.id === listId);
      if (targetList) {
        setRecipeListMap(prev => ({
          ...prev,
          [menuItemId]: [{ listId, listName: targetList.name, itemCount: recipe.ingredients.length }],
        }));
      }
      setTransferSheet(null);
      setTransferringListId(null);
      load();
      showToast(`${recipe.title} överförd till inköpslistan`);
    } catch (e) {
      setTransferringListId(null);
      showError(e, 'Kunde inte lägga till ingredienserna');
    }
  }

  async function moveToDay(item: WeekMenuItemWithRecipe, day: WeekDay | null) {
    if (day !== null && menuItems.some(i => i.day === day && i.id !== item.id)) {
      const dayLabel = DAYS.find(d => d.key === day)?.label ?? day;
      const confirmed = await new Promise<boolean>(resolve =>
        Alert.alert(
          'Dag redan planerad',
          `${dayLabel} har redan en rätt planerad. Flytta ändå?`,
          [
            { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Flytta', onPress: () => resolve(true) },
          ]
        )
      );
      if (!confirmed) return;
    }
    setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, day } : i));
    try {
      const updated = await client.updateWeekMenuItem(item.id, { day });
      setMenuItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch (e) {
      setMenuItems(prev => prev.map(i => i.id === item.id ? item : i));
      showError(e, 'Kunde inte flytta rätten');
    }
  }

  async function removeFromShoppingList(menuItemId: string) {
    const menuItem = menuItems.find(i => i.id === menuItemId);
    if (!menuItem) return;
    const lists = recipeListMap[menuItemId] ?? [];
    if (lists.length === 0) return;

    if (lists.length === 1) {
      await executeCleanup(menuItem, [lists[0].listId]);
    } else {
      setCleanupPrompt({ menuItem, lists });
      setSelectedCleanupLists(new Set(lists.map(l => l.listId)));
    }
  }

  const unscheduled = menuItems.filter(i => i.day === null);
  const hasAnyScheduled = menuItems.some(i => i.day !== null);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader
        title="Meny"
        actionNode={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable style={s.headerIconBtn} onPress={() => setShowTemplates(true)} accessibilityLabel="Veckomeny-mallar">
              <Ionicons name="bookmarks-outline" size={18} color="#4f46e5" />
            </Pressable>
            <Pressable style={s.headerActionBtn} onPress={() => router.push('/recipes' as never)}>
              <Ionicons name="book-outline" size={16} color="#4f46e5" />
              <Text style={s.headerActionText}>Recept</Text>
            </Pressable>
          </View>
        }
      />
      <WeekNav
        weekLabel={weekLabel}
        isCurrentWeek={weekOffset === 0}
        onPrev={() => setWeekOffset(o => o - 1)}
        onNext={() => setWeekOffset(o => o + 1)}
        onToday={() => setWeekOffset(0)}
        onPickDate={() => setShowWeekPicker(true)}
      />

      <ScrollView
        ref={menuScrollRef}
        style={s.content}
        contentContainerStyle={s.contentInner}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        onScroll={e => { scrollOffsetY.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={32}
      >
        {/* Day sections — sorted Mon→Sun, show all 7 days */}
        {DAYS.map((day, i) => {
          const items = menuItems.filter(m => m.day === day.key);
          const date = new Date(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate() + i);
          const isHovered = hoverDay === day.key;
          return (
            <View key={day.key} style={s.section}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: fs(14), fontWeight: '700', color: '#111827' }}>
                  {day.label}{' '}
                  <Text style={{ fontSize: fs(12), fontWeight: '400', color: '#6b7280' }}>{date.getDate()} {MONTH_NAMES[date.getMonth()]}</Text>
                </Text>
              </View>
              <View
                style={[s.daySlot, items.length > 0 && s.daySlotFilled, items.length === 0 && s.daySlotEmpty, isHovered && s.daySlotHovered]}
                ref={ref => measureDaySection(day.key, ref)}
                onLayout={() => measureDaySection(day.key, daySectionRefs.current[day.key] ?? null)}
              >
                {items.length === 0 ? (
                  <Pressable
                    onPress={() => { setPickingForDay(day.key); setPickerStep('recipe'); setShowPicker(true); }}
                    style={s.daySlotEmptyTap}
                  >
                    <Ionicons name="add" size={fs(28)} color="#4f46e5" />
                  </Pressable>
                ) : (
                items.map(item => (
                  <MenuCard
                    key={item.id}
                    item={item}
                    isTransferred={!!recipeListMap[item.id]?.length}
                    isPending={pendingMenuItemRemovals.has(item.id)}
                    editMode={editMode}
                    onRemove={() => removeFromMenu(item)}
                    onViewRecipe={() => router.push(`/recipes/${item.recipeId}` as never)}
                    onMoveToDay={d => moveToDay(item, d)}
                    onReplace={() => startReplaceRecipe(item)}
                    onLongPress={enterEditMode}
                    onDragStart={(x, y) => onDragStart(item, x, y)}
                    onDragMove={onDragMove}
                    onDragEnd={onDragEnd}
                    isDragging={dragState?.item.id === item.id}
                    scaledServings={menuItemServings[item.id] ?? item.recipe.servings}
                    onScaleServings={n => {
                  setMenuItemServings(prev => ({ ...prev, [item.id]: n }));
                  if (recipeListMap[item.id]?.length && !scaleWarnedRef.current.has(item.id)) {
                    scaleWarnedRef.current.add(item.id);
                    showGlobalToast('Receptet är redan i en inköpslista — skalningen påverkar inte listan automatiskt', 'neutral');
                  }
                }}
                  />
                ))
              )}
              </View>
            </View>
          );
        })}

        {/* Unscheduled */}
        <View
          style={[s.section, hoverDay === 'unscheduled' && s.sectionHovered]}
          ref={ref => measureDaySection('unscheduled', ref)}
        >
          <View style={s.sectionRow}>
            <Text style={s.sectionLabel}>EJ SCHEMALAGDA</Text>
            {!editMode && (
              <Pressable onPress={() => openPicker(null)}>
                <Ionicons name="add-circle-outline" size={20} color="#4f46e5" />
              </Pressable>
            )}
          </View>
          {unscheduled.length === 0 ? (
            <Text style={s.unscheduledEmpty}>Lägg till rätter utan dag för att planera i kalendern</Text>
          ) : (
            unscheduled.map(item => (
              <MenuCard
                key={item.id}
                item={item}
                isTransferred={!!recipeListMap[item.id]?.length}
                isPending={pendingMenuItemRemovals.has(item.id)}
                editMode={editMode}
                onRemove={() => removeFromMenu(item)}
                onViewRecipe={() => router.push(`/recipes/${item.recipeId}` as never)}
                onMoveToDay={d => moveToDay(item, d)}
                onReplace={() => startReplaceRecipe(item)}
                onLongPress={enterEditMode}
                onDragStart={(x, y) => onDragStart(item, x, y)}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                isDragging={dragState?.item.id === item.id}
                scaledServings={menuItemServings[item.id] ?? item.recipe.servings}
                onScaleServings={n => {
                  setMenuItemServings(prev => ({ ...prev, [item.id]: n }));
                  if (recipeListMap[item.id]?.length && !scaleWarnedRef.current.has(item.id)) {
                    scaleWarnedRef.current.add(item.id);
                    showGlobalToast('Receptet är redan i en inköpslista — skalningen påverkar inte listan automatiskt', 'neutral');
                  }
                }}
              />
            ))
          )}
        </View>

        {!hasAnyScheduled && unscheduled.length === 0 && (
          <EmptyState
            icon="restaurant-outline"
            title="Inga rätter planerade"
            subtitle="Planera veckans måltider så kan ni föra över ingredienserna till inköpslistan."
            actionLabel="Planera en rätt"
            onAction={() => openPicker(null)}
          />
        )}

        <View style={s.newListSection}>
          <Pressable
            style={[s.newListBtn, menuItems.every(m => !!recipeListMap[m.id]?.length) && s.newListBtnDisabled]}
            onPress={transferWeekMenu}
            disabled={menuItems.every(m => !!recipeListMap[m.id]?.length)}
          >
            <Ionicons name="cart-outline" size={20} color={menuItems.every(m => !!recipeListMap[m.id]?.length) ? '#d1d5db' : '#4f46e5'} />
            <Text style={[s.newListBtnText, menuItems.every(m => !!recipeListMap[m.id]?.length) && s.newListBtnTextDisabled]}>
              {menuItems.every(m => !!recipeListMap[m.id]?.length) ? 'Redan överförd' : 'Veckomeny → Inköpslista'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>


      {/* Edit mode exit button */}
      {editMode && !dragState && (
        <Pressable style={s.editDoneBtn} onPress={exitEditMode}>
          <Text style={[s.editDoneBtnText, { fontSize: fs(16) }]}>Klar</Text>
        </Pressable>
      )}

      {/* Drag ghost card — full width, vertical-only movement */}
      {dragState && (
        <View
          pointerEvents="none"
          style={[s.ghostCard, { top: dragState.y - 28 }]}
        >
          <View style={s.ghostCardIcon}>
            <Ionicons name="restaurant-outline" size={18} color="#4f46e5" />
          </View>
          <Text style={s.ghostCardText} numberOfLines={1}>{dragState.item.recipe.title}</Text>
        </View>
      )}

      {/* Two-step recipe picker modal */}
      <MenuTemplatesModal
        visible={showTemplates}
        onClose={() => setShowTemplates(false)}
        householdId={householdId}
        weekYear={weekYear}
        weekNumber={weekNumber}
        weekHasItems={menuItems.length > 0}
        onApplied={load}
      />

      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={closePicker}>
        <Pressable style={s.overlay} onPress={closePicker} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />

          {pickerStep === 'day' ? (
            <>
              <Text style={s.sheetTitle}>Välj dag</Text>
              <View style={s.dayGrid}>
                {DAYS.map(d => (
                  <Pressable
                    key={d.key}
                    style={s.dayGridItem}
                    onPress={() => { setPickingForDay(d.key); setPickerStep('recipe'); }}
                  >
                    <Text style={s.dayGridLabel}>{d.label}</Text>
                  </Pressable>
                ))}
                <Pressable
                  style={[s.dayGridItem, s.dayGridItemNone]}
                  onPress={() => { setPickingForDay(null); setPickerStep('recipe'); }}
                >
                  <Text style={[s.dayGridLabel, s.dayGridLabelNone]}>Ingen dag</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={s.sheetTitleRow}>
                {!replaceTarget && (
                  <Pressable onPress={() => setPickerStep('day')} style={s.backBtn}>
                    <Ionicons name="chevron-back" size={20} color="#4f46e5" />
                  </Pressable>
                )}
                <Text style={s.sheetTitle}>
                  {replaceTarget
                    ? `Byt ut ${replaceTarget.recipe.title}`
                    : pickingForDay
                      ? DAYS.find(d => d.key === pickingForDay)?.label
                      : 'Ingen dag'}
                </Text>
              </View>
              {recipes.length === 0 ? (
                <View style={s.pickerEmpty}>
                  <Text style={s.pickerEmptyText}>Inga recept än — lägg till via Recept-fliken</Text>
                  <Pressable style={s.pickerEmptyBtn} onPress={() => { setShowPicker(false); router.push('/recipes' as never); }}>
                    <Text style={s.pickerEmptyBtnText}>Gå till recept</Text>
                  </Pressable>
                </View>
              ) : (
                <FlatList
                  data={recipes}
                  keyExtractor={r => r.id}
                  style={s.pickerList}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                  ListFooterComponent={
                    <Pressable
                      style={s.recipeCard}
                      onPress={() => {
                        const day = pickingForDay ?? '';
                        setShowPicker(false);
                        router.push(`/recipes?create=1&forMenuDay=${day}` as never);
                      }}
                    >
                      <View style={[s.recipeCardIcon, { backgroundColor: '#eef2ff' }]}>
                        <Ionicons name="add" size={20} color="#4f46e5" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.recipeCardTitle, { color: '#4f46e5' }]}>Skapa nytt recept</Text>
                      </View>
                    </Pressable>
                  }
                  renderItem={({ item }) => (
                    <Pressable style={s.recipeCard} onPress={() => addRecipeToDay(item)}>
                      <View style={s.recipeCardIcon}>
                        <Ionicons name="restaurant-outline" size={20} color="#4f46e5" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.recipeCardTitle}>{item.title}</Text>
                        <Text style={s.recipeCardMeta}>{item.servings} port · {item.ingredients.length} ingredienser</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                    </Pressable>
                  )}
                />
              )}
            </>
          )}
        </View>
      </Modal>

      {/* Shopping list cleanup modal */}
      <Modal visible={!!cleanupPrompt} transparent animationType="slide" onRequestClose={() => setCleanupPrompt(null)}>
        <Pressable style={s.overlay} onPress={() => setCleanupPrompt(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Ta bort från inköpslista?</Text>
          {cleanupPrompt ? (
            <Text style={s.cleanupSub}>Välj vilka listor du vill ta bort ingredienserna från</Text>
          ) : null}
          <View style={s.cleanupList}>
            {cleanupPrompt?.lists.map(l => {
              const selected = selectedCleanupLists.has(l.listId);
              return (
                <Pressable
                  key={l.listId}
                  style={[s.cleanupItem, selected && s.cleanupItemActive]}
                  onPress={() => setSelectedCleanupLists(prev => {
                    const n = new Set(prev);
                    if (n.has(l.listId)) n.delete(l.listId); else n.add(l.listId);
                    return n;
                  })}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={selected ? '#4f46e5' : '#9ca3af'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.cleanupListName}>{l.listName}</Text>
                    <Text style={s.cleanupItemCount}>{l.itemCount} ingredienser</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={s.cleanupActions}>
            <Pressable style={s.cleanupCancel} onPress={() => setCleanupPrompt(null)}>
              <Text style={s.cleanupCancelText}>Behåll</Text>
            </Pressable>
            <Pressable
              style={[s.cleanupConfirm, selectedCleanupLists.size === 0 && s.cleanupConfirmDisabled]}
              disabled={selectedCleanupLists.size === 0}
              onPress={() => {
                if (!cleanupPrompt) return;
                const mi = cleanupPrompt.menuItem;
                setCleanupPrompt(null);
                executeCleanup(mi, [...selectedCleanupLists]);
              }}
            >
              <Text style={s.cleanupConfirmText}>Ta bort från valda</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {/* Transfer to shopping list modal */}
      <Modal visible={!!transferSheet} transparent animationType="slide" onRequestClose={() => setTransferSheet(null)}>
        <Pressable style={s.overlay} onPress={() => setTransferSheet(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Välj inköpslista</Text>
          {shoppingLists.length === 0 ? (
            <>
              <Text style={s.pickerEmptyText}>Ingen aktiv inköpslista — skapa en direkt här</Text>
              <View style={s.createListRow}>
                <TextInput
                  style={[s.input, { flex: 1, marginTop: 0 }]}
                  placeholder="Namn på ny lista"
                  placeholderTextColor="#9ca3af"
                  value={newListName}
                  onChangeText={setNewListName}
                  returnKeyType="done"
                  onSubmitEditing={createListAndContinue}
                  autoFocus
                />
                <Pressable
                  style={[s.createListBtn, (!newListName.trim() || creatingList) && s.buttonDisabled]}
                  onPress={createListAndContinue}
                  disabled={creatingList || !newListName.trim()}
                >
                  {creatingList
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.createListBtnText}>Skapa</Text>}
                </Pressable>
              </View>
            </>
          ) : (
            shoppingLists.map(l => (
              <Pressable
                key={l.id}
                style={[s.pickerItem, !!transferringListId && s.pickerItemDisabled]}
                onPress={() => doTransfer(l.id)}
                disabled={!!transferringListId}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.pickerItemTitle}>{l.name}</Text>
                  <Text style={s.pickerItemMeta}>{l.items.length} varor</Text>
                </View>
                {transferringListId === l.id && <ActivityIndicator size="small" color="#4f46e5" />}
              </Pressable>
            ))
          )}
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Bulk transfer modal — choose recipes and list */}
      <Modal visible={showBulkTransferModal} transparent animationType="slide" onRequestClose={() => handleBulkBack()}>
        <Pressable style={s.overlay} onPress={() => handleCancelBulkTransfer()} />
        <KeyboardAvoidingView behavior={bulkTransferStep === 'ingredients' ? undefined : (Platform.OS === 'ios' ? 'padding' : 'height')} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={s.sheet}>
          <View style={s.sheetHandle} />

          {bulkTransferStep === 'week' ? (
            <>
              <Text style={s.sheetTitle}>Välj veckomeny</Text>
              <Text style={s.sheetSub}>Vilken veckas meny vill du importera?</Text>
              <ScrollView style={s.bulkRecipeList}>
                {(() => {
                  // Only mark "already transferred" against the destination list, if known
                  const destList = params.originListId
                    ? shoppingLists.find(l => l.id === params.originListId)
                    : null;
                  const transferredIds = new Set(
                    (destList?.items ?? []).map(i => i.menuItemId).filter(Boolean) as string[]
                  );
                  const byWeek = new Map<string, WeekMenuItemWithRecipe[]>();
                  for (const m of allMenus) {
                    const key = `${m.weekYear}-${m.weekNumber}`;
                    if (!byWeek.has(key)) byWeek.set(key, []);
                    byWeek.get(key)!.push(m);
                  }
                  // Filter out weeks that have already ended (Sunday < today)
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const entries = [...byWeek.entries()].filter(([key]) => {
                    const [wy, wn] = key.split('-').map(Number);
                    const monday = getISOWeekMonday(wy, wn);
                    const sunday = new Date(monday);
                    sunday.setDate(monday.getDate() + 6);
                    return sunday >= today;
                  });
                  const weeks = entries.sort(([a], [b]) => a.localeCompare(b));
                  if (weeks.length === 0) {
                    return <Text style={s.pickerEmptyText}>Ingen aktiv vecka med planerade rätter</Text>;
                  }
                  return weeks.map(([key, items]) => {
                    const [wy, wn] = key.split('-').map(Number);
                    const newCount = items.filter(i => !transferredIds.has(i.id)).length;
                    const allTransferred = newCount === 0;
                    return (
                      <Pressable
                        key={key}
                        style={[s.bulkRecipeItem, allTransferred && { opacity: 0.5 }]}
                        disabled={allTransferred}
                        onPress={() => {
                          setBulkTransferWeek({ weekYear: wy, weekNumber: wn });
                          setSelectedRecipesForTransfer(new Set(items.filter(i => !transferredIds.has(i.id)).map(i => i.id)));
                          setBulkTransferStep('recipe');
                        }}
                      >
                        <Ionicons name="calendar-outline" size={22} color="#4f46e5" />
                        <View style={{ flex: 1 }}>
                          <Text style={s.bulkRecipeTitle}>Vecka {wn}, {wy}</Text>
                          <Text style={s.bulkRecipeDay}>
                            {items.length} {items.length === 1 ? 'rätt' : 'rätter'}
                            {destList ? ` · ${allTransferred ? 'alla redan med' : `${newCount} nya`}` : ''}
                          </Text>
                        </View>
                        {!allTransferred && <Ionicons name="chevron-forward" size={20} color="#9ca3af" />}
                      </Pressable>
                    );
                  });
                })()}
              </ScrollView>
            </>
          ) : bulkTransferStep === 'recipe' ? (
            <>
              <Text style={s.sheetTitle}>Välj rätter</Text>
              <Text style={s.sheetSub}>{bulkTransferWeek ? `Vecka ${bulkTransferWeek.weekNumber}, ${bulkTransferWeek.weekYear}` : 'Vilka rätter vill du överföra?'}</Text>
              <ScrollView style={s.bulkRecipeList}>
                {(bulkTransferWeek
                  ? allMenus.filter(m => m.weekYear === bulkTransferWeek.weekYear && m.weekNumber === bulkTransferWeek.weekNumber)
                  : menuItems
                )
                  .filter(item => !transferredMenuItemIds.has(item.id))
                  .map(item => {
                    const selected = selectedRecipesForTransfer.has(item.id);
                    return (
                      <Pressable
                        key={item.id}
                        style={[s.bulkRecipeItem, selected && s.bulkRecipeItemActive]}
                        onPress={() => setSelectedRecipesForTransfer(prev => {
                          const n = new Set(prev);
                          if (n.has(item.id)) n.delete(item.id); else n.add(item.id);
                          return n;
                        })}
                      >
                        <Ionicons
                          name={selected ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={selected ? '#4f46e5' : '#9ca3af'}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={s.bulkRecipeTitle}>{item.recipe.title}</Text>
                          {item.day !== null && (
                            <Text style={s.bulkRecipeDay}>
                              {DAYS.find(d => d.key === item.day)?.label}
                            </Text>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
              </ScrollView>
              <Pressable
                style={[s.button, selectedRecipesForTransfer.size === 0 && s.buttonDisabled]}
                disabled={selectedRecipesForTransfer.size === 0}
                onPress={() => {
                  resetInventory();
                  setBulkTransferStep('ingredients');
                }}
              >
                <Text style={s.buttonText}>Nästa</Text>
              </Pressable>
            </>
          ) : bulkTransferStep === 'ingredients' ? (
            <>
              <Text style={s.sheetTitle}>Vad har du hemma?</Text>
              <View style={s.segment}>
                <Pressable style={[s.segmentBtn, inventoryMode === 'check' && s.segmentBtnActive]} onPress={() => goToInvMode('check')}>
                  <Text style={[s.segmentText, inventoryMode === 'check' && s.segmentTextActive]}>Bocka av</Text>
                </Pressable>
                <Pressable style={[s.segmentBtn, inventoryMode === 'amount' && s.segmentBtnActive]} onPress={() => goToInvMode('amount')}>
                  <Text style={[s.segmentText, inventoryMode === 'amount' && s.segmentTextActive]}>Ange mängd</Text>
                </Pressable>
              </View>
              <Text style={s.invSub} numberOfLines={1}>
                {inventoryMode === 'check' ? 'Bocka av det du har hemma' : 'Ange mängd du har hemma'}
              </Text>
              <ScrollView
                ref={invPagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                style={{ height: invListHeight, marginBottom: 12 }}
                keyboardShouldPersistTaps="handled"
                scrollEventThrottle={16}
                // Update the tab/heading live during the swipe (at the midpoint),
                // not just when it settles.
                onScroll={e => {
                  const mode = e.nativeEvent.contentOffset.x > INV_PAGE_W / 2 ? 'amount' : 'check';
                  setInventoryMode(prev => (prev === mode ? prev : mode));
                }}
              >
                {(['check', 'amount'] as const).map(mode => (
                  <FlatList
                    key={mode}
                    style={{ width: INV_PAGE_W, height: invListHeight }}
                    data={aggregatedInventory}
                    keyExtractor={a => a.key}
                    extraData={[haveAtHome, hadUnmeasured]}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item: agg }) => renderInvRow(agg, mode)}
                  />
                ))}
              </ScrollView>
              <Pressable
                style={s.button}
                onPress={async () => {
                  const origin = params.originListId;
                  if (origin) {
                    await executeBulkTransfer(origin);
                    try {
                      (router as { dismissTo?: (h: string) => void }).dismissTo?.(`/shopping/${origin}`);
                    } catch {
                      router.navigate(`/shopping/${origin}` as never);
                    }
                  } else {
                    setBulkTransferStep('list');
                  }
                }}
              >
                <Text style={s.buttonText}>{params.originListId ? 'Överför' : 'Nästa'}</Text>
              </Pressable>
              <Pressable style={s.cancelBtn} onPress={() => setBulkTransferStep('recipe')}>
                <Text style={s.cancelBtnText}>Tillbaka</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={s.sheetTitle}>Välj inköpslista</Text>
              <Text style={s.sheetSub}>{selectedRecipesForTransfer.size} rätt(er) att överföra</Text>
              {shoppingLists.length === 0 ? (
                <>
                  <Text style={s.pickerEmptyText}>Ingen aktiv inköpslista — skapa en direkt här</Text>
                  <View style={s.createListRow}>
                    <TextInput
                      style={[s.input, { flex: 1, marginTop: 0 }]}
                      placeholder="Namn på ny lista"
                      placeholderTextColor="#9ca3af"
                      value={newListName}
                      onChangeText={setNewListName}
                      returnKeyType="done"
                      onSubmitEditing={createListAndContinue}
                    />
                    <Pressable
                      style={[s.createListBtn, (!newListName.trim() || creatingList) && s.buttonDisabled]}
                      onPress={createListAndContinue}
                      disabled={creatingList || !newListName.trim()}
                    >
                      {creatingList
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={s.createListBtnText}>Skapa</Text>}
                    </Pressable>
                  </View>
                </>
              ) : (
                <ScrollView style={s.bulkRecipeList}>
                  {shoppingLists.map(l => (
                    <Pressable
                      key={l.id}
                      style={[s.pickerItem, !!bulkTransferringListId && s.pickerItemDisabled]}
                      onPress={() => executeBulkTransfer(l.id)}
                      disabled={!!bulkTransferringListId}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.pickerItemTitle}>{l.name}</Text>
                        <Text style={s.pickerItemMeta}>{l.items.length} varor</Text>
                      </View>
                      {bulkTransferringListId === l.id && <ActivityIndicator size="small" color="#4f46e5" />}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <Pressable
                style={[s.button, { backgroundColor: '#e5e7eb' }]}
                onPress={() => setBulkTransferStep('ingredients')}
              >
                <Text style={[s.buttonText, { color: '#374151' }]}>Tillbaka</Text>
              </Pressable>
            </>
          )}
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <DatePickerModal
        visible={showWeekPicker}
        value={null}
        title="Gå till vecka"
        onChange={(dateStr) => {
          if (!dateStr) return;
          const picked = new Date(dateStr + 'T00:00:00');
          const day = picked.getDay();
          picked.setDate(picked.getDate() + (day === 0 ? -6 : 1 - day));
          const todayMonday = getWeekMonday(0);
          const diffWeeks = Math.round((picked.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
          setWeekOffset(diffWeeks);
          setShowWeekPicker(false);
        }}
        onClose={() => setShowWeekPicker(false)}
      />

      <RNAnimated.View style={[s.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={s.toastText}>{toastMessage}</Text>
      </RNAnimated.View>
    </SafeAreaView>
  );
}

function MenuCard({
  item,
  isTransferred,
  isPending,
  editMode,
  onRemove,
  onViewRecipe,
  onMoveToDay,
  onReplace,
  onLongPress,
  onDragStart,
  onDragMove,
  onDragEnd,
  isDragging,
  scaledServings,
  onScaleServings,
}: {
  item: WeekMenuItemWithRecipe;
  isTransferred: boolean;
  isPending?: boolean;
  editMode: boolean;
  onRemove: () => void;
  onViewRecipe: () => void;
  onMoveToDay: (day: WeekDay | null) => void;
  onReplace: () => void;
  onLongPress: () => void;
  onDragStart: (x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  scaledServings: number;
  onScaleServings: (n: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { medium } = useHaptics();
  const { fs, sp } = useTablet();

  // Pan gesture for drag — use only onFinalize to avoid double-fire
  const panGesture = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart(e => {
      runOnJS(medium)();
      runOnJS(onLongPress)();
      runOnJS(onDragStart)(e.absoluteX, e.absoluteY);
    })
    .onUpdate(e => {
      runOnJS(onDragMove)(e.absoluteX, e.absoluteY);
    })
    .onFinalize(() => {
      runOnJS(onDragEnd)();
    });

  function handlePress() {
    if (editMode) return;
    setExpanded(e => !e);
  }

  return (
    <GestureDetector gesture={panGesture}>
      <View style={[s.card, isDragging && s.cardDragging, isPending && s.cardPending]}>
        {editMode && (
          <Pressable
            style={s.cardDeleteBtn}
            onPress={onRemove}
            hitSlop={10}
          >
            <Ionicons name="remove-circle" size={22} color="#6b7280" />
          </Pressable>
        )}
        <View style={s.cardInner}>
          <Pressable style={[s.cardMain, { padding: sp(14), gap: sp(12) }]} onPress={handlePress}>
            <View style={[s.cardIcon, { width: sp(36), height: sp(36) }]}>
              <Ionicons name="restaurant-outline" size={fs(18)} color="#4f46e5" />
            </View>
            <View style={s.cardContent}>
              <Text style={[s.cardTitle, { fontSize: fs(15) }, isPending && s.cardTitlePending]}>{item.recipe.title}</Text>
              {isTransferred && (
                <View style={s.transferredBadge}>
                  <Ionicons name="checkmark-circle" size={fs(14)} color="#10b981" />
                  <Text style={[s.transferredText, { fontSize: fs(11) }]}>I inköpslistan</Text>
                </View>
              )}
              <Text style={[s.cardMeta, { fontSize: fs(12) }]}>
                {scaledServings !== item.recipe.servings
                  ? `${scaledServings} port (orig. ${item.recipe.servings})`
                  : `${item.recipe.servings} port`}
                {' · '}{item.recipe.ingredients.length} ingredienser
              </Text>
            </View>
            {!editMode && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={fs(16)} color="#9ca3af" />}
          </Pressable>

          {!editMode && expanded && (
            <View style={s.cardExpanded}>
              {/* Portion scaler */}
              <View style={s.servingScaler}>
                <Text style={s.servingScalerLabel}>Portioner</Text>
                <View style={s.servingScalerControls}>
                  <Pressable
                    onPress={() => onScaleServings(Math.max(1, scaledServings - 1))}
                    style={s.servingScalerBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="remove" size={14} color="#4f46e5" />
                  </Pressable>
                  <Text style={s.servingScalerValue}>{scaledServings}</Text>
                  <Pressable
                    onPress={() => onScaleServings(scaledServings + 1)}
                    style={s.servingScalerBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="add" size={14} color="#4f46e5" />
                  </Pressable>
                </View>
              </View>

              <View style={s.cardActions}>
                <Pressable style={s.cardAction} onPress={onViewRecipe}>
                  <Ionicons name="open-outline" size={15} color="#6b7280" />
                  <Text style={s.cardActionText}>Visa</Text>
                </Pressable>
                <Pressable style={s.cardAction} onPress={onReplace}>
                  <Ionicons name="swap-horizontal-outline" size={15} color="#6b7280" />
                  <Text style={s.cardActionText}>Byt ut</Text>
                </Pressable>
                <Pressable style={s.cardAction} onPress={onRemove}>
                  <Ionicons name="trash-outline" size={15} color="#ef4444" />
                  <Text style={[s.cardActionText, { color: '#ef4444' }]}>Ta bort</Text>
                </Pressable>
              </View>

            </View>
          )}
        </View>
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef2ff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  headerActionText: { fontWeight: '600', color: '#4f46e5', fontSize: 13 },
  headerIconBtn: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#eef2ff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  segment: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 2, marginTop: 8 },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 6 },
  segmentBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  segmentTextActive: { color: '#4f46e5' },
  invSub: { fontSize: 13, color: '#6b7280', marginTop: 10, marginBottom: 8 },
  invRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f3f4f6' },
  invName: { fontSize: 15, color: '#111827', fontWeight: '500' },
  invNameDone: { color: '#9ca3af', textDecorationLine: 'line-through' },
  invProvenance: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  invBuy: { color: '#f59e0b', fontWeight: '600' },
  invAmountWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  invAmountLabel: { fontSize: 12, color: '#9ca3af' },
  invAmountInput: { width: 56, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#a5b4fc', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7, fontSize: 15, color: '#111827', textAlign: 'right' },
  invUnit: { width: 32, fontSize: 13, color: '#6b7280' },
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 16, paddingBottom: 80 },
  section: { gap: 8 },
  daySlot: { borderWidth: 1, borderColor: '#c7c2f0', borderRadius: 12, padding: 6, gap: 6, backgroundColor: '#fff' },
  daySlotEmpty: { borderColor: '#c7c2f0', backgroundColor: 'transparent', minHeight: 72, alignItems: 'center', justifyContent: 'center', padding: 0 },
  daySlotFilled: { borderWidth: 0, padding: 0, backgroundColor: 'transparent' },
  daySlotHovered: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  daySlotEmptyTap: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 72 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#7c3aed', letterSpacing: 0.8 },
  dayHeader: { gap: 1 },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  dayDate: { fontSize: 11, color: '#6b7280' },
  unscheduledEmpty: { fontSize: 13, color: '#9ca3af', paddingVertical: 8 },
  emptyDayText: { fontSize: 13, color: '#9ca3af', paddingVertical: 8 },
  emptyDayTap: { paddingVertical: 4, alignItems: 'flex-start' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  card: { borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#c7d2fe', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  cardInner: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  cardMain: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  transferredBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  transferredText: { fontSize: 11, color: '#10b981', fontWeight: '600' },
  cardExpanded: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingHorizontal: 14, paddingBottom: 12 },
  servingScaler: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 4 },
  servingScalerLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  servingScalerControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  servingScalerBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  servingScalerValue: { fontSize: 15, fontWeight: '700', color: '#111827', minWidth: 24, textAlign: 'center' },
  servingScalerReset: { fontSize: 12, color: '#9ca3af', textDecorationLine: 'underline' },
  cardActions: { flexDirection: 'row', gap: 0, paddingTop: 10, pointerEvents: 'auto' },
  cardAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, pointerEvents: 'auto' },
  cardActionText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  assignDayRow: { marginTop: 8, gap: 6 },
  assignDayLabel: { fontSize: 12, color: '#9ca3af' },
  assignDayBtns: { flexDirection: 'row', gap: 6 },
  assignDayBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f3f4f6' },
  assignDayBtnActive: { backgroundColor: '#4f46e5' },
  assignDayBtnText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  assignDayBtnTextActive: { color: '#fff', fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 12 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  sheetSub: { fontSize: 13, color: '#6b7280', marginTop: -10, marginBottom: 12 },
  backBtn: { padding: 4, marginBottom: 16 },
  bulkRecipeList: { maxHeight: 400, marginBottom: 12 },
  bulkRecipeItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8 },
  bulkRecipeItemActive: { backgroundColor: '#eef2ff', borderColor: '#4f46e5' },
  bulkRecipeTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  bulkRecipeDay: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  dayGrid: { gap: 10 },
  dayGridItem: { paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#f3f4f6', borderRadius: 12 },
  dayGridItemNone: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  dayGridLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  dayGridLabelNone: { color: '#9ca3af' },
  pickerList: { maxHeight: 480 },
  recipeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' },
  recipeCardIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f9fafb', alignItems: 'center', justifyContent: 'center' },
  recipeCardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  recipeCardMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  pickerItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center' },
  pickerItemDisabled: { opacity: 0.5 },
  pickerItemTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  pickerItemMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  pickerEmpty: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  pickerEmptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  pickerEmptyBtn: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#4f46e5', borderRadius: 8 },
  pickerEmptyBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  createListRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 8 },
  createListBtn: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#4f46e5', borderRadius: 10 },
  createListBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  cleanupSub: { fontSize: 13, color: '#6b7280', marginTop: -10 },
  cleanupList: { gap: 8 },
  cleanupItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb' },
  cleanupItemActive: { backgroundColor: '#eef2ff', borderColor: '#4f46e5' },
  cleanupListName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cleanupItemCount: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  cleanupActions: { flexDirection: 'row', gap: 12 },
  cleanupCancel: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  cleanupCancelText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  cleanupConfirm: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#ef4444' },
  cleanupConfirmDisabled: { opacity: 0.4 },
  cleanupConfirmText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  pickerDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 12 },
  newListLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginTop: 8, marginBottom: 8 },
  newListRow: { flexDirection: 'row', gap: 10 },
  newListSection: { paddingVertical: 24, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 24 },
  newListBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#eef2ff', borderRadius: 12, borderWidth: 1, borderColor: '#c7d2fe' },
  newListBtnDisabled: { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' },
  newListBtnText: { fontSize: 16, fontWeight: '600', color: '#4f46e5' },
  newListBtnTextDisabled: { color: '#9ca3af' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#f9fafb' },
  button: { backgroundColor: '#4f46e5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minWidth: 44 },
  cancelBtn: { paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.4 },
  // Edit mode
  sectionHovered: { backgroundColor: '#eef2ff', borderRadius: 12, borderWidth: 1, borderColor: '#4f46e5' },
  cardDragging: { opacity: 0.4 },
  cardPending: { opacity: 0.4, backgroundColor: '#fef2f2' },
  cardTitlePending: { textDecorationLine: 'line-through', color: '#9ca3af' },
  cardDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: '#fff', borderRadius: 11 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', paddingHorizontal: 32, paddingVertical: 14, backgroundColor: '#111827', borderRadius: 24, zIndex: 20 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ghostCard: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, elevation: 10, zIndex: 100 },
  ghostCardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  ghostCardText: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  toast: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#34d399', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
