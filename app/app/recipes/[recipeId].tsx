import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { kavBehavior } from '../../src/lib/platform';
import { getISOWeek, addWeeks, getISOWeekMonday } from '../../src/lib/week';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type RecipeWithIngredients, type ShoppingListWithItems } from '../../src/api/client';
import { normalizeQtyInput } from '../../src/lib/qty';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useSpotlightTip, useTipsReady } from '../../src/context/SpotlightTipContext';
import { useOnceFlag } from '../../src/hooks/useOnceFlag';
import type { RecipeIngredient, WeekDay } from '@veckis/shared';

const UNITS = ['st', 'dl', 'ml', 'l', 'g', 'kg', 'msk', 'tsk', 'krm', 'paket', 'påse', 'burk', 'flaska'];

export function RecipeDetail({ recipeId, transfer, edit: editParam, forMenuDay, forMenuWeek, from, onClose }: { recipeId: string; transfer?: string; edit?: string; forMenuDay?: string; forMenuWeek?: string; from?: string; onClose?: () => void }) {
  const edit = editParam;
  const router = useRouter();
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { showError } = useToast();
  const confirm = useConfirm();
  const showTip = useSpotlightTip();
  const tipsReady = useTipsReady();
  const recipeCartTip = useOnceFlag('seen-recipe-cart-tip');
  const recipeCartTipShownRef = useRef(false);
  const recipeCartRef = useRef<View>(null);

  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);
  const [scaledServings, setScaledServings] = useState<number | null>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editInstr, setEditInstr] = useState('');
  const [editImage, setEditImage] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Cooking mode
  const [cookMode, setCookMode] = useState(false);
  const [cookStep, setCookStep] = useState(0);
  const [heroLoading, setHeroLoading] = useState(false);
  const [heroError, setHeroError] = useState(false);

  // Ingredient editing
  const [editMode, setEditMode] = useState(false);
  const [editIngredients, setEditIngredients] = useState<Array<{ name: string; quantity: string; unit: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [activeUnitIdx, setActiveUnitIdx] = useState<number | null>(null);
  const [activeNameIdx, setActiveNameIdx] = useState<number | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<{ name: string; category: string }[]>([]);
  const [unitByName, setUnitByName] = useState<Record<string, string>>({});
  const [defaultUnit, setDefaultUnit] = useState('');
  type RowRef = { qty: TextInput | null; unit: TextInput | null; name: TextInput | null };
  const rowRefs = useRef<RowRef[]>([]);
  const mainScrollRef = useRef<ScrollView>(null);
  const scrollOffsetY = useRef(0);

  // Cooking mode ingredient auto-scroll
  const cookIngredScrollRef = useRef<ScrollView>(null);
  const cookIngredContentH = useRef(0);
  const cookIngredAnim = useRef(new Animated.Value(0)).current;
  const cookModeRef = useRef(false);
  const cookIngredStarted = useRef(false);

  useEffect(() => {
    cookModeRef.current = cookMode;
    if (!cookMode) {
      cookIngredAnim.stopAnimation();
      cookIngredAnim.setValue(0);
      cookIngredStarted.current = false;
    }
  }, [cookMode]);

  const startCookIngredAnim = useCallback(() => {
    if (!cookModeRef.current || cookIngredStarted.current) return;
    const maxScroll = Math.max(0, cookIngredContentH.current - 130);
    if (maxScroll <= 0) return;
    cookIngredStarted.current = true;
    const listenerId = cookIngredAnim.addListener(({ value }) => {
      cookIngredScrollRef.current?.scrollTo({ y: value, animated: false });
    });
    Animated.timing(cookIngredAnim, {
      toValue: maxScroll,
      duration: (maxScroll / 18) * 1000,
      useNativeDriver: false,
      easing: (x) => x,
    }).start(() => cookIngredAnim.removeListener(listenerId));
  }, []);

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

  // Plan in menu modal
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planWeekStr, setPlanWeekStr] = useState('');
  const [planDay, setPlanDay] = useState<WeekDay | null>(null);

  // Recipe-cart-tip: visa när receptet är laddat och har ingredienser så
  // kundvagn-FAB:en faktiskt syns och är meningsfull att förklara.
  useEffect(() => {
    if (!tipsReady) return;
    if (recipeCartTip.seen !== false || recipeCartTipShownRef.current) return;
    if (!recipe || recipe.ingredients.length === 0) return;
    const shown = showTip({
      title: 'Lägg ingredienser i inköpslistan',
      message: '"Lägg i lista"-knappen bredvid Ingredienser låter dig välja vad du vill ha och skicka det direkt till en inköpslista.',
      targetRef: recipeCartRef,
    });
    if (shown) { recipeCartTipShownRef.current = true; recipeCartTip.markSeen(); }
  }, [tipsReady, recipe, recipeCartTip.seen, recipeCartTip.markSeen, showTip]);

  // Load ingredient suggestions once for autocomplete in edit mode
  useEffect(() => {
    if (!householdId) return;
    client.getIngredientSuggestions(householdId).catch(() => [] as { name: string; category: string }[])
      .then(s => setNameSuggestions(Array.isArray(s) ? s : []));
    // Staples give us each ingredient's usual unit + the household's most-used unit,
    // used to pre-fill / hint the unit field.
    client.getStaples(householdId).then(staples => {
      const byName: Record<string, string> = {};
      const tally: Record<string, number> = {};
      for (const st of staples) {
        if (st.unit) {
          byName[st.name.toLowerCase()] = st.unit;
          tally[st.unit] = (tally[st.unit] ?? 0) + Math.max(1, st.usageCount);
        }
      }
      setUnitByName(byName);
      const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      setDefaultUnit(best ? best[0] : '');
    }).catch(() => {});
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
        if (!onClose) router.setParams({ edit: undefined });
        setTimeout(() => getRowRef(0).name?.focus(), 250);
      }
    } catch {
      confirm({ title: 'Fel', message: 'Kunde inte ladda receptet', buttons: [{ label: 'OK' }] });
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

  function openPlanModal() {
    const todayWeek = getISOWeek(new Date());
    const defaultWeek = forMenuWeek ?? `${todayWeek.weekYear}-${String(todayWeek.weekNumber).padStart(2, '0')}`;
    setPlanWeekStr(defaultWeek);
    setPlanDay(null);
    setShowPlanModal(true);
  }

  function openRecipeActions() {
    if (!recipe) return;
    confirm({
      title: recipe.title,
      variant: 'menu',
      buttons: [
        { label: 'Planera i meny', onPress: openPlanModal },
        { label: 'Redigera recept', onPress: startEdit },
        { label: 'Ta bort recept', style: 'destructive', onPress: confirmDeleteRecipe },
        { label: 'Avbryt', style: 'cancel' },
      ],
    });
  }

  function confirmDeleteRecipe() {
    if (!recipe) return;
    confirm({
      title: 'Ta bort recept',
      message: `Ta bort "${recipe.title}"? Detta går inte att ångra.`,
      buttons: [
      { label: 'Ta bort', style: 'destructive', onPress: async () => {
        try {
          await client.deleteRecipe(recipe.id);
          if (onClose) onClose(); else router.back();
        } catch {
          confirm({ title: 'Fel', message: 'Kunde inte ta bort receptet', buttons: [{ label: 'OK' }] });
        }
      } },
      { label: 'Avbryt', style: 'cancel' },
      ],
    });
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
      quantity: i.quantity != null ? String(i.quantity).replace('.', ',') : '',
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

  async function saveRecipe() {
    if (!recipe) return;
    const t = editTitle.trim();
    if (!t) { confirm({ title: 'Namn saknas', message: 'Receptet behöver ett namn.', buttons: [{ label: 'OK' }] }); return; }
    const img = editImage.trim();
    if (img && !/^https?:\/\//i.test(img)) { confirm({ title: 'Ogiltig bild-URL', message: 'Bild-URL:en måste börja med http:// eller https://', buttons: [{ label: 'OK' }] }); return; }
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
        const weekSuffix = forMenuWeek ? `&forMenuWeek=${forMenuWeek}` : '';
        router.replace(`/(tabs)/menu?addRecipeId=${recipe.id}&day=${forMenuDay}${weekSuffix}` as never);
      }
    } catch {
      confirm({ title: 'Fel', message: 'Kunde inte spara receptet', buttons: [{ label: 'OK' }] });
    } finally {
      setSaving(false);
    }
  }

  // Pick a photo (camera or library), resize+compress locally to keep upload
  // small, then send to backend → Cloudinary → recipe.imageUrl is updated.
  async function pickAndUploadImage(source: 'library' | 'camera') {
    if (!recipe) return;
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showError(new Error('permission_denied'), `Veckis behöver tillgång till ${source === 'camera' ? 'kameran' : 'bilder'}`);
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });
      if (result.canceled || !result.assets[0]) return;
      setUploadingImage(true);
      const compressed = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );
      const updated = await client.uploadRecipeImage(recipe.id, compressed.uri);
      setRecipe(updated);
      setEditImage(updated.imageUrl ?? '');
    } catch (e) {
      showError(e, 'Kunde inte ladda upp bilden');
    } finally {
      setUploadingImage(false);
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
      confirm({ title: 'Fel', message: 'Kunde inte ladda inköpslistor', buttons: [{ label: 'OK' }] });
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
    if (selected.length === 0) { confirm({ title: 'Välj minst en ingrediens', buttons: [{ label: 'OK' }] }); return; }
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
      confirm({
        title: 'Klart!',
        message: `${selected.length} ingredienser tillagda i listan`,
        buttons: [
          { label: 'Gå till listan', onPress: () => router.push(`/shopping/${listId}` as never) },
          { label: 'Stanna kvar', style: 'cancel' },
        ],
      });
    } catch {
      confirm({ title: 'Fel', message: 'Kunde inte överföra ingredienser', buttons: [{ label: 'OK' }] });
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
        <Pressable onPress={() => { if (onClose) onClose(); else router.back(); }} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Tillbaka">
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
        <Pressable onPress={openRecipeActions} style={s.transferBtn} accessibilityLabel="Mer">
          <Ionicons name="ellipsis-vertical" size={20} color="#111827" />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={kavBehavior} style={{ flex: 1 }}>
      <ScrollView
        ref={mainScrollRef}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="always"
        scrollEventThrottle={16}
        onScroll={e => { scrollOffsetY.current = e.nativeEvent.contentOffset.y; }}
      >
        {editMode ? (
          <View style={{ gap: 8 }}>
            <Text style={s.editLabel}>Bild</Text>
            {editImage.trim() ? (
              <Image source={{ uri: editImage.trim() }} style={s.heroImage} resizeMode="cover" />
            ) : (
              <View style={[s.heroImage, s.heroPlaceholder]}>
                <Ionicons name="image-outline" size={32} color="#9ca3af" />
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                style={[s.imgBtn, { flex: 1 }, uploadingImage && s.imgBtnDisabled]}
                onPress={() => pickAndUploadImage('library')}
                disabled={uploadingImage}
              >
                <Ionicons name="images-outline" size={18} color="#4f46e5" />
                <Text style={s.imgBtnText}>Galleri</Text>
              </Pressable>
              <Pressable
                style={[s.imgBtn, { flex: 1 }, uploadingImage && s.imgBtnDisabled]}
                onPress={() => pickAndUploadImage('camera')}
                disabled={uploadingImage}
              >
                <Ionicons name="camera-outline" size={18} color="#4f46e5" />
                <Text style={s.imgBtnText}>Kamera</Text>
              </Pressable>
              {editImage.trim() ? (
                <Pressable
                  style={[s.imgRemoveBtn, uploadingImage && s.imgBtnDisabled]}
                  onPress={() => setEditImage('')}
                  disabled={uploadingImage}
                  accessibilityLabel="Ta bort bild"
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </Pressable>
              ) : null}
            </View>
            {uploadingImage ? <ActivityIndicator color="#4f46e5" /> : null}
          </View>
        ) : recipe.imageUrl ? (
          <View style={s.heroImage}>
            <Image
              source={{ uri: cloudinaryOptimized(recipe.imageUrl) }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onLoadStart={() => { setHeroLoading(true); setHeroError(false); }}
              onLoadEnd={() => setHeroLoading(false)}
              onError={() => { setHeroError(true); setHeroLoading(false); }}
            />
            {heroLoading && !heroError ? (
              <View style={s.heroImageOverlay}>
                <ActivityIndicator color="#4f46e5" />
              </View>
            ) : null}
            {heroError ? (
              <View style={[s.heroImageOverlay, s.heroPlaceholder]}>
                <Ionicons name="image-outline" size={32} color="#9ca3af" />
                <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>Kunde inte ladda bilden</Text>
              </View>
            ) : null}
          </View>
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
            {!editMode && recipe.ingredients.length > 0 && (
              <Pressable ref={recipeCartRef} style={s.cookBtn} onPress={() => openTransfer()} accessibilityLabel="Lägg i inköpslista">
                <Ionicons name="cart-outline" size={14} color="#4f46e5" />
                <Text style={s.cookBtnText}>Lägg i lista</Text>
              </Pressable>
            )}
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
                      onChangeText={v => updateEditRow(idx, 'quantity', normalizeQtyInput(v))}
                      keyboardType="decimal-pad"
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => getRowRef(idx).unit?.focus()}
                    />
                    <TextInput
                      ref={el => { getRowRef(idx).unit = el; }}
                      style={[s.editInput, s.editInputUnit]}
                      placeholder={defaultUnit || 'Enhet'}
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
                    <Pressable onPress={() => removeEditRow(idx)} style={s.editRemove} accessibilityRole="button" accessibilityLabel="Ta bort ingrediens">
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
                      .filter(sg => sg.name.toLowerCase().includes(q))
                      .sort((a, b) => {
                        // Exact match first (so it stays tappable for unit auto-fill),
                        // then the shortest names.
                        const ax = a.name.toLowerCase() === q ? 0 : 1;
                        const bx = b.name.toLowerCase() === q ? 0 : 1;
                        return ax - bx || a.name.length - b.name.length;
                      })
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
                                // Auto-fill the usual unit for this ingredient if the field is empty.
                                const u = unitByName[h.name.toLowerCase()];
                                if (u && !row.unit.trim()) updateEditRow(idx, 'unit', u);
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
        <View pointerEvents="none" style={s.overlayDim} />
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

      {/* Plan in menu modal */}
      <Modal visible={showPlanModal} transparent animationType="slide" onRequestClose={() => setShowPlanModal(false)}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => setShowPlanModal(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Planera i meny</Text>
          <Text style={s.sheetSub}>Välj vecka och dag</Text>

          <Text style={s.planSectionLabel}>Vecka</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
              {(() => {
                const todayWeek = getISOWeek(new Date());
                const thisMonday = getISOWeekMonday(todayWeek.weekYear, todayWeek.weekNumber);
                return Array.from({ length: 5 }, (_, i) => {
                  const mon = addWeeks(thisMonday, i);
                  const { weekYear, weekNumber } = getISOWeek(mon);
                  const str = `${weekYear}-${String(weekNumber).padStart(2, '0')}`;
                  const active = planWeekStr === str;
                  const label = i === 0 ? `v.${weekNumber} · nu` : `v.${weekNumber}`;
                  const sub = `${mon.getDate()}/${mon.getMonth() + 1}`;
                  return (
                    <Pressable key={str} style={[s.planChip, active && s.planChipActive]} onPress={() => setPlanWeekStr(str)}>
                      <Text style={[s.planChipText, active && s.planChipTextActive]}>{label}</Text>
                      <Text style={[s.planChipSub, active && s.planChipSubActive]}>{sub}</Text>
                    </Pressable>
                  );
                });
              })()}
            </View>
          </ScrollView>

          <Text style={s.planSectionLabel}>Dag</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
              {([
                { label: 'Ingen', value: null },
                { label: 'Mån', value: 'mon' },
                { label: 'Tis', value: 'tue' },
                { label: 'Ons', value: 'wed' },
                { label: 'Tor', value: 'thu' },
                { label: 'Fre', value: 'fri' },
                { label: 'Lör', value: 'sat' },
                { label: 'Sön', value: 'sun' },
              ] as { label: string; value: WeekDay | null }[]).map(d => {
                const active = planDay === d.value;
                return (
                  <Pressable key={d.label} style={[s.planChip, active && s.planChipActive]} onPress={() => setPlanDay(d.value)}>
                    <Text style={[s.planChipText, active && s.planChipTextActive]}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <Pressable
            style={s.saveBtn}
            onPress={() => {
              setShowPlanModal(false);
              router.replace(`/(tabs)/menu?addRecipeId=${recipe!.id}&day=${planDay ?? ''}&forMenuWeek=${planWeekStr}` as never);
            }}
          >
            <Text style={s.saveBtnText}>Lägg till i meny</Text>
          </Pressable>
        </View>
      </Modal>

      {/* FAB — Laga nu från kalender, kundkorg från menyn */}
      {!editMode && (
        from === 'calendar'
          ? recipe?.instructions && (
              <Pressable style={s.fab} onPress={() => { setCookStep(0); setCookMode(true); }} accessibilityLabel="Laga nu">
                <Ionicons name="restaurant-outline" size={26} color="#fff" />
              </Pressable>
            )
          : recipe?.ingredients && recipe.ingredients.length > 0 && (
              <Pressable style={s.fab} onPress={() => openTransfer()} accessibilityLabel="Lägg i inköpslista">
                <Ionicons name="cart-outline" size={26} color="#fff" />
              </Pressable>
            )
      )}

      {/* Cooking mode */}
      {recipe.instructions ? (() => {
        const steps = parseSteps(recipe.instructions!);
        const step = steps[cookStep] ?? '';
        return (
          <Modal visible={cookMode} transparent={false} animationType="slide" onRequestClose={() => setCookMode(false)}>
            <SafeAreaView style={s.cookContainer}>
              <View style={s.cookHeader}>
                <Text style={s.cookRecipeTitle} numberOfLines={1}>{recipe.title}</Text>
                <Pressable onPress={() => setCookMode(false)} style={s.cookClose} accessibilityLabel="Avsluta">
                  <Ionicons name="close" size={24} color="#9ca3af" />
                </Pressable>
              </View>
              <View style={s.cookProgress}>
                {steps.map((_, i) => (
                  <View key={i} style={[s.cookDot, i === cookStep && s.cookDotActive]} />
                ))}
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={s.cookBody} showsVerticalScrollIndicator={false}>
                {recipe.ingredients.length > 0 && (
                  <ScrollView
                    ref={cookIngredScrollRef}
                    style={s.cookIngredWrap}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                    fadingEdgeLength={20}
                    scrollEventThrottle={16}
                    onContentSizeChange={(_, h) => {
                      cookIngredContentH.current = h;
                      startCookIngredAnim();
                    }}
                    onTouchStart={() => cookIngredAnim.stopAnimation()}
                    onScrollBeginDrag={() => cookIngredAnim.stopAnimation()}
                  >
                    {recipe.ingredients.map(ing => (
                      <Text key={ing.id} style={s.cookIngredItem}>
                        {formatIngredient(ing, 1)}
                      </Text>
                    ))}
                  </ScrollView>
                )}
                <Text style={s.cookStepLabel}>Steg {cookStep + 1} av {steps.length}</Text>
                <Text style={s.cookStepText}>{step}</Text>
              </ScrollView>
              <View style={s.cookNav}>
                <Pressable
                  style={[s.cookNavBtn, cookStep === 0 && s.cookNavBtnDisabled]}
                  onPress={() => setCookStep(p => Math.max(0, p - 1))}
                  disabled={cookStep === 0}
                >
                  <Ionicons name="arrow-back" size={20} color={cookStep === 0 ? '#d1d5db' : '#111827'} />
                  <Text style={[s.cookNavText, cookStep === 0 && { color: '#d1d5db' }]}>Föregående</Text>
                </Pressable>
                {cookStep < steps.length - 1 ? (
                  <Pressable style={s.cookNavBtnPrimary} onPress={() => setCookStep(p => p + 1)}>
                    <Text style={s.cookNavTextPrimary}>Nästa</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                  </Pressable>
                ) : (
                  <Pressable style={s.cookNavBtnPrimary} onPress={() => setCookMode(false)}>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={s.cookNavTextPrimary}>Klart!</Text>
                  </Pressable>
                )}
              </View>
            </SafeAreaView>
          </Modal>
        );
      })() : null}

    </SafeAreaView>
  );
}

function parseSteps(instructions: string): string[] {
  const lines = instructions.split(/\n+/).map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1) return [instructions.trim()];
  return lines.map(l => l.replace(/^\d+[.)]\s*/, ''));
}

function cloudinaryOptimized(url: string, width = 800): string {
  const idx = url.indexOf('/upload/');
  if (idx === -1) return url;
  return url.slice(0, idx + 8) + `w_${width},q_auto,f_auto/` + url.slice(idx + 8);
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
  header: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#111827' },
  headerTitleInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f9fafb' },
  transferBtn: { padding: 8 },
  scroll: { padding: 20, gap: 16 },
  heroImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: '#f3f4f6' },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  heroImageOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243,244,246,0.6)' },
  imgBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#eef2ff' },
  imgBtnText: { color: '#4f46e5', fontWeight: '600', fontSize: 14 },
  imgBtnDisabled: { opacity: 0.5 },
  imgRemoveBtn: { width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#fee2e2' },
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
  // Dim på eget absolut lager så det täcker bakom sheetens rundade hörn.
  overlay: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  renameTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  renameInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#f9fafb', color: '#111827' },
  editLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 6, marginTop: 14 },
  editMultiline: { minHeight: 70, textAlignVertical: 'top' },
  editMultilineTall: { minHeight: 140, textAlignVertical: 'top' },
  instructionsText: { fontSize: 15, color: '#374151', lineHeight: 22 },
  renameSave: { marginTop: 16, backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  renameSaveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cookBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: '#eef2ff' },
  cookBtnText: { fontSize: 13, fontWeight: '600', color: '#4f46e5' },
  cookContainer: { flex: 1, backgroundColor: '#0f172a' },
  cookHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  cookRecipeTitle: { flex: 1, fontSize: 19, color: '#e2e8f0', fontWeight: '700' },
  cookClose: { padding: 8 },
  cookProgress: { flexDirection: 'row', gap: 5, paddingHorizontal: 20, marginBottom: 8, flexWrap: 'wrap' },
  cookDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#334155' },
  cookDotActive: { backgroundColor: '#818cf8', width: 20 },
  cookBody: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 32, gap: 20 },
  cookIngredWrap: { maxHeight: 130 },
  cookIngredItem: { fontSize: 18, color: '#475569', lineHeight: 28, paddingVertical: 1 },
  cookStepLabel: { fontSize: 17, fontWeight: '700', color: '#818cf8' },
  cookStepText: { fontSize: 22, color: '#f1f5f9', lineHeight: 34, fontWeight: '400' },
  cookNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  cookNavBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, backgroundColor: '#1e293b' },
  cookNavBtnDisabled: { opacity: 0.35 },
  cookNavText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  cookNavBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: '#4f46e5' },
  cookNavTextPrimary: { fontSize: 15, fontWeight: '700', color: '#fff' },
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
  planSectionLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 4 },
  planChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  planChipActive: { backgroundColor: '#eef2ff', borderColor: '#4f46e5' },
  planChipText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  planChipTextActive: { color: '#4f46e5' },
  planChipSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  planChipSubActive: { color: '#818cf8' },
});

export default function RecipeDetailScreen() {
  const { recipeId, transfer, edit, forMenuDay, forMenuWeek, from } = useLocalSearchParams<{ recipeId: string; transfer?: string; edit?: string; forMenuDay?: string; forMenuWeek?: string; from?: string }>();
  return <RecipeDetail recipeId={recipeId} transfer={transfer} edit={edit} forMenuDay={forMenuDay} forMenuWeek={forMenuWeek} from={from} />;
}
