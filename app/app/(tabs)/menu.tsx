import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useApiClient, type WeekMenuItemWithRecipe, type RecipeWithIngredients, type ShoppingListWithItems } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { getISOWeek, addWeeks } from '../../src/lib/week';
import { useHaptics } from '../../src/hooks/useHaptics';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { WeekNav } from '../../src/components/WeekNav';
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
  const client = useApiClient();
  const { householdId } = useHousehold();

  const [weekOffset, setWeekOffset] = useState(0);
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
  const [transferredRecipeIds, setTransferredRecipeIds] = useState<Set<string>>(new Set());
  const [transferSheet, setTransferSheet] = useState<WeekMenuItemWithRecipe | null>(null);
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
  const [bulkTransferStep, setBulkTransferStep] = useState<'recipe' | 'list'>('recipe');

  // Replace recipe: item being replaced
  const [replaceTarget, setReplaceTarget] = useState<WeekMenuItemWithRecipe | null>(null);

  // Edit (shake) mode
  const [editMode, setEditMode] = useState(false);

  // Drag state
  type DragState = { item: WeekMenuItemWithRecipe; x: number; y: number };
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
          const itemsForThisMenuItem = l.items.filter(item => item.recipeId === menuItem.recipeId);
          if (itemsForThisMenuItem.length > 0) {
            transferred.add(menuItem.recipeId);
            if (!listMap[menuItem.id].find(e => e.listId === l.id)) {
              listMap[menuItem.id].push({ listId: l.id, listName: l.name, itemCount: itemsForThisMenuItem.length });
            }
          }
        });
      });
      setTransferredRecipeIds(transferred);
      setRecipeListMap(listMap);
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda menyn');
    } finally {
      setLoading(false);
    }
  }, [householdId, weekYear, weekNumber]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  function onDragStart(item: WeekMenuItemWithRecipe, x: number, y: number) {
    setDragState({ item, x, y });
  }

  function onDragMove(x: number, y: number) {
    setDragState(prev => prev ? { ...prev, x, y } : null);
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
    try {
      const item = await client.addToWeekMenu({ householdId, recipeId: recipe.id, day, weekYear, weekNumber });
      setMenuItems(prev => [...prev, item]);
    } catch {
      Alert.alert('Fel', 'Kunde inte lägga till rätt');
    }
  }

  async function removeFromMenu(item: WeekMenuItemWithRecipe) {
    try {
      await client.deleteWeekMenuItem(item.id);
      const newItems = menuItems.filter(i => i.id !== item.id);
      setMenuItems(newItems);

      const lists = recipeListMap[item.id] ?? [];
      if (lists.length === 0) return;

      if (lists.length === 1) {
        Alert.alert(
          'Ta bort från inköpslista?',
          `Ta bort ${item.recipe.title}s ingredienser från "${lists[0].listName}"?`,
          [
            { text: 'Behåll', style: 'cancel' },
            { text: 'Ta bort', style: 'destructive', onPress: () => executeCleanup(item, [lists[0].listId]) },
          ]
        );
      } else {
        setCleanupPrompt({ menuItem: item, lists });
        setSelectedCleanupLists(new Set(lists.map(l => l.listId)));
      }
    } catch {
      Alert.alert('Fel', 'Kunde inte ta bort');
    }
  }

  async function executeCleanup(menuItem: WeekMenuItemWithRecipe, listIds: string[]) {
    const ops: Promise<unknown>[] = [];
    for (const listId of listIds) {
      const list = shoppingLists.find(l => l.id === listId);
      if (!list) continue;
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

    const notTransferred = menuItems.filter(m => !transferredRecipeIds.has(m.recipeId));
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
      const toTransfer = menuItems.filter(item => selectedRecipesForTransfer.has(item.id));
      const existingRecipeIds = new Set(shoppingLists
        .find(l => l.id === listId)?.items
        .filter(i => i.recipe)
        .map(i => i.recipe!.id) ?? []);

      const actuallyTransfer = toTransfer.filter(item => !existingRecipeIds.has(item.recipeId));

      if (actuallyTransfer.length === 0) {
        Alert.alert('Redan med', 'Alla valda rätter är redan överförda till denna lista');
        return;
      }

      const allIngredients: { name: string; quantity: number | null; unit: string | null; category?: string; recipeId: string }[] = [];
      for (const item of actuallyTransfer) {
        for (const ing of item.recipe.ingredients) {
          allIngredients.push({
            name: ing.name,
            quantity: ing.quantity ?? null,
            unit: ing.unit ?? null,
            category: ing.category,
            recipeId: item.recipeId,
          });
        }
      }

      await client.transferToShopping(listId, allIngredients);
      setTransferredRecipeIds(prev => new Set([...prev, ...actuallyTransfer.map(m => m.recipeId)]));
      setShowBulkTransferModal(false);
      load();
      Alert.alert('Klart', `${actuallyTransfer.length} rätter överförda`);
    } catch {
      Alert.alert('Fel', 'Kunde inte överföra ingredienserna');
    }
  }

  async function doTransfer(listId: string) {
    if (!transferSheet) return;
    const recipe = transferSheet.recipe;
    setTransferSheet(null);
    try {
      await client.transferToShopping(listId, recipe.ingredients.map(ing => ({
        name: ing.name,
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        category: ing.category ?? undefined,
        recipeId: recipe.id,
      })));
      setTransferredRecipeIds(prev => new Set([...prev, recipe.id]));
      load();
    } catch {
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
    try {
      const updated = await client.updateWeekMenuItem(item.id, { day });
      setMenuItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch {
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
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' }}>
                  {day.label}{' '}
                  <Text style={{ fontSize: 12, fontWeight: '400', color: '#6b7280' }}>{date.getDate()} {MONTH_NAMES[date.getMonth()]}</Text>
                </Text>
                {!editMode && items.length === 0 && (
                  <Pressable onPress={() => { setPickingForDay(day.key); setPickerStep('recipe'); setShowPicker(true); }}>
                    <Ionicons name="add-circle-outline" size={20} color="#4f46e5" />
                  </Pressable>
                )}
              </View>
              {items.length === 0 ? (
                <Text style={s.emptyDayText}>Ingen rätt planerad</Text>
              ) : (
                items.map(item => (
                  <MenuCard
                    key={item.id}
                    item={item}
                    isTransferred={transferredRecipeIds.has(item.recipeId)}
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
                isTransferred={transferredRecipeIds.has(item.recipeId)}
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
            style={[s.newListBtn, menuItems.every(m => transferredRecipeIds.has(m.recipeId)) && s.newListBtnDisabled]}
            onPress={transferWeekMenu}
            disabled={menuItems.every(m => transferredRecipeIds.has(m.recipeId))}
          >
            <Ionicons name="cart-outline" size={20} color={menuItems.every(m => transferredRecipeIds.has(m.recipeId)) ? '#d1d5db' : '#4f46e5'} />
            <Text style={[s.newListBtnText, menuItems.every(m => transferredRecipeIds.has(m.recipeId)) && s.newListBtnTextDisabled]}>
              {menuItems.every(m => transferredRecipeIds.has(m.recipeId)) ? 'Redan överförd' : 'Veckomeny → Inköpslista'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>


      {/* Edit mode exit button */}
      {editMode && !dragState && (
        <Pressable style={s.editDoneBtn} onPress={exitEditMode}>
          <Text style={s.editDoneBtnText}>Klar</Text>
        </Pressable>
      )}

      {/* Drag ghost card */}
      {dragState && (
        <View
          pointerEvents="none"
          style={[s.ghostCard, { top: dragState.y - 28, left: dragState.x - 120 }]}
        >
          <Ionicons name="restaurant-outline" size={16} color="#4f46e5" />
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
              <Pressable key={l.id} style={s.pickerItem} onPress={() => doTransfer(l.id)}>
                <Text style={s.pickerItemTitle}>{l.name}</Text>
                <Text style={s.pickerItemMeta}>{l.items.length} varor</Text>
              </Pressable>
            ))
          )}
        </View>
      </Modal>

      {/* Bulk transfer modal — choose recipes and list */}
      <Modal visible={showBulkTransferModal} transparent animationType="slide" onRequestClose={() => setShowBulkTransferModal(false)}>
        <Pressable style={s.overlay} onPress={() => setShowBulkTransferModal(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />

          {bulkTransferStep === 'recipe' ? (
            <>
              <Text style={s.sheetTitle}>Välj rätter</Text>
              <Text style={s.sheetSub}>Vilka rätter vill du överföra?</Text>
              <ScrollView style={s.bulkRecipeList}>
                {menuItems
                  .filter(item => !transferredRecipeIds.has(item.recipeId))
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
                onPress={() => setBulkTransferStep('list')}
              >
                <Text style={s.buttonText}>Nästa</Text>
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
                      style={s.pickerItem}
                      onPress={() => executeBulkTransfer(l.id)}
                    >
                      <Text style={s.pickerItemTitle}>{l.name}</Text>
                      <Text style={s.pickerItemMeta}>{l.items.length} varor</Text>
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
}) {
  const [expanded, setExpanded] = useState(false);
  const { medium } = useHaptics();

  // Shake animation
  const rotation = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  useEffect(() => {
    if (editMode) {
      const offset = (Math.random() - 0.5) * 0.5;
      rotation.value = withRepeat(
        withSequence(
          withTiming(2 + offset, { duration: 80 }),
          withTiming(-2 + offset, { duration: 80 }),
        ),
        -1,
        true,
      );
    } else {
      rotation.value = withTiming(0, { duration: 100 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  // Pan gesture for drag
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
    .onEnd(() => {
      runOnJS(onDragEnd)();
    })
    .onFinalize(() => {
      runOnJS(onDragEnd)();
    });

  function handlePress() {
    if (editMode) return;
    setExpanded(e => !e);
  }

  function handleLongPressStatic() {
    if (editMode) return;
    medium();
    Alert.alert(
      item.recipe.title,
      undefined,
      [
        { text: 'Visa recept', onPress: onViewRecipe },
        { text: 'Byt ut mot annan rätt', onPress: onReplace },
        { text: 'Ta bort från menyn', style: 'destructive', onPress: onRemove },
        { text: 'Avbryt', style: 'cancel' },
      ]
    );
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[s.card, shakeStyle, isDragging && s.cardDragging]}>
        {editMode && (
          <Pressable style={s.cardDeleteBtn} onPress={onRemove} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color="#ef4444" />
          </Pressable>
        )}
        <Pressable style={s.cardMain} onPress={handlePress} onLongPress={handleLongPressStatic}>
          <View style={s.cardIcon}>
            <Ionicons name="restaurant-outline" size={18} color="#4f46e5" />
          </View>
          <View style={s.cardContent}>
            <Text style={s.cardTitle}>{item.recipe.title}</Text>
            {isTransferred && (
              <View style={s.transferredBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                <Text style={s.transferredText}>I inköpslistan</Text>
              </View>
            )}
            <Text style={s.cardMeta}>{item.recipe.servings} port · {item.recipe.ingredients.length} ingredienser</Text>
          </View>
          {!editMode && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />}
        </Pressable>

        {!editMode && expanded && (
          <View style={s.cardExpanded}>
            <View style={s.cardActions}>
              <Pressable style={s.cardAction} onPress={onViewRecipe}>
                <Ionicons name="open-outline" size={15} color="#6b7280" />
                <Text style={s.cardActionText}>Visa recept</Text>
              </Pressable>
              <Pressable style={s.cardAction} onPress={onRemove}>
                <Ionicons name="trash-outline" size={15} color="#ef4444" />
                <Text style={[s.cardActionText, { color: '#ef4444' }]}>Ta bort</Text>
              </Pressable>
            </View>

            <View style={s.assignDayRow}>
              <Text style={s.assignDayLabel}>Flytta till dag:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.assignDayBtns}>
                  {DAYS.map(d => (
                    <Pressable
                      key={d.key}
                      style={[s.assignDayBtn, item.day === d.key && s.assignDayBtnActive]}
                      onPress={() => onMoveToDay(d.key)}
                    >
                      <Text style={[s.assignDayBtnText, item.day === d.key && s.assignDayBtnTextActive]}>{d.short}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    style={[s.assignDayBtn, item.day === null && s.assignDayBtnActive]}
                    onPress={() => onMoveToDay(null)}
                  >
                    <Text style={[s.assignDayBtnText, item.day === null && s.assignDayBtnTextActive]}>Ingen</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Animated.View>
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
  emptyDay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#374151' },
  emptySubtext: { fontSize: 13, color: '#9ca3af' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  card: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardMain: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cardMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  transferredBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  transferredText: { fontSize: 11, color: '#10b981', fontWeight: '600' },
  cardExpanded: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingHorizontal: 14, paddingBottom: 12 },
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
  pickerItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
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
  cardDeleteBtn: { position: 'absolute', top: -8, left: -8, zIndex: 10 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', paddingHorizontal: 32, paddingVertical: 14, backgroundColor: '#111827', borderRadius: 24, zIndex: 20 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ghostCard: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 8, zIndex: 100, maxWidth: 240 },
  ghostCardText: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1 },
});
