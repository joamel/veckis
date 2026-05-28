import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
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
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type RecipeWithIngredients, type ShoppingListWithItems } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import type { RecipeIngredient } from '@veckis/shared';

const UNITS = ['st', 'dl', 'ml', 'l', 'g', 'kg', 'msk', 'tsk', 'krm', 'paket', 'påse', 'burk', 'flaska'];

export default function RecipeDetailScreen() {
  const { recipeId, transfer, edit, forMenuDay } = useLocalSearchParams<{ recipeId: string; transfer?: string; edit?: string; forMenuDay?: string }>();
  const router = useRouter();
  const client = useApiClient();
  const { householdId } = useHousehold();

  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);
  const [scaledServings, setScaledServings] = useState<number | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editInstr, setEditInstr] = useState('');
  const [editImage, setEditImage] = useState('');

  // Ingredient editing
  const [editMode, setEditMode] = useState(false);
  const [editIngredients, setEditIngredients] = useState<Array<{ name: string; quantity: string; unit: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [activeUnitIdx, setActiveUnitIdx] = useState<number | null>(null);
  const [activeNameIdx, setActiveNameIdx] = useState<number | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<{ name: string; category: string }[]>([]);
  type RowRef = { qty: TextInput | null; unit: TextInput | null; name: TextInput | null };
  const rowRefs = useRef<RowRef[]>([]);
  const mainScrollRef = useRef<ScrollView>(null);
  const scrollOffsetY = useRef(0);

  const keyboardH = useRef(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => { keyboardH.current = e.endCoordinates.height; });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardH.current = 0; });
    return () => { show.remove(); hide.remove(); };
  }, []);

  // When the unit field is focused, the unit-chip row appears below it. Only
  // scroll if that row would be hidden under the keyboard — and just enough to
  // reveal it, so it doesn't accumulate / push the input off the top.
  useEffect(() => {
    if (activeUnitIdx === null) return;
    const input = rowRefs.current[activeUnitIdx]?.unit;
    if (!input) return;
    const t = setTimeout(() => {
      input.measureInWindow((_x, y, _w, h) => {
        const screenH = Dimensions.get('window').height;
        const kbTop = screenH - (keyboardH.current || 340);
        const chipRowH = 64; // unit-chip suggestion row + gap below the field
        const margin = 24;   // breathing room above the keyboard
        const hidden = (y + h + chipRowH + margin) - kbTop;
        if (hidden > 0) {
          mainScrollRef.current?.scrollTo({ y: scrollOffsetY.current + hidden, animated: true });
        }
      });
    }, 200);
    return () => clearTimeout(t);
  }, [activeUnitIdx]);

  function getRowRef(idx: number): RowRef {
    if (!rowRefs.current[idx]) rowRefs.current[idx] = { qty: null, unit: null, name: null };
    return rowRefs.current[idx];
  }

  // Transfer to shopping
  const [showTransfer, setShowTransfer] = useState(false);
  const [lists, setLists] = useState<ShoppingListWithItems[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [transferring, setTransferring] = useState(false);
  const [transferringListId, setTransferringListId] = useState<string | null>(null);
  const [deduplicatedIngredients, setDeduplicatedIngredients] = useState<ReturnType<typeof deduplicateIngredients>>([]);

  // Load ingredient suggestions once for autocomplete in edit mode
  useEffect(() => {
    if (!householdId) return;
    client.getIngredientSuggestions(householdId).catch(() => [] as { name: string; category: string }[])
      .then(s => setNameSuggestions(Array.isArray(s) ? s : []));
  }, [householdId]);

  const load = useCallback(async () => {
    if (!recipeId) return;
    try {
      const r = await client.getRecipe(recipeId);
      setRecipe(r);
      setScaledServings(null);
      if (transfer === '1') openTransfer(r);
      if (edit === '1' && r.ingredients.length === 0) {
        setEditTitle(r.title);
        setEditDesc(r.description ?? '');
        setEditInstr(r.instructions ?? '');
        setEditImage(r.imageUrl ?? '');
        setEditIngredients([{ name: '', quantity: '', unit: '' }]);
        setEditMode(true);
        router.setParams({ edit: undefined });
        setTimeout(() => getRowRef(0).name?.focus(), 250);
      }
    } catch {
      Alert.alert('Fel', 'Kunde inte ladda receptet');
    } finally {
      setLoading(false);
    }
  }, [recipeId, transfer, edit]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const displayServings = scaledServings ?? recipe?.servings ?? 1;
  const scaleRatio = recipe ? displayServings / recipe.servings : 1;

  function adjustServings(delta: number) {
    if (!recipe) return;
    setScaledServings(prev => Math.max(1, (prev ?? recipe.servings) + delta));
  }

  function confirmDeleteRecipe() {
    if (!recipe) return;
    setShowMenu(false);
    Alert.alert('Ta bort recept', `Ta bort "${recipe.title}"? Detta går inte att ångra.`, [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Ta bort', style: 'destructive', onPress: async () => {
        try {
          await client.deleteRecipe(recipe.id);
          router.back();
        } catch {
          Alert.alert('Fel', 'Kunde inte ta bort receptet');
        }
      } },
    ]);
  }

  // Edit everything (name, image, description, ingredients, instructions) inline
  // in the detail view.
  function startEdit() {
    if (!recipe) return;
    rowRefs.current = [];
    setActiveUnitIdx(null);
    setEditTitle(recipe.title);
    setEditDesc(recipe.description ?? '');
    setEditInstr(recipe.instructions ?? '');
    setEditImage(recipe.imageUrl ?? '');
    setEditIngredients(recipe.ingredients.map(i => ({
      name: i.name,
      quantity: i.quantity != null ? String(i.quantity) : '',
      unit: i.unit ?? '',
    })));
    setShowMenu(false);
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

  async function saveRecipe() {
    if (!recipe) return;
    const t = editTitle.trim();
    if (!t) { Alert.alert('Namn saknas', 'Receptet behöver ett namn.'); return; }
    const img = editImage.trim();
    if (img && !/^https?:\/\//i.test(img)) { Alert.alert('Ogiltig bild-URL', 'Bild-URL:en måste börja med http:// eller https://'); return; }
    setSaving(true);
    try {
      const ingredients = editIngredients
        .filter(r => r.name.trim())
        .map(r => ({
          name: r.name.trim(),
          quantity: r.quantity ? parseFloat(r.quantity.replace(',', '.')) || null : null,
          unit: r.unit.trim() || null,
        }));
      const updated = await client.updateRecipe(recipe.id, {
        title: t,
        description: editDesc.trim() || null,
        instructions: editInstr.trim() || null,
        imageUrl: img || null,
        ingredients,
      });
      setRecipe(updated);
      setEditMode(false);
      if (forMenuDay !== undefined) {
        router.replace(`/(tabs)/menu?addRecipeId=${recipe.id}&day=${forMenuDay}` as never);
      }
    } catch {
      Alert.alert('Fel', 'Kunde inte spara receptet');
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
    setTransferringListId(listId);
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
      setTransferringListId(null);
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
        {editMode ? (
          <TextInput
            style={[s.headerTitle, s.headerTitleInput]}
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder="Receptnamn"
            placeholderTextColor="#9ca3af"
          />
        ) : (
          <Text style={s.headerTitle} numberOfLines={1}>{recipe.title}</Text>
        )}
        <Pressable onPress={() => setShowMenu(true)} style={s.transferBtn} accessibilityLabel="Mer">
          <Ionicons name="ellipsis-vertical" size={20} color="#111827" />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView
        ref={mainScrollRef}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="always"
        scrollEventThrottle={16}
        onScroll={e => { scrollOffsetY.current = e.nativeEvent.contentOffset.y; }}
      >
        {editMode ? (
          <View style={{ gap: 8 }}>
            <Text style={s.editLabel}>Bild-URL</Text>
            <TextInput
              style={s.renameInput}
              value={editImage}
              onChangeText={setEditImage}
              placeholder="https://… (valfritt)"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {editImage.trim() ? (
              <Image source={{ uri: editImage.trim() }} style={s.heroImage} resizeMode="cover" />
            ) : null}
          </View>
        ) : recipe.imageUrl ? (
          <Image source={{ uri: recipe.imageUrl }} style={s.heroImage} resizeMode="cover" />
        ) : null}

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
              <Text style={[s.metaText, { color: '#4f46e5' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>↗ Originalrecept</Text>
            </Pressable>
          )}
        </View>

        {editMode ? (
          <View>
            <Text style={s.editLabel}>Beskrivning</Text>
            <TextInput
              style={[s.renameInput, s.editMultiline]}
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder="Beskrivning (valfritt)"
              placeholderTextColor="#9ca3af"
              multiline
            />
          </View>
        ) : recipe.description ? (
          <Text style={s.description}>{recipe.description}</Text>
        ) : null}

        {/* Ingredients */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Ingredienser</Text>
          </View>

          {editMode ? (
            <View style={s.editList} {...({ importantForAutofill: 'noExcludeDescendants' } as object)}>
              {editIngredients.map((row, idx) => (
                <View key={idx}>
                  <View style={s.editRow}>
                    <TextInput
                      ref={el => { getRowRef(idx).name = el; }}
                      style={[s.editInput, s.editInputName]}
                      placeholder="Ingrediens"
                      placeholderTextColor="#9ca3af"
                      value={row.name}
                      onChangeText={v => updateEditRow(idx, 'name', v)}
                      autoCapitalize="none"
                      autoComplete="off"
                      autoCorrect={false}
                      spellCheck={false}
                      textContentType="none"
                      importantForAutofill="no"
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onFocus={() => setActiveNameIdx(idx)}
                      onBlur={() => setTimeout(() => setActiveNameIdx(a => a === idx ? null : a), 120)}
                      onSubmitEditing={() => getRowRef(idx).qty?.focus()}
                    />
                    <TextInput
                      ref={el => { getRowRef(idx).qty = el; }}
                      style={[s.editInput, s.editInputQty]}
                      placeholder="Mängd"
                      placeholderTextColor="#9ca3af"
                      value={row.quantity}
                      onChangeText={v => updateEditRow(idx, 'quantity', v)}
                      keyboardType="decimal-pad"
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => getRowRef(idx).unit?.focus()}
                    />
                    <TextInput
                      ref={el => { getRowRef(idx).unit = el; }}
                      style={[s.editInput, s.editInputUnit]}
                      placeholder="Enhet"
                      placeholderTextColor="#9ca3af"
                      value={row.unit}
                      onChangeText={v => updateEditRow(idx, 'unit', v.toLowerCase())}
                      autoCapitalize="none"
                      autoComplete="off"
                      autoCorrect={false}
                      spellCheck={false}
                      textContentType="none"
                      importantForAutofill="no"
                      returnKeyType={idx < editIngredients.length - 1 ? 'next' : 'done'}
                      blurOnSubmit={false}
                      onFocus={() => setActiveUnitIdx(idx)}
                      onPressIn={() => setActiveUnitIdx(idx)}
                      onBlur={() => setTimeout(() => setActiveUnitIdx(a => a === idx ? null : a), 120)}
                      onSubmitEditing={() => {
                        setActiveUnitIdx(null);
                        if (idx < editIngredients.length - 1) getRowRef(idx + 1).name?.focus();
                      }}
                    />
                    <Pressable onPress={() => removeEditRow(idx)} style={s.editRemove}>
                      <Ionicons name="close-circle" size={20} color="#d1d5db" />
                    </Pressable>
                  </View>
                  {activeUnitIdx === idx && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.unitChipScroll} keyboardShouldPersistTaps="always">
                      <View style={s.unitChipRow}>
                        {UNITS.map(u => {
                          const active = row.unit === u;
                          return (
                            <Pressable
                              key={u}
                              style={[s.unitChip, active && s.unitChipActive]}
                              onPress={() => {
                                updateEditRow(idx, 'unit', active ? '' : u);
                                if (!active) {
                                  setActiveUnitIdx(null);
                                  // Move focus to the next row's name input (or stay if last)
                                  if (idx < editIngredients.length - 1) {
                                    setTimeout(() => getRowRef(idx + 1).name?.focus(), 50);
                                  }
                                }
                              }}
                            >
                              <Text style={[s.unitChipText, active && s.unitChipTextActive]}>{u}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  )}
                  {activeNameIdx === idx && row.name.trim().length >= 1 && (() => {
                    const q = row.name.toLowerCase().trim();
                    const hits = nameSuggestions
                      .filter(sg => sg.name.toLowerCase().includes(q) && sg.name.toLowerCase() !== q)
                      .slice(0, 6);
                    if (hits.length === 0) return null;
                    return (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.unitChipScroll} keyboardShouldPersistTaps="always">
                        <View style={s.unitChipRow}>
                          {hits.map(h => (
                            <Pressable
                              key={h.name}
                              style={s.unitChip}
                              onPress={() => {
                                updateEditRow(idx, 'name', h.name.toLowerCase());
                                setActiveNameIdx(null);
                                setTimeout(() => getRowRef(idx).qty?.focus(), 50);
                              }}
                            >
                              <Text style={s.unitChipText}>{h.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </ScrollView>
                    );
                  })()}
                </View>
              ))}
              <Pressable style={s.addRowBtn} onPress={addEditRow}>
                <Ionicons name="add" size={16} color="#4f46e5" />
                <Text style={s.addRowBtnText}>Lägg till rad</Text>
              </Pressable>
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

        {editMode ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Instruktioner</Text>
            </View>
            <TextInput
              style={[s.renameInput, s.editMultilineTall]}
              value={editInstr}
              onChangeText={setEditInstr}
              placeholder="Steg för steg (valfritt)"
              placeholderTextColor="#9ca3af"
              multiline
            />
          </View>
        ) : recipe.instructions ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Instruktioner</Text>
            </View>
            <Text style={s.instructionsText}>{recipe.instructions}</Text>
          </View>
        ) : null}

        {editMode && (
          <View style={s.editActions}>
            <Pressable style={s.cancelBtn} onPress={() => setEditMode(false)}>
              <Text style={s.cancelBtnText}>Avbryt</Text>
            </Pressable>
            <Pressable style={[s.saveBtn, saving && s.saveBtnDisabled]} onPress={saveRecipe} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Spara</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

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
              renderItem={({ item }) => {
                const noneSelected = checkedIds.size === 0;
                return (
                  <Pressable
                    style={[s.listPickerItem, noneSelected && { opacity: 0.4 }]}
                    onPress={() => doTransfer(item.id)}
                    disabled={transferring || noneSelected}
                  >
                    <Ionicons name="cart-outline" size={18} color="#4f46e5" />
                    <Text style={s.listPickerItemText}>{item.name}</Text>
                    {transferringListId === item.id && <ActivityIndicator size="small" color="#4f46e5" />}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>

      {/* Kundvagn-FAB — överför ingredienser till inköpslista (likt andra flikar) */}
      {!editMode && (
        <Pressable style={s.fab} onPress={() => openTransfer()} accessibilityLabel="Lägg ingredienser i inköpslista">
          <Ionicons name="cart-outline" size={26} color="#fff" />
        </Pressable>
      )}

      {/* 3-prickar-meny */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <Pressable style={s.menuOverlay} onPress={() => setShowMenu(false)}>
          <View style={s.menuSheet}>
            <Pressable style={s.menuItem} onPress={() => { setShowMenu(false); startEdit(); }}>
              <Ionicons name="create-outline" size={18} color="#111827" />
              <Text style={s.menuItemText}>Redigera recept</Text>
            </Pressable>
            <Pressable style={s.menuItem} onPress={confirmDeleteRecipe}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
              <Text style={[s.menuItemText, { color: '#ef4444' }]}>Ta bort recept</Text>
            </Pressable>
          </View>
        </Pressable>
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
  headerTitleInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f9fafb' },
  transferBtn: { padding: 8, backgroundColor: '#eef2ff', borderRadius: 8 },
  scroll: { padding: 20, gap: 16 },
  heroImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#f3f4f6' },
  editImagePreview: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: '#f3f4f6', marginTop: 8 },
  metaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metaChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', flexShrink: 0 },
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
  unitChipScroll: { marginBottom: 4 },
  unitChipRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  unitChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  unitChipActive: { backgroundColor: '#eef2ff', borderColor: '#4f46e5' },
  unitChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  unitChipTextActive: { color: '#4f46e5', fontWeight: '600' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#6b7280', fontWeight: '500' },
  saveBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  menuSheet: { position: 'absolute', top: 56, right: 12, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 6, minWidth: 200, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  menuItemText: { fontSize: 15, color: '#111827', fontWeight: '500' },
  renameTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  renameInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#f9fafb', color: '#111827' },
  editLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 6, marginTop: 14 },
  editMultiline: { minHeight: 70, textAlignVertical: 'top' },
  editMultilineTall: { minHeight: 140, textAlignVertical: 'top' },
  instructionsText: { fontSize: 15, color: '#374151', lineHeight: 22 },
  renameSave: { marginTop: 16, backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  renameSaveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
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
