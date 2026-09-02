import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTheme } from '../../src/context/ThemeContext';
import type { Palette } from '../../src/lib/theme';
import {
  ActivityIndicator,
  Animated,
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

import { kavBehavior } from '../../src/lib/platform';
import { recipes as str, common } from '../../src/lib/svenska';
import { dayItemsSummary } from '../../src/lib/menuDaySummary';
import { getISOWeek, addWeeks, getISOWeekMonday } from '../../src/lib/week';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type RecipeWithIngredients, type ShoppingListWithItems, type WeekMenuItemWithRecipe } from '../../src/api/client';
import { normalizeQtyInput } from '../../src/lib/qty';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useDiscardDraft } from '../../src/hooks/useDiscardDraft';
import type { RecipeIngredient, WeekDay } from '@veckis/shared';

const UNITS = ['st', 'dl', 'ml', 'l', 'g', 'kg', 'msk', 'tsk', 'krm', 'paket', 'påse', 'burk', 'flaska'];

// "Laga nu"-ingredienslistans höjd — ~7 ingredienser synliga (lineHeight 28 + pad).
const COOK_INGRED_MAX_H = 210;

// Labels från centraliserade veckodagar (mån-först) — inga hårdkodade dagnamn.
const MENU_DAYS: { key: WeekDay; label: string }[] =
  (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as WeekDay[])
    .map((key, i) => ({ key, label: common.weekdays.long[i] }));

export function RecipeDetail({ recipeId, transfer, edit: editParam, forMenuDay, forMenuWeek, from, onClose }: { recipeId: string; transfer?: string; edit?: string; forMenuDay?: string; forMenuWeek?: string; from?: string; onClose?: () => void }) {
  const edit = editParam;
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { showError, showToast } = useToast();
  const confirm = useConfirm();
  const tryCloseEdit = useDiscardDraft(confirm);

  const [recipe, setRecipe] = useState<RecipeWithIngredients | null>(null);
  // Memoisera bild-source så RN Web inte laddar om bilden (flimmer) vid varje
  // re-render/fokus-reload — objekt-identiteten hålls stabil så länge imageUrl
  // är oförändrad, i stället för ett nytt {uri}-objekt per render.
  const heroSource = useMemo(
    () => (recipe?.imageUrl ? { uri: cloudinaryOptimized(recipe.imageUrl) } : undefined),
    [recipe?.imageUrl],
  );
  const [loading, setLoading] = useState(true);
  const [scaledServings, setScaledServings] = useState<number | null>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editInstr, setEditInstr] = useState('');
  const [editImage, setEditImage] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  // Alla taggar som redan används i hushållets recept — visas som återanvändbara
  // förslags-chips i edit-läget så man slipper skriva om en custom-tagg.
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [editServings, setEditServings] = useState(4);
  const [customTag, setCustomTag] = useState('');
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
  // Fade-kanterna på ingredienslistan visas bara MEDAN den rullar; när den
  // stannat tas de bort så översta/understa ingrediensen syns helt.
  const [cookIngredScrolling, setCookIngredScrolling] = useState(false);

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
    const maxScroll = Math.max(0, cookIngredContentH.current - COOK_INGRED_MAX_H);
    if (maxScroll <= 0) return;
    cookIngredStarted.current = true;
    setCookIngredScrolling(true);
    const listenerId = cookIngredAnim.addListener(({ value }) => {
      cookIngredScrollRef.current?.scrollTo({ y: value, animated: false });
    });
    Animated.timing(cookIngredAnim, {
      toValue: maxScroll,
      duration: (maxScroll / 18) * 1000,
      useNativeDriver: false,
      easing: (x) => x,
    }).start(() => { cookIngredAnim.removeListener(listenerId); setCookIngredScrolling(false); });
  }, [cookIngredAnim]);

  // Rulla om ingredienslistan från toppen vid varje steg-byte (nästa/föregående).
  useEffect(() => {
    if (!cookMode) return;
    cookIngredAnim.stopAnimation();
    cookIngredAnim.setValue(0);
    cookIngredScrollRef.current?.scrollTo({ y: 0, animated: false });
    cookIngredStarted.current = false;
    startCookIngredAnim();
  }, [cookStep, cookMode, cookIngredAnim, startCookIngredAnim]);

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

  // Samma för namn-fältet: ingrediens-förslagen (chip-raden under namnet) ska
  // hoppa upp ovanför tangentbordet precis som måttenheterna, i stället för att
  // gömmas bakom det.
  useEffect(() => {
    if (activeNameIdx === null) return;
    const input = rowRefs.current[activeNameIdx]?.name;
    if (!input) return;
    const t = setTimeout(() => {
      input.measureInWindow((_x, y, _w, h) => {
        const screenH = Dimensions.get('window').height;
        const kbTop = screenH - (keyboardH.current || 340);
        const chipRowH = 64; // förslags-chip-raden + gap under fältet
        const margin = 24;
        const hidden = (y + h + chipRowH + margin) - kbTop;
        if (hidden > 0) {
          mainScrollRef.current?.scrollTo({ y: scrollOffsetY.current + hidden, animated: true });
        }
      });
    }, 200);
    return () => clearTimeout(t);
  }, [activeNameIdx]);

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
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);

  // Plan in menu modal — samma dag-grid + direkt-tillägg som receptbibliotekets
  // kalenderikon-dialog (delad look). planWeekStr styr vald vecka; grid-tapp
  // lägger till direkt (toast) istället för att navigera bort.
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planWeekStr, setPlanWeekStr] = useState('');
  const [planWeekItems, setPlanWeekItems] = useState<WeekMenuItemWithRecipe[]>([]);

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
      confirm({ title: str.errors.generic, message: str.errors.couldNotLoad, buttons: [{ label: common.actions.ok }] });
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
    // Delay to let the ConfirmDialog modal finish closing before opening a new modal
    setTimeout(() => setShowPlanModal(true), 350);
  }

  // Ladda veckans menyrader så dag-griden kan gråa ut upptagna dagar.
  useEffect(() => {
    if (!showPlanModal || !planWeekStr || !householdId) { setPlanWeekItems([]); return; }
    const [y, w] = planWeekStr.split('-').map(Number);
    let alive = true;
    client.getWeekMenu(householdId, y, w).then(items => { if (alive) setPlanWeekItems(items); }).catch(() => {});
    return () => { alive = false; };
  }, [showPlanModal, planWeekStr, householdId]);

  function planRecipeToMenu(day: WeekDay | null) {
    if (!recipe) return;
    setShowPlanModal(false); // stäng sheeten innan ev. confirm-dialog (undvik staplade modaler)
    // Flera rätter per dag är avsiktligt (måltidstyp sätts på menykortet) — mjuk
    // varning om dagen redan har en rätt, men "lägg till ändå".
    if (day && planWeekItems.some(m => m.day === day)) {
      const label = MENU_DAYS.find(d => d.key === day)?.label;
      confirm({
        title: str.menu.dayOccupied.title,
        message: str.menu.dayOccupied.message(label ?? ''),
        buttons: [
          { label: str.menu.dayOccupied.confirm, onPress: () => planRecipeToMenuStep2(day) },
          { label: common.actions.cancel, style: 'cancel' },
        ],
      });
      return;
    }
    planRecipeToMenuStep2(day);
  }

  // … och varna separat om SAMMA rätt redan ligger någonstans i veckan.
  function planRecipeToMenuStep2(day: WeekDay | null) {
    if (!recipe) return;
    if (planWeekItems.some(m => m.recipeId === recipe.id)) {
      confirm({
        title: str.menu.recipeOccupied.title,
        message: str.menu.recipeOccupied.message(recipe.title),
        buttons: [
          { label: str.menu.recipeOccupied.confirm, onPress: () => doPlanToMenu(day) },
          { label: common.actions.cancel, style: 'cancel' },
        ],
      });
      return;
    }
    doPlanToMenu(day);
  }

  async function doPlanToMenu(day: WeekDay | null) {
    if (!recipe || !householdId) return;
    const [weekYear, weekNumber] = planWeekStr
      ? planWeekStr.split('-').map(Number)
      : [getISOWeek(new Date()).weekYear, getISOWeek(new Date()).weekNumber];
    setShowPlanModal(false);
    try {
      const item = await client.addToWeekMenu({ householdId, recipeId: recipe.id, day, weekYear, weekNumber });
      setPlanWeekItems(prev => [...prev, item]);
      const dayLabel = day ? MENU_DAYS.find(d => d.key === day)?.label.toLowerCase() : null;
      const todayW = getISOWeek(new Date());
      const weekLabel = weekYear === todayW.weekYear && weekNumber === todayW.weekNumber ? str.menu.thisWeek : str.menu.weekLabel(weekNumber);
      showToast(dayLabel ? str.menu.addedWithDay(recipe.title, dayLabel, weekLabel) : str.menu.addedNoDay(recipe.title, weekLabel), 'success');
    } catch (e) {
      showError(e, str.menu.errorAdd);
    }
  }

  function openRecipeActions() {
    if (!recipe) return;
    confirm({
      variant: 'menu',
      buttons: [
        { label: str.actions.editRecipe, icon: 'create-outline', onPress: startEdit },
        { label: str.actions.deleteRecipe, icon: 'trash-outline', style: 'destructive', onPress: confirmDeleteRecipe },
        { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }

  // "+"-väljare: en tydlig ingång för att lägga receptet någonstans — veckomeny
  // eller direkt i en inköpslista. Samlar de två destinationerna som tidigare
  // låg utspridda (planera i 3-prickar, kundvagn-FAB) till ett ställe.
  function openAddChooser() {
    if (!recipe) return;
    const hasIngredients = recipe.ingredients.length > 0;
    confirm({
      variant: 'menu',
      menuAnchor: 'bottom-right', // popupen sitter vid "+"-FAB:en nere till höger
      buttons: [
        { label: str.actions.addToMenu, icon: 'calendar-outline', onPress: openPlanModal },
        ...(hasIngredients ? [{ label: str.actions.addToShopping, icon: 'cart-outline' as const, onPress: () => openTransfer() }] : []),
        { label: common.actions.cancel, style: 'cancel' as const },
      ],
    });
  }

  function confirmDeleteRecipe() {
    if (!recipe) return;
    confirm({
      title: str.delete.title,
      message: str.delete.message(recipe.title),
      buttons: [
      { label: common.actions.delete, style: 'destructive', onPress: async () => {
        try {
          await client.deleteRecipe(recipe.id);
          if (onClose) onClose(); else router.back();
        } catch {
          confirm({ title: str.errors.generic, message: str.errors.couldNotDelete, buttons: [{ label: common.actions.ok }] });
        }
      } },
      { label: common.actions.cancel, style: 'cancel' },
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
    setEditTags(recipe.tags ?? []);
    setCustomTag('');
    // Hämta hushållets övriga taggar så de kan återanvändas med ett tap.
    if (householdId) {
      client.getRecipes(householdId).then(rs => {
        const tags = new Set<string>();
        for (const r of rs) for (const t of r.tags ?? []) tags.add(t);
        setKnownTags([...tags]);
      }).catch(() => {});
    }
    setEditServings(recipe.servings);
    setScaledServings(null); // nollställ transient läs-skalning inför edit
    setEditIngredients(recipe.ingredients.map(i => ({
      name: i.name,
      quantity: i.quantity != null ? String(i.quantity).replace('.', ',') : '',
      unit: i.unit ?? '',
    })));
    setEditMode(true);
  }

  // Formatera skalad mängd: max 2 decimaler, trailing-nollor bort, komma-sep.
  function fmtScaledQty(n: number): string {
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }

  // Portions-stepper i redigera-läget: skalar ingrediensmängderna proportionellt
  // (ratio = ny/gammal — komponeras korrekt över flera steg) och sparar det nya
  // portionsantalet som receptets standard vid Spara. Manuellt redigerade
  // mängder respekteras (skalas från nuvarande värde, inte originalet).
  function adjustEditServings(delta: number) {
    setEditServings(prev => {
      const next = Math.max(1, prev + delta);
      if (next === prev) return prev;
      const ratio = next / prev;
      setEditIngredients(rows => rows.map(r => {
        const q = parseFloat(r.quantity.replace(',', '.'));
        if (!r.quantity.trim() || isNaN(q)) return r; // omätt (t.ex. "salt") → orört
        return { ...r, quantity: fmtScaledQty(q * ratio) };
      }));
      return next;
    });
  }

  function toggleEditTag(tag: string) {
    const t = tag.toLowerCase().trim();
    if (!t) return;
    setEditTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  function addCustomTag() {
    const t = customTag.toLowerCase().trim();
    if (!t) return;
    setEditTags(prev => prev.includes(t) ? prev : [...prev, t]);
    setCustomTag('');
  }

  function isEditDirty(): boolean {
    if (!recipe) return false;
    if (editTitle !== recipe.title) return true;
    if (editDesc !== (recipe.description ?? '')) return true;
    if (editInstr !== (recipe.instructions ?? '')) return true;
    if (editImage !== (recipe.imageUrl ?? '')) return true;
    if (editServings !== recipe.servings) return true;
    if (JSON.stringify(editTags) !== JSON.stringify(recipe.tags ?? [])) return true;
    const origIngs = recipe.ingredients.map(i => ({
      name: i.name,
      quantity: i.quantity != null ? String(i.quantity).replace('.', ',') : '',
      unit: i.unit ?? '',
    }));
    return JSON.stringify(editIngredients) !== JSON.stringify(origIngs);
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
    if (!t) { confirm({ title: str.validation.nameMissing, message: str.validation.nameRequired, buttons: [{ label: common.actions.ok }] }); return; }
    const img = editImage.trim();
    if (img && !/^https?:\/\//i.test(img)) { confirm({ title: str.validation.invalidImageUrl, message: str.validation.imageUrlHint, buttons: [{ label: common.actions.ok }] }); return; }
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
        servings: editServings,
        ingredients,
        tags: editTags,
      });
      setRecipe(updated);
      setScaledServings(null); // visa nya bas-portionerna, inte gammal skalning
      setEditMode(false);
      if (forMenuDay !== undefined) {
        const weekSuffix = forMenuWeek ? `&forMenuWeek=${forMenuWeek}` : '';
        router.replace(`/(tabs)/menu?addRecipeId=${recipe.id}&day=${forMenuDay}${weekSuffix}` as never);
      }
    } catch {
      confirm({ title: str.errors.generic, message: str.errors.couldNotSave, buttons: [{ label: common.actions.ok }] });
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
        showError(new Error('permission_denied'), source === 'camera' ? str.permissions.camera : str.permissions.photos);
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
      showError(e, str.errors.couldNotUpload);
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
      confirm({ title: str.errors.generic, message: str.transfer.noLists, buttons: [{ label: common.actions.ok }] });
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
    if (selected.length === 0) { confirm({ title: str.errors.selectIngredients, buttons: [{ label: common.actions.ok }] }); return; }
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
        title: str.transfer.done,
        message: str.transfer.success(selected.length),
        buttons: [
          { label: str.transfer.goToList, onPress: () => router.push(`/shopping/${listId}` as never) },
          { label: str.transfer.stayHere, style: 'cancel' },
        ],
      });
    } catch {
      confirm({ title: str.errors.generic, message: str.errors.couldNotTransfer, buttons: [{ label: common.actions.ok }] });
    } finally {
      setTransferring(false);
      setTransferringListId(null);
    }
  }

  // Ingen aktiv lista? Skapa en direkt i överförings-modalen och överför till den
  // (samma bekvämlighet som veckomeny-överföringen), i stället för att skicka
  // användaren till Inköp-fliken.
  async function createListAndTransfer() {
    if (!householdId || !newListName.trim()) return;
    const selected = deduplicatedIngredients.filter(i => checkedIds.has(i.id));
    if (selected.length === 0) { confirm({ title: str.errors.selectIngredients, buttons: [{ label: common.actions.ok }] }); return; }
    setCreatingList(true);
    try {
      const list = await client.createShoppingList({ householdId, name: newListName.trim() });
      setNewListName('');
      await doTransfer(list.id);
    } catch (e) {
      showError(e, str.errors.couldNotTransfer);
    } finally {
      setCreatingList(false);
    }
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>;
  // Kunde inte ladda receptet (fetch-fel, borttaget recept, trasig data) → visa
  // ett riktigt fel-tillstånd med väg tillbaka i stället för en tom VIT skärm.
  if (!recipe) return (
    <View style={s.center}>
      <Ionicons name="alert-circle-outline" size={48} color={c.textFaint} />
      <Text style={{ color: c.textMuted, fontSize: 15, marginTop: 12, marginBottom: 20, textAlign: 'center', paddingHorizontal: 24 }}>
        {str.errors.couldNotLoad}
      </Text>
      <Pressable
        onPress={() => (onClose ? onClose() : router.back())}
        style={{ backgroundColor: c.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{common.actions.back}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => { if (editMode) { tryCloseEdit(isEditDirty(), () => setEditMode(false)); return; } if (onClose) onClose(); else router.back(); }} style={s.backBtn} accessibilityRole="button" accessibilityLabel={common.actions.back}>
          <Ionicons name="arrow-back" size={24} color={c.text} />
        </Pressable>
        {editMode ? (
          <TextInput
            style={[s.headerTitle, s.headerTitleInput]}
            value={editTitle}
            onChangeText={setEditTitle}
            placeholder={str.detail.nameLabel}
            placeholderTextColor={c.textFaint}
          />
        ) : (
          <Text style={s.headerTitle} numberOfLines={1}>{recipe.title}</Text>
        )}
        <Pressable onPress={openRecipeActions} style={s.transferBtn} accessibilityLabel={common.actions.more}>
          <Ionicons name="ellipsis-vertical" size={20} color={c.text} />
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
            <Text style={s.editLabel}>{str.detail.imageLabel}</Text>
            {editImage.trim() ? (
              <Image source={{ uri: editImage.trim() }} style={s.heroImage} resizeMode="cover" />
            ) : (
              <View style={[s.heroImage, s.heroPlaceholder]}>
                <Ionicons name="image-outline" size={32} color={c.textFaint} />
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                style={[s.imgBtn, { flex: 1 }, uploadingImage && s.imgBtnDisabled]}
                onPress={() => pickAndUploadImage('library')}
                disabled={uploadingImage}
              >
                <Ionicons name="images-outline" size={18} color={c.primary} />
                <Text style={s.imgBtnText}>{str.detail.gallery}</Text>
              </Pressable>
              <Pressable
                style={[s.imgBtn, { flex: 1 }, uploadingImage && s.imgBtnDisabled]}
                onPress={() => pickAndUploadImage('camera')}
                disabled={uploadingImage}
              >
                <Ionicons name="camera-outline" size={18} color={c.primary} />
                <Text style={s.imgBtnText}>{str.detail.camera}</Text>
              </Pressable>
              {editImage.trim() ? (
                <Pressable
                  style={[s.imgRemoveBtn, uploadingImage && s.imgBtnDisabled]}
                  onPress={() => setEditImage('')}
                  disabled={uploadingImage}
                  accessibilityLabel={str.detail.removeImage}
                >
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </Pressable>
              ) : null}
            </View>
            {uploadingImage ? <ActivityIndicator color={c.primary} /> : null}
          </View>
        ) : recipe.imageUrl ? (
          <View style={s.heroImage}>
            <Image
              source={heroSource}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              // På web sköter webbläsaren bildladdningen. onLoadStart re-fyrar där vid
              // varje re-render → setHeroLoading(true) → re-render → loop → spinner-
              // overlayen BLINKAR (flimret). Kör därför JS-loading-state bara på native;
              // på web behåller vi bara onError för fel-placeholdern.
              {...(Platform.OS as any === 'web'
                ? { onError: () => setHeroError(true) }
                : {
                    onLoadStart: () => { setHeroLoading(true); setHeroError(false); },
                    onLoadEnd: () => setHeroLoading(false),
                    onError: () => { setHeroError(true); setHeroLoading(false); },
                  })}
            />
            {heroLoading && !heroError && Platform.OS as any !== 'web' ? (
              <View style={s.heroImageOverlay}>
                <ActivityIndicator color={c.primary} />
              </View>
            ) : null}
            {heroError ? (
              <View style={[s.heroImageOverlay, s.heroPlaceholder]}>
                <Ionicons name="image-outline" size={32} color={c.textFaint} />
                <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 4 }}>{str.detail.imageLoadError}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Meta */}
        <View style={s.metaRow}>
          {/* Serving scaler — i edit-läget skalar den ingredienserna + sparar
              nya portioner; i läs-läget bara transient display-skalning. */}
          <View style={s.servingChip}>
            <Pressable onPress={() => editMode ? adjustEditServings(-1) : adjustServings(-1)} style={s.servingBtn} hitSlop={8}>
              <Ionicons name="remove" size={14} color={c.primary} />
            </Pressable>
            <Ionicons name="people-outline" size={14} color={c.textMuted} />
            <Text style={s.metaText}>{editMode ? editServings : displayServings} port.</Text>
            <Pressable onPress={() => editMode ? adjustEditServings(1) : adjustServings(1)} style={s.servingBtn} hitSlop={8}>
              <Ionicons name="add" size={14} color={c.primary} />
            </Pressable>
          </View>

          {recipe.sourceUrl && (
            <Pressable
              style={s.metaChip}
              onPress={() => WebBrowser.openBrowserAsync(recipe.sourceUrl!)}
            >
              <Text style={[s.metaText, { color: c.primary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{str.detail.originalRecipe}</Text>
            </Pressable>
          )}
        </View>

        {/* Taggar — läs-läge: visa som chips; edit-läge: förslags-chips + egen */}
        {!editMode && (recipe.tags?.length ?? 0) > 0 && (
          <View style={s.tagRow}>
            {recipe.tags.map(t => (
              <View key={t} style={s.tagChip}>
                <Text style={s.tagChipText}>{t}</Text>
              </View>
            ))}
          </View>
        )}
        {editMode && (
          <View>
            <Text style={s.editLabel}>{str.tags.label}</Text>
            <View style={s.tagRow}>
              {[...new Set([...str.tags.suggested, ...knownTags, ...editTags])].map(t => {
                const active = editTags.includes(t);
                return (
                  <Pressable key={t} style={[s.tagChip, active && s.tagChipActive]} onPress={() => toggleEditTag(t)}>
                    <Text style={[s.tagChipText, active && s.tagChipTextActive]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={s.tagAddRow}>
              <TextInput
                style={[s.renameInput, { flex: 1, marginBottom: 0 }]}
                value={customTag}
                onChangeText={setCustomTag}
                placeholder={str.tags.addPlaceholder}
                placeholderTextColor={c.textFaint}
                autoCapitalize="none"
                onSubmitEditing={addCustomTag}
                returnKeyType="done"
              />
              <Pressable style={[s.tagAddBtn, !customTag.trim() && { opacity: 0.4 }]} onPress={addCustomTag} disabled={!customTag.trim()}>
                <Ionicons name="add" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}

        {editMode ? (
          <View>
            <Text style={s.editLabel}>{str.detail.descriptionLabel}</Text>
            <TextInput
              style={[s.renameInput, s.editMultiline]}
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder={str.detail.descPlaceholder}
              placeholderTextColor={c.textFaint}
              multiline
            />
          </View>
        ) : recipe.description ? (
          <Text style={s.description}>{recipe.description}</Text>
        ) : null}

        {/* Ingredients */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{str.detail.ingredientsLabel}</Text>
            {!editMode && recipe.ingredients.length > 0 && (
              <Pressable style={s.cookBtn} onPress={() => openTransfer()} accessibilityLabel={str.detail.transferA11y}>
                <Ionicons name="cart-outline" size={14} color={c.primary} />
                <Text style={s.cookBtnText}>{str.detail.addToList}</Text>
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
                      placeholder={str.detail.ingNamePlaceholder}
                      placeholderTextColor={c.textFaint}
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
                      placeholder={str.detail.ingQtyPlaceholder}
                      placeholderTextColor={c.textFaint}
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
                      placeholder={defaultUnit || common.fields.unit}
                      placeholderTextColor={c.textFaint}
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
                    <Pressable onPress={() => removeEditRow(idx)} style={s.editRemove} accessibilityRole="button" accessibilityLabel={common.actions.delete}>
                      <Ionicons name="close-circle" size={20} color={c.border} />
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
                <Ionicons name="add" size={16} color={c.primary} />
                <Text style={s.addRowBtnText}>{str.detail.addRow}</Text>
              </Pressable>
            </View>
          ) : recipe.ingredients.length === 0 ? (
            <Pressable style={s.noIngredients} onPress={startEdit}>
              <Text style={s.noIngredientsText}>{str.detail.noIngredients}</Text>
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
              <Text style={s.sectionTitle}>{str.detail.instructionsLabel}</Text>
            </View>
            <TextInput
              style={[s.renameInput, s.editMultilineTall]}
              value={editInstr}
              onChangeText={setEditInstr}
              placeholder={str.detail.instrPlaceholder}
              placeholderTextColor={c.textFaint}
              multiline
            />
          </View>
        ) : recipe.instructions ? (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{str.detail.instructionsLabel}</Text>
              <Pressable style={s.lagaBtn} onPress={() => { setCookStep(0); setCookMode(true); }}>
                <Ionicons name="restaurant-outline" size={14} color={c.primary} />
                <Text style={s.lagaBtnText}>{str.detail.cook}</Text>
              </Pressable>
            </View>
            <Text style={s.instructionsText}>{recipe.instructions}</Text>
          </View>
        ) : null}

        {editMode && (
          <View style={s.editActions}>
            <Pressable style={s.cancelBtn} onPress={() => tryCloseEdit(isEditDirty(), () => setEditMode(false))}>
              <Text style={s.cancelBtnText}>{common.actions.cancel}</Text>
            </Pressable>
            <Pressable style={[s.saveBtn, saving && s.saveBtnDisabled]} onPress={saveRecipe} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>{common.actions.save}</Text>}
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
          <Text style={s.sheetTitle}>{str.transfer.title}</Text>
          <Text style={s.sheetSub}>
            {scaleRatio !== 1 ? str.transfer.scaledPrefix(displayServings) : ''}{str.transfer.needToBuy}
          </Text>

          <ScrollView style={s.ingredientList} showsVerticalScrollIndicator={false}>
            {deduplicatedIngredients.map(ing => {
              const checked = checkedIds.has(ing.id);
              return (
                <Pressable key={ing.id} style={s.checkRow} onPress={() => toggleIngredient(ing.id)}>
                  <Ionicons
                    name={checked ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={checked ? c.primary : c.border}
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
              <Text style={s.selectAllText}>{str.transfer.selectAll}</Text>
            </Pressable>
            <Pressable onPress={() => setCheckedIds(new Set())}>
              <Text style={s.selectAllText}>{str.transfer.clearAll}</Text>
            </Pressable>
          </View>

          <Text style={s.listPickLabel}>{str.transfer.selectList}</Text>
          {loadingLists ? (
            <ActivityIndicator color={c.primary} style={{ marginVertical: 12 }} />
          ) : lists.length === 0 ? (
            <View>
              <Text style={s.noListsText}>{str.transfer.noLists}</Text>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <TextInput
                  style={[s.editInput, { flex: 1 }]}
                  placeholder={str.transfer.newListPlaceholder}
                  placeholderTextColor={c.textFaint}
                  value={newListName}
                  onChangeText={setNewListName}
                  returnKeyType="done"
                  onSubmitEditing={createListAndTransfer}
                />
                <Pressable
                  style={[s.saveBtn, { flex: 0, paddingHorizontal: 18 }, (!newListName.trim() || creatingList || checkedIds.size === 0) && { opacity: 0.4 }]}
                  onPress={createListAndTransfer}
                  disabled={!newListName.trim() || creatingList || checkedIds.size === 0}
                >
                  {creatingList ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{str.transfer.createList}</Text>}
                </Pressable>
              </View>
            </View>
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
                    <Ionicons name="cart-outline" size={18} color={c.primary} />
                    <Text style={s.listPickerItemText}>{item.name}</Text>
                    {transferringListId === item.id && <ActivityIndicator size="small" color={c.primary} />}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>

      {/* Plan in menu modal — identisk look med bibliotekets kalenderikon-dialog:
          veckochips + dag-grid som lägger till direkt (toast), ingen extra knapp. */}
      <Modal visible={showPlanModal} transparent animationType="slide" onRequestClose={() => setShowPlanModal(false)}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => setShowPlanModal(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{str.menu.addToMenu}</Text>
          <Text style={s.daySheetSub} numberOfLines={1}>{recipe?.title}</Text>

          {/* Week chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: -4 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
              {(() => {
                const todayWeek = getISOWeek(new Date());
                const thisMonday = getISOWeekMonday(todayWeek.weekYear, todayWeek.weekNumber);
                return Array.from({ length: 5 }, (_, i) => {
                  const mon = addWeeks(thisMonday, i);
                  const { weekYear, weekNumber } = getISOWeek(mon);
                  const weekKey = `${weekYear}-${String(weekNumber).padStart(2, '0')}`;
                  const active = planWeekStr === weekKey;
                  const label = i === 0 ? str.menu.weekNow(weekNumber) : str.menu.weekLabel(weekNumber);
                  const sub = `${mon.getDate()}/${mon.getMonth() + 1}`;
                  return (
                    <Pressable key={weekKey} style={[s.weekChip, active && s.weekChipActive]} onPress={() => setPlanWeekStr(weekKey)}>
                      <Text style={[s.weekChipText, active && s.weekChipTextActive]}>{label}</Text>
                      <Text style={[s.weekChipSub, active && s.weekChipSubActive]}>{sub}</Text>
                    </Pressable>
                  );
                });
              })()}
            </View>
          </ScrollView>

          <View style={s.dayGrid}>
            {MENU_DAYS.map(d => {
              // Ingen grå-markering — middag (annars första) + "+N rätter" om fler.
              const dayItems = planWeekItems.filter(m => m.day === d.key);
              return (
                <Pressable
                  key={d.key}
                  style={s.dayGridItem}
                  onPress={() => planRecipeToMenu(d.key)}
                >
                  <Text style={s.dayGridLabel}>{d.label}</Text>
                  {dayItems.length > 0 && (
                    <Text style={s.dayGridTakenHint} numberOfLines={1}>{dayItemsSummary(dayItems)}</Text>
                  )}
                </Pressable>
              );
            })}
            <Pressable style={[s.dayGridItem, s.dayGridItemNone]} onPress={() => planRecipeToMenu(null)}>
              <Ionicons name="calendar-clear-outline" size={18} color={c.primary} />
              <Text style={[s.dayGridLabel, s.dayGridLabelNone]}>{str.menu.noDay}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* "+"-FAB — väljare: lägg till receptet i veckomeny eller inköpslista.
          (Laga nu-läget nås från instruktions-sektionens "Laga nu"-knapp.) */}
      {!editMode && recipe && (
        <Pressable style={s.fab} onPress={openAddChooser} accessibilityLabel={str.actions.addTitle}>
          <Ionicons name="add" size={30} color="#fff" />
        </Pressable>
      )}

      {/* Cooking mode */}
      {recipe.instructions ? (() => {
        const steps = parseSteps(recipe.instructions!);
        const step = steps[cookStep] ?? '';
        return (
          <Modal visible={cookMode} transparent={false} animationType="slide" onRequestClose={() => setCookMode(false)}>
            <View style={{ flex: 1, backgroundColor: '#1c1917' }}>
            <SafeAreaView style={s.cookContainer}>
              <View style={s.cookHeader}>
                <Text style={s.cookRecipeTitle} numberOfLines={1}>{recipe.title}</Text>
                <Pressable onPress={() => setCookMode(false)} style={s.cookClose} accessibilityLabel={str.detail.cookClose}>
                  <Ionicons name="close" size={24} color={c.textMuted} />
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
                    fadingEdgeLength={cookIngredScrolling ? 20 : 0}
                    scrollEventThrottle={16}
                    onContentSizeChange={(_, h) => {
                      cookIngredContentH.current = h;
                      startCookIngredAnim();
                    }}
                    onTouchStart={() => { cookIngredAnim.stopAnimation(); setCookIngredScrolling(false); }}
                    onScrollBeginDrag={() => { cookIngredAnim.stopAnimation(); setCookIngredScrolling(true); }}
                    onScrollEndDrag={() => setCookIngredScrolling(false)}
                    onMomentumScrollEnd={() => setCookIngredScrolling(false)}
                  >
                    {recipe.ingredients.map(ing => (
                      <Text key={ing.id} style={s.cookIngredItem}>
                        {formatIngredient(ing, 1)}
                      </Text>
                    ))}
                  </ScrollView>
                )}
                <Text style={s.cookStepLabel}>{str.detail.cookStep(cookStep + 1, steps.length)}</Text>
                <Text style={s.cookStepText}>{step}</Text>
              </ScrollView>
              <View style={s.cookNav}>
                <Pressable
                  style={[s.cookNavBtn, cookStep === 0 && s.cookNavBtnDisabled]}
                  onPress={() => setCookStep(p => Math.max(0, p - 1))}
                  disabled={cookStep === 0}
                >
                  <Ionicons name="arrow-back" size={20} color={cookStep === 0 ? c.border : c.text} />
                  <Text style={[s.cookNavText, cookStep === 0 && { color: c.border }]}>{str.detail.cookPrev}</Text>
                </Pressable>
                {cookStep < steps.length - 1 ? (
                  <Pressable style={s.cookNavBtnPrimary} onPress={() => setCookStep(p => p + 1)}>
                    <Text style={s.cookNavTextPrimary}>{str.detail.cookNext}</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                  </Pressable>
                ) : (
                  <Pressable style={s.cookNavBtnPrimary} onPress={() => setCookMode(false)}>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <Text style={s.cookNavTextPrimary}>{str.detail.cookDone}</Text>
                  </Pressable>
                )}
              </View>
            </SafeAreaView>
            </View>
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

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle, gap: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: c.text },
  headerTitleInput: { color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: c.inputBg },
  transferBtn: { padding: 8 },
  scroll: { padding: 20, gap: 16 },
  heroImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: c.surfaceSubtle },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  heroImageOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(241,239,236,0.6)' },
  imgBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: c.primaryTint },
  imgBtnText: { color: c.primary, fontWeight: '600', fontSize: 14 },
  imgBtnDisabled: { opacity: 0.5 },
  imgRemoveBtn: { width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.dangerTint },
  editImagePreview: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: c.surfaceSubtle, marginTop: 8 },
  metaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metaChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.surfaceSubtle, flexShrink: 0 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: c.primaryTint, flexShrink: 0 },
  tagChipActive: { backgroundColor: c.primary },
  tagChipText: { fontSize: 12, fontWeight: '600', color: c.primary },
  tagChipTextActive: { color: '#fff' },
  tagAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  tagAddBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
  servingChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surfaceSubtle, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20 },
  servingBtn: { padding: 2 },
  metaText: { fontSize: 13, color: c.textMuted },
  description: { fontSize: 14, color: c.textSecondary, lineHeight: 22 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: c.text },
  lagaBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: c.primaryTint },
  lagaBtnText: { fontSize: 13, fontWeight: '600', color: c.primary },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { fontSize: 14, color: c.primary, fontWeight: '500' },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  ingredientBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary, marginTop: 1 },
  ingredientText: { fontSize: 15, color: c.textSecondary, flex: 1 },
  noIngredients: { paddingVertical: 16, alignItems: 'center' },
  noIngredientsText: { fontSize: 14, color: c.textFaint },
  editList: { gap: 8 },
  editRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  editInput: { color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, backgroundColor: c.inputBg },
  editInputQty: { width: 60 },
  editInputUnit: { width: 60 },
  editInputName: { flex: 1 },
  editRemove: { padding: 2 },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  addRowBtnText: { fontSize: 14, color: c.primary, fontWeight: '500' },
  unitChipScroll: { marginBottom: 4 },
  unitChipRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  unitChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: c.surfaceSubtle, borderWidth: 1, borderColor: c.borderLight },
  unitChipActive: { backgroundColor: c.primaryTint, borderColor: c.primary },
  unitChipText: { fontSize: 13, color: c.textSecondary, fontWeight: '500' },
  unitChipTextActive: { color: c.primary, fontWeight: '600' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: c.borderLight, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: c.textMuted, fontWeight: '500' },
  saveBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  // Dim på eget absolut lager så det täcker bakom sheetens rundade hörn.
  overlay: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', shadowColor: c.primary, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  renameTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 16 },
  renameInput: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: c.inputBg, color: c.text },
  editLabel: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 6, marginTop: 14 },
  editMultiline: { minHeight: 70, textAlignVertical: 'top' },
  editMultilineTall: { minHeight: 140, textAlignVertical: 'top' },
  instructionsText: { fontSize: 15, color: c.textSecondary, lineHeight: 22 },
  renameSave: { marginTop: 16, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  renameSaveText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cookBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: c.primaryTint },
  cookBtnText: { fontSize: 13, fontWeight: '600', color: c.primary },
  // "Laga nu" använder appens ljusa/varma tema (inte mörkt) för konsekvens.
  cookContainer: { flex: 1, backgroundColor: c.background },
  cookHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  cookRecipeTitle: { flex: 1, fontSize: 19, color: c.text, fontWeight: '700' },
  cookClose: { padding: 8 },
  cookProgress: { flexDirection: 'row', gap: 5, paddingHorizontal: 20, marginBottom: 8, flexWrap: 'wrap' },
  cookDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.borderLight },
  cookDotActive: { backgroundColor: c.primary, width: 20 },
  // Ankra steget (+ ingredienser) mot BOTTEN så det poppar upp så långt underifrån
  // som möjligt — nära nav-knapparna, alltid synligt utan att behöva skrolla. Långt
  // innehåll fyller uppåt och blir skrollbart.
  cookBody: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 32, paddingVertical: 32, gap: 20 },
  cookIngredWrap: { maxHeight: COOK_INGRED_MAX_H },
  cookIngredItem: { fontSize: 18, color: c.textMuted, lineHeight: 28, paddingVertical: 1 },
  cookStepLabel: { fontSize: 17, fontWeight: '700', color: c.primary },
  cookStepText: { fontSize: 22, color: c.text, lineHeight: 34, fontWeight: '400' },
  cookNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  cookNavBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, backgroundColor: c.surfaceSubtle, borderWidth: 1, borderColor: c.borderLight },
  cookNavBtnDisabled: { opacity: 0.35 },
  cookNavText: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
  cookNavBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: c.primary },
  cookNavTextPrimary: { fontSize: 15, fontWeight: '700', color: '#fff' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.borderLight, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: c.text },
  sheetSub: { fontSize: 13, color: c.textMuted, marginTop: 2, marginBottom: 8 },
  ingredientList: { maxHeight: 220 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.background },
  checkLabel: { fontSize: 15, color: c.text, flex: 1 },
  checkLabelUnchecked: { color: c.textFaint, textDecorationLine: 'line-through' },
  selectAllRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginVertical: 8 },
  selectAllText: { fontSize: 13, color: c.primary, fontWeight: '500' },
  listPickLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginTop: 4, marginBottom: 6 },
  noListsText: { fontSize: 14, color: c.textFaint, textAlign: 'center', paddingVertical: 12 },
  listPicker: {},
  listPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: c.background, borderRadius: 10, marginBottom: 6 },
  listPickerItemText: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1 },
  daySheetSub: { fontSize: 13, color: c.textMuted, marginTop: -8 },
  dayGrid: { gap: 8, marginTop: 4 },
  dayGridItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: c.surfaceSubtle, borderRadius: 12 },
  dayGridItemTaken: { backgroundColor: c.background },
  dayGridItemNone: { backgroundColor: c.primaryTint, borderWidth: 1, borderColor: c.primary200, justifyContent: 'flex-start' },
  dayGridLabel: { fontSize: 15, fontWeight: '600', color: c.text },
  dayGridLabelTaken: { color: c.textFaint },
  dayGridTakenHint: { fontSize: 12, fontWeight: '600', color: c.textFaint, flexShrink: 1, marginLeft: 8, textAlign: 'right' },
  dayGridLabelNone: { color: c.primary },
  weekChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.surfaceSubtle, borderWidth: 1, borderColor: c.borderLight, alignItems: 'center' },
  weekChipActive: { backgroundColor: c.primaryTint, borderColor: c.primary },
  weekChipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  weekChipTextActive: { color: c.primary },
  weekChipSub: { fontSize: 11, color: c.textFaint, marginTop: 2 },
  weekChipSubActive: { color: c.primary400 },
});

export default function RecipeDetailScreen() {
  const { recipeId, transfer, edit, forMenuDay, forMenuWeek, from } = useLocalSearchParams<{ recipeId: string; transfer?: string; edit?: string; forMenuDay?: string; forMenuWeek?: string; from?: string }>();
  return <RecipeDetail recipeId={recipeId} transfer={transfer} edit={edit} forMenuDay={forMenuDay} forMenuWeek={forMenuWeek} from={from} />;
}
