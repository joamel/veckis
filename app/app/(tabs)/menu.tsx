import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type WeekMenuItemWithRecipe, type RecipeWithIngredients } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { getISOWeek, addWeeks } from '../../src/lib/week';
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

const TODAY_DAY = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1].key;

export default function MenuScreen() {
  const router = useRouter();
  const client = useApiClient();
  const { householdId, householdName } = useHousehold();

  const [weekRef, setWeekRef] = useState(new Date());
  const { weekYear, weekNumber } = getISOWeek(weekRef);

  const [menuItems, setMenuItems] = useState<WeekMenuItemWithRecipe[]>([]);
  const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<WeekDay>(TODAY_DAY);
  const [transferredRecipeIds, setTransferredRecipeIds] = useState<Set<string>>(new Set());

  // Recipe picker modal
  const [pickingForDay, setPickingForDay] = useState<WeekDay | null | 'unscheduled'>(undefined as never);
  const [showPicker, setShowPicker] = useState(false);

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
      // Build set of recipeIds that have items in active lists
      const transferred = new Set(
        activeLists.flatMap(l => l.items.map(i => i.recipeId).filter(Boolean) as string[])
      );
      setTransferredRecipeIds(transferred);
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda menyn');
    } finally {
      setLoading(false);
    }
  }, [householdId, weekYear, weekNumber]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function addRecipeToDay(recipe: RecipeWithIngredients, day: WeekDay | null) {
    if (!householdId) return;
    setShowPicker(false);
    try {
      const item = await client.addToWeekMenu({ householdId, recipeId: recipe.id, day, weekYear, weekNumber });
      setMenuItems(prev => [...prev, item]);
    } catch {
      Alert.alert('Fel', 'Kunde inte lägga till rätt');
    }
  }

  async function removeFromMenu(itemId: string) {
    try {
      await client.deleteWeekMenuItem(itemId);
      setMenuItems(prev => prev.filter(i => i.id !== itemId));
    } catch {
      Alert.alert('Fel', 'Kunde inte ta bort');
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

  const dayItems = menuItems.filter(i => i.day === selectedDay);
  const unscheduled = menuItems.filter(i => i.day === null);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Meny</Text>
          {householdName && <Text style={s.subtitle}>{householdName}</Text>}
        </View>
        <Pressable style={s.recipesBtn} onPress={() => router.push('/recipes' as never)}>
          <Ionicons name="book-outline" size={16} color="#4f46e5" />
          <Text style={s.recipesBtnText}>Recept</Text>
        </Pressable>
      </View>

      {/* Week navigator */}
      <View style={s.weekNav}>
        <Pressable onPress={() => setWeekRef(w => addWeeks(w, -1))} style={s.weekArrow}>
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </Pressable>
        <Text style={s.weekLabel}>Vecka {weekNumber}, {weekYear}</Text>
        <Pressable onPress={() => setWeekRef(w => addWeeks(w, 1))} style={s.weekArrow}>
          <Ionicons name="chevron-forward" size={20} color="#374151" />
        </Pressable>
      </View>

      {/* Day tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayScroll} contentContainerStyle={s.dayScrollContent}>
        {DAYS.map(day => {
          const count = menuItems.filter(i => i.day === day.key).length;
          const isToday = day.key === TODAY_DAY;
          return (
            <Pressable
              key={day.key}
              style={[s.dayTab, selectedDay === day.key && s.dayTabActive]}
              onPress={() => setSelectedDay(day.key)}
            >
              <Text style={[s.dayTabShort, selectedDay === day.key && s.dayTabShortActive]}>{day.short}</Text>
              {count > 0 && (
                <View style={[s.dayBadge, selectedDay === day.key && s.dayBadgeActive]}>
                  <Text style={[s.dayBadgeText, selectedDay === day.key && s.dayBadgeTextActive]}>{count}</Text>
                </View>
              )}
              {isToday && <View style={s.todayDot} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView style={s.content} contentContainerStyle={s.contentInner} onRefresh={load} refreshing={false}>
        {/* Day's recipes */}
        {dayItems.length === 0 ? (
          <View style={s.emptyDay}>
            <Ionicons name="restaurant-outline" size={40} color="#d1d5db" />
            <Text style={s.emptyText}>Inget planerat</Text>
          </View>
        ) : (
          dayItems.map(item => (
            <MenuCard
              key={item.id}
              item={item}
              isTransferred={transferredRecipeIds.has(item.recipeId)}
              onRemove={() => removeFromMenu(item.id)}
              onViewRecipe={() => router.push(`/recipes/${item.recipeId}` as never)}
              onTransfer={() => router.push(`/recipes/${item.recipeId}?transfer=1` as never)}
            />
          ))
        )}

        <Pressable
          style={s.addDayBtn}
          onPress={() => { setPickingForDay(selectedDay); setShowPicker(true); }}
        >
          <Ionicons name="add" size={18} color="#4f46e5" />
          <Text style={s.addDayBtnText}>Lägg till rätt för {DAYS.find(d => d.key === selectedDay)?.label.toLowerCase()}</Text>
        </Pressable>

        {/* Unscheduled */}
        {(unscheduled.length > 0 || true) && (
          <View style={s.unscheduledSection}>
            <View style={s.sectionRow}>
              <Text style={s.sectionLabel}>EJ SCHEMALAGDA</Text>
              <Pressable onPress={() => { setPickingForDay(null); setShowPicker(true); }}>
                <Ionicons name="add-circle-outline" size={20} color="#4f46e5" />
              </Pressable>
            </View>
            {unscheduled.length === 0 ? (
              <Text style={s.unscheduledEmpty}>Lägg till rätter utan dag för att planera senare</Text>
            ) : (
              unscheduled.map(item => (
                <MenuCard
                  key={item.id}
                  item={item}
                  isTransferred={transferredRecipeIds.has(item.recipeId)}
                  onRemove={() => removeFromMenu(item.id)}
                  onViewRecipe={() => router.push(`/recipes/${item.recipeId}` as never)}
                  onTransfer={() => router.push(`/recipes/${item.recipeId}?transfer=1` as never)}
                  onAssignDay={day => moveToDay(item, day)}
                />
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Recipe picker modal */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={s.overlay} onPress={() => setShowPicker(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Välj recept</Text>
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
                <Pressable style={s.pickerItem} onPress={() => addRecipeToDay(item, pickingForDay === 'unscheduled' ? null : pickingForDay as WeekDay | null)}>
                  <Text style={s.pickerItemTitle}>{item.title}</Text>
                  <Text style={s.pickerItemMeta}>{item.servings} port · {item.ingredients.length} ingredienser</Text>
                </Pressable>
              )}
            />
          )}
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
  onAssignDay,
}: {
  item: WeekMenuItemWithRecipe;
  isTransferred: boolean;
  onRemove: () => void;
  onViewRecipe: () => void;
  onTransfer: () => void;
  onAssignDay?: (day: WeekDay) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={s.card}>
      <Pressable style={s.cardMain} onPress={() => setExpanded(e => !e)} onLongPress={onRemove}>
        <View style={s.cardIcon}>
          <Ionicons name="restaurant-outline" size={18} color="#4f46e5" />
        </View>
        <View style={s.cardContent}>
          <Text style={s.cardTitle}>{item.recipe.title}</Text>
          {isTransferred && (
            <View style={s.transferredBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" />
              <Text style={s.transferredText}>I listan</Text>
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
            <Pressable style={s.cardAction} onPress={onTransfer}>
              <Ionicons name="cart-outline" size={15} color="#4f46e5" />
              <Text style={[s.cardActionText, { color: '#4f46e5' }]}>Till inköpslistan</Text>
            </Pressable>
            <Pressable style={s.cardAction} onPress={onRemove}>
              <Ionicons name="trash-outline" size={15} color="#ef4444" />
              <Text style={[s.cardActionText, { color: '#ef4444' }]}>Ta bort</Text>
            </Pressable>
          </View>
          {onAssignDay && (
            <View style={s.assignDayRow}>
              <Text style={s.assignDayLabel}>Flytta till dag:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.assignDayBtns}>
                  {(['mon','tue','wed','thu','fri','sat','sun'] as WeekDay[]).map(d => (
                    <Pressable key={d} style={s.assignDayBtn} onPress={() => onAssignDay(d)}>
                      <Text style={s.assignDayBtnText}>{d.charAt(0).toUpperCase() + d.slice(1)}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    padding: 20, paddingBottom: 12, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  recipesBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef2ff', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  recipesBtnText: { fontSize: 13, fontWeight: '600', color: '#4f46e5' },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  weekArrow: { padding: 4 },
  weekLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
  dayScroll: { maxHeight: 72, backgroundColor: '#fff' },
  dayScrollContent: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexDirection: 'row', alignItems: 'flex-start', paddingTop: 8 },
  dayTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center', gap: 3 },
  dayTabActive: { borderColor: '#4f46e5', backgroundColor: '#4f46e5' },
  dayTabShort: { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  dayTabShortActive: { color: '#fff' },
  dayBadge: { minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dayBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  dayBadgeText: { fontSize: 10, fontWeight: '700', color: '#6b7280' },
  dayBadgeTextActive: { color: '#fff' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#4f46e5', position: 'absolute', bottom: 3 },
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 10, paddingBottom: 40 },
  emptyDay: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 15, color: '#9ca3af' },
  addDayBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#c7d2fe', borderStyle: 'dashed' },
  addDayBtnText: { fontSize: 14, color: '#4f46e5', fontWeight: '500' },
  unscheduledSection: { marginTop: 8, gap: 8 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8 },
  unscheduledEmpty: { fontSize: 13, color: '#9ca3af', paddingVertical: 8 },
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
  assignDayBtnText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '70%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 12 },
  pickerList: { maxHeight: 400 },
  pickerItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  pickerItemTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  pickerItemMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  pickerEmpty: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  pickerEmptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  pickerEmptyBtn: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#4f46e5', borderRadius: 8 },
  pickerEmptyBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
