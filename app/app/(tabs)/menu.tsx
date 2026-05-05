import { useState, useCallback, useMemo } from 'react';
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
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type WeekMenuItemWithRecipe, type RecipeWithIngredients, type ShoppingListWithItems } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { getISOWeek, addWeeks } from '../../src/lib/week';
import { useHaptics } from '../../src/hooks/useHaptics';
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
  const { householdId, householdName, householdEmoji } = useHousehold();

  const [weekOffset, setWeekOffset] = useState(0);
  const weekMonday = useMemo(() => getWeekMonday(weekOffset), [weekOffset]);
  const { weekYear, weekNumber } = useMemo(() => getISOWeek(weekMonday), [weekMonday]);

  const weekLabel = useMemo(() => {
    const end = new Date(weekMonday);
    end.setDate(weekMonday.getDate() + 6);
    const startStr = weekMonday.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
    const endStr = end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
    return `v${weekNumber} · ${startStr}–${endStr}`;
  }, [weekMonday, weekNumber]);

  const [menuItems, setMenuItems] = useState<WeekMenuItemWithRecipe[]>([]);
  const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingListWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferredRecipeIds, setTransferredRecipeIds] = useState<Set<string>>(new Set());
  const [transferSheet, setTransferSheet] = useState<WeekMenuItemWithRecipe | null>(null);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  // Per-recipe: which lists have items from it
  type ListEntry = { listId: string; listName: string; itemIds: string[] };
  const [recipeListMap, setRecipeListMap] = useState<Record<string, ListEntry[]>>({});
  // Cleanup prompt after removing from menu
  const [cleanupPrompt, setCleanupPrompt] = useState<{ recipeId: string; recipeTitle: string; lists: ListEntry[] } | null>(null);
  const [selectedCleanupLists, setSelectedCleanupLists] = useState<Set<string>>(new Set());

  // Two-step modal: 'day' → pick a day, 'recipe' → pick a recipe
  const [showPicker, setShowPicker] = useState(false);
  const [pickerStep, setPickerStep] = useState<'day' | 'recipe'>('day');
  const [pickingForDay, setPickingForDay] = useState<WeekDay | null>(null);

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
      activeLists.forEach(l => {
        l.items.forEach(item => {
          if (!item.recipeId) return;
          transferred.add(item.recipeId);
          if (!listMap[item.recipeId]) listMap[item.recipeId] = [];
          let entry = listMap[item.recipeId].find(e => e.listId === l.id);
          if (!entry) {
            entry = { listId: l.id, listName: l.name, itemIds: [] };
            listMap[item.recipeId].push(entry);
          }
          entry.itemIds.push(item.id);
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
    setShowPicker(true);
  }

  async function addRecipeToDay(recipe: RecipeWithIngredients) {
    if (!householdId) return;
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
      if (!confirmed) { setShowPicker(false); return; }
    }

    setShowPicker(false);
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

      // If recipe still appears elsewhere in menu, don't prompt for shopping cleanup
      if (newItems.some(i => i.recipeId === item.recipeId)) return;

      const lists = recipeListMap[item.recipeId] ?? [];
      if (lists.length === 0) return;

      if (lists.length === 1) {
        // Single list — simple confirm alert
        Alert.alert(
          'Ta bort från inköpslista?',
          `Ta bort ${item.recipe.title}s ingredienser från "${lists[0].listName}"?`,
          [
            { text: 'Behåll', style: 'cancel' },
            { text: 'Ta bort', style: 'destructive', onPress: () => executeCleanup(item.recipeId, [lists[0].listId]) },
          ]
        );
      } else {
        // Multiple lists — show selection modal
        setCleanupPrompt({ recipeId: item.recipeId, recipeTitle: item.recipe.title, lists });
        setSelectedCleanupLists(new Set(lists.map(l => l.listId)));
      }
    } catch {
      Alert.alert('Fel', 'Kunde inte ta bort');
    }
  }

  async function executeCleanup(recipeId: string, listIds: string[]) {
    const allItemIds = listIds.flatMap(lid => {
      const entry = recipeListMap[recipeId]?.find(e => e.listId === lid);
      return entry?.itemIds ?? [];
    });
    try {
      await Promise.all(allItemIds.map(id => client.deleteShoppingItem(id)));
      setTransferredRecipeIds(prev => { const n = new Set(prev); n.delete(recipeId); return n; });
      setRecipeListMap(prev => { const n = { ...prev }; delete n[recipeId]; return n; });
    } catch {
      Alert.alert('Fel', 'Kunde inte ta bort ingredienserna');
    }
  }

  async function createListAndTransfer() {
    if (!householdId || !newListName.trim() || !transferSheet) return;
    setCreatingList(true);
    try {
      const list = await client.createShoppingList({ householdId, name: newListName.trim() });
      await doTransfer(list.id);
      setNewListName('');
    } catch {
      Alert.alert('Fel', 'Kunde inte skapa lista och överföra ingredienser');
    } finally {
      setCreatingList(false);
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
    try {
      const updated = await client.updateWeekMenuItem(item.id, { day });
      setMenuItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch {
      Alert.alert('Fel', 'Kunde inte flytta rätten');
    }
  }

  async function removeFromShoppingList(recipeId: string) {
    const lists = recipeListMap[recipeId] ?? [];
    if (lists.length === 0) return;

    if (lists.length === 1) {
      await executeCleanup(recipeId, [lists[0].listId]);
    } else {
      // Let user pick which lists to remove from
      setCleanupPrompt({ recipeId, recipeTitle: '', lists });
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
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.title}>Meny</Text>
            {householdName && <Text style={s.subtitle}>{householdEmoji || '🏠'} {householdName}</Text>}
          </View>
          <Pressable style={s.recipesBtn} onPress={() => router.push('/recipes' as never)}>
            <Ionicons name="book-outline" size={16} color="#4f46e5" />
            <Text style={s.recipesBtnText}>Recept</Text>
          </Pressable>
        </View>
        <View style={s.weekNav}>
          <Pressable style={s.weekNavBtn} onPress={() => setWeekOffset(o => o - 1)}>
            <Ionicons name="chevron-back" size={18} color="#4f46e5" />
          </Pressable>
          <Pressable style={s.weekLabelBtn} onPress={() => setWeekOffset(0)}>
            <Text style={[s.weekLabel, weekOffset === 0 && s.weekLabelCurrent]}>{weekLabel}</Text>
            {weekOffset !== 0 && <Text style={s.weekLabelHint}>tryck för denna vecka</Text>}
          </Pressable>
          <Pressable style={s.weekNavBtn} onPress={() => setWeekOffset(o => o + 1)}>
            <Ionicons name="chevron-forward" size={18} color="#4f46e5" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={s.content}
        contentContainerStyle={s.contentInner}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      >
        {/* Day sections — sorted Mon→Sun */}
        {DAYS.map((day, i) => {
          const items = menuItems.filter(m => m.day === day.key);
          if (items.length === 0) return null;
          const date = new Date(weekMonday);
          date.setDate(weekMonday.getDate() + i);
          const dateLabel = date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
          return (
            <View key={day.key} style={s.section}>
              <View style={s.sectionRow}>
                <View style={s.dayHeader}>
                  <Text style={s.dayLabel}>{day.label}</Text>
                  <Text style={s.dayDate}>{dateLabel}</Text>
                </View>
              </View>
              {items.map(item => (
                <MenuCard
                  key={item.id}
                  item={item}
                  isTransferred={transferredRecipeIds.has(item.recipeId)}
                  onRemove={() => removeFromMenu(item)}
                  onViewRecipe={() => router.push(`/recipes/${item.recipeId}` as never)}
                  onTransfer={() => setTransferSheet(item)}
                  onRemoveFromList={() => removeFromShoppingList(item.recipeId)}
                  onMoveToDay={d => moveToDay(item, d)}
                />
              ))}
            </View>
          );
        })}

        {/* Unscheduled */}
        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionLabel}>EJ SCHEMALAGDA</Text>
            <Pressable onPress={() => openPicker(null)}>
              <Ionicons name="add-circle-outline" size={20} color="#4f46e5" />
            </Pressable>
          </View>
          {unscheduled.length === 0 ? (
            <Text style={s.unscheduledEmpty}>Lägg till rätter utan dag för att planera i kalendern</Text>
          ) : (
            unscheduled.map(item => (
              <MenuCard
                key={item.id}
                item={item}
                isTransferred={transferredRecipeIds.has(item.recipeId)}
                onRemove={() => removeFromMenu(item)}
                onViewRecipe={() => router.push(`/recipes/${item.recipeId}` as never)}
                onTransfer={() => router.push(`/recipes/${item.recipeId}?transfer=1` as never)}
                onRemoveFromList={() => removeFromShoppingList(item.recipeId)}
                onMoveToDay={d => moveToDay(item, d)}
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
      </ScrollView>

      <Pressable style={s.fab} onPress={() => openPicker('ask')}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      {/* Two-step recipe picker modal */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={s.overlay} onPress={() => setShowPicker(false)} />
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
                <Pressable onPress={() => setPickerStep('day')} style={s.backBtn}>
                  <Ionicons name="chevron-back" size={20} color="#4f46e5" />
                </Pressable>
                <Text style={s.sheetTitle}>
                  {pickingForDay
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
          {cleanupPrompt?.recipeTitle ? (
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
                    <Text style={s.cleanupItemCount}>{l.itemIds.length} ingredienser</Text>
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
                setCleanupPrompt(null);
                executeCleanup(cleanupPrompt.recipeId, [...selectedCleanupLists]);
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
          {shoppingLists.map(l => (
            <Pressable key={l.id} style={s.pickerItem} onPress={() => doTransfer(l.id)}>
              <Text style={s.pickerItemTitle}>{l.name}</Text>
              <Text style={s.pickerItemMeta}>{l.items.length} varor</Text>
            </Pressable>
          ))}
          <View style={s.newListRow}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder="Ny lista..."
              value={newListName}
              onChangeText={setNewListName}
              returnKeyType="done"
              onSubmitEditing={createListAndTransfer}
            />
            <Pressable
              style={[s.button, (!newListName.trim() || creatingList) && s.buttonDisabled]}
              onPress={createListAndTransfer}
              disabled={creatingList || !newListName.trim()}
            >
              {creatingList ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add" size={20} color="#fff" />}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function MenuCard({
  item,
  isTransferred,
  onRemove,
  onViewRecipe,
  onTransfer,
  onRemoveFromList,
  onMoveToDay,
}: {
  item: WeekMenuItemWithRecipe;
  isTransferred: boolean;
  onRemove: () => void;
  onViewRecipe: () => void;
  onTransfer: () => void;
  onRemoveFromList: () => void;
  onMoveToDay: (day: WeekDay | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { medium } = useHaptics();

  function handleLongPress() {
    medium();
    Alert.alert(
      item.recipe.title,
      undefined,
      [
        { text: 'Ta bort från menyn', style: 'destructive', onPress: onRemove },
        { text: 'Avbryt', style: 'cancel' },
      ]
    );
  }

  return (
    <View style={s.card}>
      <Pressable style={s.cardMain} onPress={() => setExpanded(e => !e)} onLongPress={handleLongPress}>
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
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
      </Pressable>

      {expanded && (
        <View style={s.cardExpanded}>
          <View style={s.cardActions}>
            <Pressable style={s.cardAction} onPress={onViewRecipe}>
              <Ionicons name="open-outline" size={15} color="#6b7280" />
              <Text style={s.cardActionText}>Visa recept</Text>
            </Pressable>
            {isTransferred ? (
              <Pressable style={s.cardAction} onPress={onRemoveFromList}>
                <Ionicons name="cart" size={15} color="#ef4444" />
                <Text style={[s.cardActionText, { color: '#ef4444' }]}>Ta bort från lista</Text>
              </Pressable>
            ) : (
              <Pressable style={s.cardAction} onPress={onTransfer}>
                <Ionicons name="cart-outline" size={15} color="#4f46e5" />
                <Text style={[s.cardActionText, { color: '#4f46e5' }]}>Till inköpslistan</Text>
              </Pressable>
            )}
            <Pressable style={s.cardAction} onPress={onRemove}>
              <Ionicons name="trash-outline" size={15} color="#ef4444" />
              <Text style={[s.cardActionText, { color: '#ef4444' }]}>Ta bort</Text>
            </Pressable>
          </View>

          {/* Move to day — always visible for all cards */}
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
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 10 },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  recipesBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  recipesBtnText: { fontSize: 13, fontWeight: '600', color: '#4f46e5' },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  weekNavBtn: { padding: 8 },
  weekLabelBtn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  weekLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  weekLabelCurrent: { color: '#4f46e5' },
  weekLabelHint: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 16, paddingBottom: 80 },
  section: { gap: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8 },
  dayHeader: { gap: 1 },
  dayLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  dayDate: { fontSize: 12, color: '#6b7280' },
  unscheduledEmpty: { fontSize: 13, color: '#9ca3af', paddingVertical: 8 },
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
  cardActions: { flexDirection: 'row', gap: 0, paddingTop: 10 },
  cardAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 },
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
  backBtn: { padding: 4, marginBottom: 16 },
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
  newListRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#f9fafb' },
  button: { backgroundColor: '#4f46e5', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minWidth: 44 },
  buttonDisabled: { opacity: 0.4 },
});
