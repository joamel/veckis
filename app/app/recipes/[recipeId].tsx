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
  TextInput,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type RecipeWithIngredients, type ShoppingListWithItems } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import type { RecipeIngredient } from '@veckis/shared';

export default function RecipeDetailScreen() {
  const { recipeId, transfer } = useLocalSearchParams<{ recipeId: string; transfer?: string }>();
  const router = useRouter();
  const client = useApiClient();
  const { householdId } = useHousehold();

  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);
  const [scaledServings, setScaledServings] = useState<number | null>(null);

  // Ingredient editing
  const [editMode, setEditMode] = useState(false);
  const [editIngredients, setEditIngredients] = useState<Array<{ name: string; quantity: string; unit: string }>>([]);
  const [saving, setSaving] = useState(false);

  // Transfer to shopping
  const [showTransfer, setShowTransfer] = useState(false);
  const [lists, setLists] = useState<ShoppingListWithItems[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [transferring, setTransferring] = useState(false);
  const [deduplicatedIngredients, setDeduplicatedIngredients] = useState<ReturnType<typeof deduplicateIngredients>>([]);

  const load = useCallback(async () => {
    if (!recipeId) return;
    try {
      const r = await client.getRecipe(recipeId);
      setRecipe(r);
      setScaledServings(null);
      if (transfer === '1') openTransfer(r);
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda receptet');
    } finally {
      setLoading(false);
    }
  }, [recipeId, transfer]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const displayServings = scaledServings ?? recipe?.servings ?? 1;
  const scaleRatio = recipe ? displayServings / recipe.servings : 1;

  function adjustServings(delta: number) {
    if (!recipe) return;
    setScaledServings(prev => Math.max(1, (prev ?? recipe.servings) + delta));
  }

  function startEdit() {
    if (!recipe) return;
    setEditIngredients(recipe.ingredients.map(i => ({
      name: i.name,
      quantity: i.quantity != null ? String(i.quantity) : '',
      unit: i.unit ?? '',
    })));
    setEditMode(true);
  }

  function addEditRow() {
    setEditIngredients(prev => [...prev, { name: '', quantity: '', unit: '' }]);
  }

  function updateEditRow(idx: number, field: 'name' | 'quantity' | 'unit', val: string) {
    setEditIngredients(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }

  function removeEditRow(idx: number) {
    setEditIngredients(prev => prev.filter((_, i) => i !== idx));
  }

  async function saveIngredients() {
    if (!recipe) return;
    setSaving(true);
    try {
      const ingredients = editIngredients
        .filter(r => r.name.trim())
        .map(r => ({
          name: r.name.trim(),
          quantity: r.quantity ? parseFloat(r.quantity.replace(',', '.')) || null : null,
          unit: r.unit.trim() || null,
        }));
      const updated = await client.updateRecipe(recipe.id, { ingredients });
      setRecipe(updated);
      setEditMode(false);
    } catch {
      Alert.alert('Fel', 'Kunde inte spara ingredienser');
    } finally {
      setSaving(false);
    }
  }

  async function openTransfer(r?: RecipeWithIngredients) {
    const rec = r ?? recipe;
    if (!rec || !householdId) return;
    setLoadingLists(true);
    setShowTransfer(true);
    const deduped = deduplicateIngredients(rec.ingredients, scaleRatio);
    setDeduplicatedIngredients(deduped);
    setCheckedIds(new Set(deduped.map(i => i.id)));
    try {
      setLists(await client.getShoppingLists(householdId));
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda inköpslistor');
    } finally {
      setLoadingLists(false);
    }
  }

  function toggleIngredient(id: string) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function doTransfer(listId: string) {
    if (!recipe) return;
    const selected = deduplicatedIngredients.filter(i => checkedIds.has(i.id));
    if (selected.length === 0) { Alert.alert('Välj minst en ingrediens'); return; }
    setTransferring(true);
    try {
      await client.transferToShopping(listId, selected.map(i => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        category: i.category,
        recipeId: recipe.id,
      })));
      setShowTransfer(false);
      Alert.alert('Klart!', `${selected.length} ingredienser tillagda i listan`, [
        { text: 'Gå till listan', onPress: () => router.push(`/shopping/${listId}` as never) },
        { text: 'Stanna kvar', style: 'cancel' },
      ]);
    } catch {
      Alert.alert('Fel', 'Kunde inte överföra ingredienser');
    } finally {
      setTransferring(false);
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  if (!recipe) return null;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{recipe.title}</Text>
        <Pressable onPress={() => openTransfer()} style={s.transferBtn}>
          <Ionicons name="cart-outline" size={20} color="#4f46e5" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Meta */}
        <View style={s.metaRow}>
          {/* Serving scaler */}
          <View style={s.servingChip}>
            <Pressable onPress={() => adjustServings(-1)} style={s.servingBtn} hitSlop={8}>
              <Ionicons name="remove" size={14} color="#4f46e5" />
            </Pressable>
            <Ionicons name="people-outline" size={14} color="#6b7280" />
            <Text style={s.metaText}>{displayServings} port.</Text>
            <Pressable onPress={() => adjustServings(1)} style={s.servingBtn} hitSlop={8}>
              <Ionicons name="add" size={14} color="#4f46e5" />
            </Pressable>
          </View>

          {recipe.sourceUrl && (
            <Pressable
              style={s.metaChip}
              onPress={() => WebBrowser.openBrowserAsync(recipe.sourceUrl!)}
            >
              <Ionicons name="open-outline" size={14} color="#4f46e5" />
              <Text style={[s.metaText, { color: '#4f46e5' }]}>Originalrecept</Text>
            </Pressable>
          )}
        </View>

        {recipe.description ? (
          <Text style={s.description}>{recipe.description}</Text>
        ) : null}

        {/* Ingredients */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Ingredienser</Text>
            {!editMode && (
              <Pressable onPress={startEdit} style={s.editBtn}>
                <Ionicons name="pencil-outline" size={16} color="#4f46e5" />
                <Text style={s.editBtnText}>Redigera</Text>
              </Pressable>
            )}
          </View>

          {editMode ? (
            <View style={s.editList}>
              {editIngredients.map((row, idx) => (
                <View key={idx} style={s.editRow}>
                  <TextInput
                    style={[s.editInput, s.editInputQty]}
                    placeholder="Mängd"
                    value={row.quantity}
                    onChangeText={v => updateEditRow(idx, 'quantity', v)}
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    style={[s.editInput, s.editInputUnit]}
                    placeholder="Enhet"
                    value={row.unit}
                    onChangeText={v => updateEditRow(idx, 'unit', v)}
                  />
                  <TextInput
                    style={[s.editInput, s.editInputName]}
                    placeholder="Ingrediens"
                    value={row.name}
                    onChangeText={v => updateEditRow(idx, 'name', v)}
                  />
                  <Pressable onPress={() => removeEditRow(idx)} style={s.editRemove}>
                    <Ionicons name="close-circle" size={20} color="#d1d5db" />
                  </Pressable>
                </View>
              ))}
              <Pressable style={s.addRowBtn} onPress={addEditRow}>
                <Ionicons name="add" size={16} color="#4f46e5" />
                <Text style={s.addRowBtnText}>Lägg till rad</Text>
              </Pressable>
              <View style={s.editActions}>
                <Pressable style={s.cancelBtn} onPress={() => setEditMode(false)}>
                  <Text style={s.cancelBtnText}>Avbryt</Text>
                </Pressable>
                <Pressable style={[s.saveBtn, saving && s.saveBtnDisabled]} onPress={saveIngredients} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Spara</Text>}
                </Pressable>
              </View>
            </View>
          ) : recipe.ingredients.length === 0 ? (
            <Pressable style={s.noIngredients} onPress={startEdit}>
              <Text style={s.noIngredientsText}>Inga ingredienser än — tryck för att lägga till</Text>
            </Pressable>
          ) : (
            recipe.ingredients.map(ing => (
              <View key={ing.id} style={s.ingredientRow}>
                <View style={s.ingredientBullet} />
                <Text style={s.ingredientText}>
                  {formatIngredient(ing, scaleRatio)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Transfer modal */}
      <Modal visible={showTransfer} transparent animationType="slide" onRequestClose={() => setShowTransfer(false)}>
        <Pressable style={s.overlay} onPress={() => setShowTransfer(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Lägg till i inköpslistan</Text>
          <Text style={s.sheetSub}>
            {scaleRatio !== 1 ? `Skalat till ${displayServings} portioner · ` : ''}Välj vad du behöver köpa:
          </Text>

          <ScrollView style={s.ingredientList} showsVerticalScrollIndicator={false}>
            {deduplicatedIngredients.map(ing => {
              const checked = checkedIds.has(ing.id);
              return (
                <Pressable key={ing.id} style={s.checkRow} onPress={() => toggleIngredient(ing.id)}>
                  <Ionicons
                    name={checked ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={checked ? '#4f46e5' : '#d1d5db'}
                  />
                  <Text style={[s.checkLabel, !checked && s.checkLabelUnchecked]}>
                    {formatIngredient(ing, 1)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={s.selectAllRow}>
            <Pressable onPress={() => setCheckedIds(new Set(deduplicatedIngredients.map(i => i.id)))}>
              <Text style={s.selectAllText}>Välj alla</Text>
            </Pressable>
            <Pressable onPress={() => setCheckedIds(new Set())}>
              <Text style={s.selectAllText}>Rensa</Text>
            </Pressable>
          </View>

          <Text style={s.listPickLabel}>Välj lista:</Text>
          {loadingLists ? (
            <ActivityIndicator color="#4f46e5" style={{ marginVertical: 12 }} />
          ) : lists.length === 0 ? (
            <Text style={s.noListsText}>Inga aktiva listor — skapa en från Inköp-fliken</Text>
          ) : (
            <FlatList
              data={lists}
              keyExtractor={l => l.id}
              style={s.listPicker}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <Pressable
                  style={s.listPickerItem}
                  onPress={() => doTransfer(item.id)}
                  disabled={transferring}
                >
                  <Ionicons name="cart-outline" size={18} color="#4f46e5" />
                  <Text style={s.listPickerItemText}>{item.name}</Text>
                  {transferring && <ActivityIndicator size="small" color="#4f46e5" />}
                </Pressable>
              )}
            />
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function deduplicateIngredients(ingredients: RecipeIngredient[], scaleRatio: number) {
  const map = new Map<string, RecipeIngredient & { quantity: number | null }>();
  for (const ing of ingredients) {
    const key = `${ing.name.toLowerCase().trim()}|${(ing.unit ?? '').toLowerCase().trim()}`;
    if (map.has(key)) {
      const ex = map.get(key)!;
      ex.quantity = (ex.quantity ?? 1) + (ing.quantity ?? 1);
    } else {
      map.set(key, { ...ing, quantity: ing.quantity });
    }
  }
  return [...map.values()].map(ing => ({
    ...ing,
    quantity: ing.quantity != null ? roundQty(ing.quantity * scaleRatio) : null,
  }));
}

function roundQty(n: number): number {
  if (n % 1 === 0) return n;
  if (n < 1) return Math.round(n * 4) / 4;
  return Math.round(n * 2) / 2;
}

function formatIngredient(ing: { quantity: number | null; unit: string | null; name: string }, scaleRatio = 1): string {
  const parts: string[] = [];
  if (ing.quantity != null) {
    const scaled = roundQty(ing.quantity * scaleRatio);
    parts.push(String(scaled % 1 === 0 ? scaled : scaled.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')));
  }
  if (ing.unit) parts.push(ing.unit);
  parts.push(ing.name);
  return parts.join(' ');
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111827' },
  transferBtn: { padding: 8, backgroundColor: '#eef2ff', borderRadius: 8 },
  scroll: { padding: 20, gap: 16 },
  metaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  servingChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20 },
  servingBtn: { padding: 2 },
  metaText: { fontSize: 13, color: '#6b7280' },
  description: { fontSize: 14, color: '#374151', lineHeight: 22 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { fontSize: 14, color: '#4f46e5', fontWeight: '500' },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  ingredientBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4f46e5', marginTop: 1 },
  ingredientText: { fontSize: 15, color: '#374151', flex: 1 },
  noIngredients: { paddingVertical: 16, alignItems: 'center' },
  noIngredientsText: { fontSize: 14, color: '#9ca3af' },
  editList: { gap: 8 },
  editRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  editInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, backgroundColor: '#f9fafb' },
  editInputQty: { width: 60 },
  editInputUnit: { width: 60 },
  editInputName: { flex: 1 },
  editRemove: { padding: 2 },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  addRowBtnText: { fontSize: 14, color: '#4f46e5', fontWeight: '500' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#6b7280', fontWeight: '500' },
  saveBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  sheetSub: { fontSize: 13, color: '#6b7280', marginTop: 2, marginBottom: 8 },
  ingredientList: { maxHeight: 220 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  checkLabel: { fontSize: 15, color: '#111827', flex: 1 },
  checkLabelUnchecked: { color: '#9ca3af', textDecorationLine: 'line-through' },
  selectAllRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginVertical: 8 },
  selectAllText: { fontSize: 13, color: '#4f46e5', fontWeight: '500' },
  listPickLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 4, marginBottom: 6 },
  noListsText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 },
  listPicker: {},
  listPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#f9fafb', borderRadius: 10, marginBottom: 6 },
  listPickerItemText: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
});
