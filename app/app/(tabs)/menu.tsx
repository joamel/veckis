import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  FlatList,
  Modal,
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
import { getISOWeek, addWeeks, getISOWeekMonday } from '../../src/lib/week';
import { useHaptics } from '../../src/hooks/useHaptics';
import { useTablet } from '../../src/hooks/useTablet';
import { ScreenHeader } from '../../src/components/ScreenHeader';
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

export default function MenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bulkTransfer?: string; originListId?: string }>();
  const bulkTransferTriggeredRef = useRef(false);
  const client = useApiClient();
  const { showToast: showGlobalToast } = useToast();
  const scaleWarnedRef = useRef<Set<string>>(new Set());
  const { householdId } = useHousehold();
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
  const [selectedRecipesForTransfer, setSelectedRecipesForTransfer] = useState<Set<string>>(new Set());
  const [bulkTransferStep, setBulkTransferStep] = useState<'week' | 'recipe' | 'list'>('recipe');
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

  async function openWeekPicker() {
    if (!householdId) return;
    try {
      const all = await client.getAllMenus(householdId);
      setAllMenus(all);
      setBulkTransferStep('week');
      setShowBulkTransferModal(true);
    } catch {
      Alert.alert('Fel', 'Kunde inte hämta veckomenyer');
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

  async function addRecipeToDay(recipe: RecipeWithIngredients) {
    if (!householdId) return;

    if (replaceTarget) {
      closePicker();
      const day = replaceTarget.day;
      const oldId = replaceTarget.id;
      try {
        await client.deleteWeekMenuItem(oldId);
        const item = await client.addToWeekMenu({ householdId, recipeId: recipe.id, day, weekYear, weekNumber });
        setMenuItems(prev => prev.filter(i => i.id !== oldId).concat(item));
      } catch {
        Alert.alert('Fel', 'Kunde inte byta ut rätten');
      }
      return;
    }

    const day = pickingForDay;

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
    } catch {
      setMenuItems(prev => prev.filter(m => m.id !== tempId));
      Alert.alert('Fel', 'Kunde inte lägga till rätt');
    }
  }

  async function removeFromMenu(item: WeekMenuItemWithRecipe) {
    const ok = await new Promise<boolean>(resolve => {
      Alert.alert(
        'Ta bort maträtt?',
        `Vill du ta bort ${item.recipe.title} från veckomenyn?`,
        [
          { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Ta bort', style: 'destructive', onPress: () => resolve(true) },
        ],
      );
    });
    if (!ok) return;
    try {
      await client.deleteWeekMenuItem(item.id);
      const newItems = menuItems.filter(i => i.id !== item.id);
      setMenuItems(newItems);

      const lists = recipeListMap[item.id] ?? [];
      if (lists.length === 0) return;
      await executeCleanup(item, lists.map(l => l.listId));
    } catch {
      Alert.alert('Fel', 'Kunde inte ta bort');
    }
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
    } catch {
      Alert.alert('Fel', 'Kunde inte ta bort ingredienserna');
    }
  }

  async function createListAndContinue() {
    if (!householdId || !newListName.trim()) return;
    setCreatingList(true);
    try {
      const list = await client.createShoppingList({ householdId, name: newListName.trim() });
      setShoppingLists(prev => [...prev, list]);
      setNewListName('');
    } catch {
      Alert.alert('Fel', 'Kunde inte skapa lista');
    } finally {
      setCreatingList(false);
    }
  }

  async function transferWeekMenu() {
    if (menuItems.length === 0) {
      Alert.alert('Tomt', 'Ingen rätt planerad denna vecka');
      return;
    }

    const notTransferred = menuItems.filter(m => !recipeListMap[m.id]?.length);
    if (notTransferred.length === 0) {
      Alert.alert('Redan överförd', 'Alla rätter denna vecka är redan överförda till en inköpslista');
      return;
    }

    setSelectedRecipesForTransfer(new Set(notTransferred.map(m => m.id)));
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

      const allIngredients: { name: string; quantity: number | null; unit: string | null; category?: string; recipeId: string; menuItemId: string }[] = [];
      for (const item of actuallyTransfer) {
        const scaleRatio = getScaleRatio(item);
        for (const ing of item.recipe.ingredients) {
          allIngredients.push({
            name: ing.name,
            quantity: scaleQty(ing.quantity ?? null, scaleRatio),
            unit: ing.unit ?? null,
            category: ing.category,
            recipeId: item.recipeId,
            menuItemId: item.id,
          });
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
    } catch {
      setBulkTransferringListId(null);
      Alert.alert('Fel', 'Kunde inte överföra ingredienserna');
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
    } catch {
      setTransferringListId(null);
      Alert.alert('Fel', 'Kunde inte lägga till ingredienserna');
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
    } catch {
      setMenuItems(prev => prev.map(i => i.id === item.id ? item : i));
      Alert.alert('Fel', 'Kunde inte flytta rätten');
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
        actionIcon="book-outline"
        actionLabel="Recept"
        onActionPress={() => router.push('/recipes' as never)}
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
        style={s.content}
        contentContainerStyle={s.contentInner}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      >
        {/* Day sections — sorted Mon→Sun, show all 7 days */}
        {DAYS.map((day, i) => {
          const items = menuItems.filter(m => m.day === day.key);
          const date = new Date(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate() + i);
          const isHovered = hoverDay === day.key;
          return (
            <View
              key={day.key}
              style={[s.section, isHovered && s.sectionHovered]}
              ref={ref => measureDaySection(day.key, ref)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: fs(14), fontWeight: '700', color: '#111827' }}>
                  {day.label}{' '}
                  <Text style={{ fontSize: fs(12), fontWeight: '400', color: '#6b7280' }}>{date.getDate()} {MONTH_NAMES[date.getMonth()]}</Text>
                </Text>
                {!editMode && items.length === 0 && (
                  <Pressable onPress={() => { setPickingForDay(day.key); setPickerStep('recipe'); setShowPicker(true); }}>
                    <Ionicons name="add-circle-outline" size={fs(20)} color="#4f46e5" />
                  </Pressable>
                )}
              </View>
              {items.length === 0 ? (
                <Pressable
                  onPress={() => { setPickingForDay(day.key); setPickerStep('recipe'); setShowPicker(true); }}
                  style={s.emptyDayTap}
                >
                  <Text style={s.emptyDayText}>Tryck för att lägga till en rätt</Text>
                </Pressable>
              ) : (
                items.map(item => (
                  <MenuCard
                    key={item.id}
                    item={item}
                    isTransferred={!!recipeListMap[item.id]?.length}
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
          <View style={s.emptyDay}>
            <Ionicons name="restaurant-outline" size={48} color="#d1d5db" />
            <Text style={s.emptyText}>Inga rätter planerade</Text>
            <Text style={s.emptySubtext}>Tryck på + för att lägga till</Text>
          </View>
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
                  ListFooterComponent={
                    <Pressable
                      style={[s.pickerItem, { flexDirection: 'row', gap: 8, alignItems: 'center' }]}
                      onPress={() => { setShowPicker(false); router.push('/recipes' as never); }}
                    >
                      <Ionicons name="add-circle-outline" size={20} color="#4f46e5" />
                      <Text style={[s.pickerItemTitle, { color: '#4f46e5' }]}>Skapa nytt recept</Text>
                    </Pressable>
                  }
                  renderItem={({ item }) => (
                    <Pressable style={s.pickerItem} onPress={() => addRecipeToDay(item)}>
                      <Text style={s.pickerItemTitle}>{item.title}</Text>
                      <Text style={s.pickerItemMeta}>{item.servings} port · {item.ingredients.length} ingredienser</Text>
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
      </Modal>

      {/* Bulk transfer modal — choose recipes and list */}
      <Modal visible={showBulkTransferModal} transparent animationType="slide" onRequestClose={() => handleCancelBulkTransfer()}>
        <Pressable style={s.overlay} onPress={() => handleCancelBulkTransfer()} />
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
                  .filter(item => {
                    if (bulkTransferWeek) {
                      const transferredIds = new Set(
                        shoppingLists.flatMap(l => l.items.map(i => i.menuItemId).filter(Boolean) as string[])
                      );
                      return !transferredIds.has(item.id);
                    }
                    return !!!recipeListMap[item.id]?.length;
                  })
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
                onPress={() => setBulkTransferStep('recipe')}
              >
                <Text style={[s.buttonText, { color: '#374151' }]}>Tillbaka</Text>
              </Pressable>
            </>
          )}
        </View>
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
      <View style={[s.card, isDragging && s.cardDragging]}>
        {editMode && (
          <Pressable
            style={s.cardDeleteBtn}
            onPress={() => Alert.alert(
              'Ta bort från menyn?',
              item.recipe.title,
              [
                { text: 'Avbryt', style: 'cancel' },
                { text: 'Ta bort', style: 'destructive', onPress: onRemove },
              ]
            )}
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
              <Text style={[s.cardTitle, { fontSize: fs(15) }]}>{item.recipe.title}</Text>
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
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 16, paddingBottom: 80 },
  section: { gap: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8 },
  dayHeader: { gap: 1 },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  dayDate: { fontSize: 11, color: '#6b7280' },
  unscheduledEmpty: { fontSize: 13, color: '#9ca3af', paddingVertical: 8 },
  emptyDayText: { fontSize: 13, color: '#9ca3af', paddingVertical: 8 },
  emptyDayTap: { paddingVertical: 4, alignItems: 'flex-start' },
  emptyDay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#374151' },
  emptySubtext: { fontSize: 13, color: '#9ca3af' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  card: { borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
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
  pickerList: { maxHeight: 400 },
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
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.4 },
  // Edit mode
  sectionHovered: { backgroundColor: '#eef2ff', borderRadius: 12, borderWidth: 1, borderColor: '#4f46e5' },
  cardDragging: { opacity: 0.4 },
  cardDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: '#fff', borderRadius: 11 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', paddingHorizontal: 32, paddingVertical: 14, backgroundColor: '#111827', borderRadius: 24, zIndex: 20 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ghostCard: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, elevation: 10, zIndex: 100 },
  ghostCardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  ghostCardText: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  toast: { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: '#34d399', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
