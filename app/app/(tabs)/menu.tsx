import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
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
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useApiClient, type WeekMenuItemWithRecipe, type RecipeWithIngredients, type ShoppingListWithItems } from '../../src/api/client';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useSpotlightTip, useTipsReady } from '../../src/context/SpotlightTipContext';
import { useOnceFlag } from '../../src/hooks/useOnceFlag';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useAuth } from '@clerk/clerk-expo';
import { useHouseholdSocket } from '../../src/hooks/useHouseholdSocket';
import { usePendingRemoval } from '../../src/context/PendingRemovalContext';
import { getISOWeek, addWeeks, getISOWeekMonday } from '../../src/lib/week';
import { useHaptics } from '../../src/hooks/useHaptics';
import { useTablet } from '../../src/hooks/useTablet';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState } from '../../src/components/EmptyState';
import { MenuTemplatesModal } from '../../src/components/MenuTemplatesModal';
import { onShoppingChanged, emitShoppingChanged } from '../../src/lib/shoppingEvents';
import { WeekNav } from '../../src/components/WeekNav';
import { DatePickerModal } from '../../src/components/DatePickerModal';
import type { WeekDay } from '@veckis/shared';
import { DEFAULT_CATEGORY_ORDER } from '@veckis/shared';
import { kavBehavior } from '../../src/lib/platform';
import { menu as str, common, recipes as recipesStr } from '../../src/lib/svenska';

const DAY_KEYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAYS: { key: WeekDay; label: string; short: string }[] = DAY_KEYS.map((key, i) => ({
  key,
  label: common.weekdays.long[i],
  short: common.weekdays.short[i],
}));


function getWeekMonday(weekOffset: number): Date {
  const d = addWeeks(new Date(), weekOffset);
  const dow = d.getDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// weekOffset (relative to today) that lands on the given absolute ISO week.
// Used to restore the viewed week after the recipe-picker navigation round-trip.
function weekOffsetForWeek(weekYear: number, weekNumber: number): number {
  const target = getISOWeekMonday(weekYear, weekNumber).getTime();
  const today = getWeekMonday(0).getTime();
  return Math.round((target - today) / (7 * 86400000));
}

// Parse a "YYYY-WW" week param (threaded through the recipe picker so the dish
// lands in the week the user was viewing, not the current week).
function parseWeekParam(s?: string): { weekYear: number; weekNumber: number } | null {
  if (!s) return null;
  const m = /^(\d+)-(\d+)$/.exec(s);
  return m ? { weekYear: Number(m[1]), weekNumber: Number(m[2]) } : null;
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

// Sliderns steg per enhet: kg är finkorning (0,1), övriga delbara mått (l, dl,
// msk, tsk …) stegar 0,5. Gram/ml skalar med totalmängden — 2 g saffran ska gå
// att välja exakt, men 1039 g mjöl behöver inte grams-precision. Övrigt heltal.
const HALF_STEP_UNITS = new Set(['l', 'dl', 'cl', 'msk', 'tsk', 'cups', 'cup', 'tbsp', 'tsp', 'oz', 'lb']);
function unitStep(unit: string | null, total: number): number {
  const u = (unit ?? '').toLowerCase();
  if (u === 'kg') return 0.1;
  if (HALF_STEP_UNITS.has(u)) return 0.5;
  if (u === 'g' || u === 'ml') {
    if (total > 500) return 50;
    if (total > 200) return 25;
    if (total > 100) return 10;
    if (total > 20) return 5;
    return 1;
  }
  return 1;
}

const fmtQty = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

// Dra-bar för "Vad har du hemma": 0 → totalbehovet. Tap på spåret sätter värdet
// direkt; horisontellt drag justerar. Vertikala rörelser släpps till scrollen.
// Fyllningen/tummen drivs av Reanimated shared values — uppdateras på UI-tråden
// utan React-omrendering per frame. `onLive` fyrar vid varje steg-gräns under
// draget (för rad-lokal etikett), `onCommit` en gång vid släpp/tap (förälderns
// state), `onDragEnd` när gesten avslutas (rensar rad-lokalt läge).
function InvSlider({ total, value, step, onLive, onCommit, onDragEnd }: {
  total: number;
  value: number;
  step: number;
  onLive: (v: number) => void;
  onCommit: (v: number) => void;
  onDragEnd: () => void;
}) {
  const trackW = useSharedValue(0);
  const dragPct = useSharedValue(-1); // -1 = ingen aktiv dragning
  const basePct = useSharedValue(total > 0 ? Math.min(1, value / total) : 0);
  basePct.value = total > 0 ? Math.min(1, value / total) : 0;
  const lastEmitted = useSharedValue(-1);
  // Stabila JS-callbacks (läser aktuella props via ref) så worklets inte
  // behöver byggas om när raden omrenderas mitt i ett drag.
  const cbRef = useRef({ onLive, onCommit, onDragEnd });
  cbRef.current = { onLive, onCommit, onDragEnd };
  const liveJS = useCallback((v: number) => cbRef.current.onLive(v), []);
  const commitJS = useCallback((v: number) => cbRef.current.onCommit(v), []);
  const dragEndJS = useCallback(() => cbRef.current.onDragEnd(), []);
  const gesture = useMemo(() => {
    const snapped = (x: number): number => {
      'worklet';
      const ratio = trackW.value > 0 ? Math.min(1, Math.max(0, x / trackW.value)) : 0;
      const raw = Math.round((ratio * total) / step) * step;
      return Math.max(0, Math.min(Math.round(raw * 100) / 100, total));
    };
    const live = (x: number) => {
      'worklet';
      if (total <= 0 || trackW.value <= 0) return;
      const v = snapped(x);
      if (v !== lastEmitted.value) { lastEmitted.value = v; runOnJS(liveJS)(v); }
    };
    const setDrag = (x: number) => {
      'worklet';
      if (trackW.value <= 0) return;
      dragPct.value = Math.min(1, Math.max(0, x / trackW.value));
    };
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-12, 12])
      .onStart(e => { setDrag(e.x); live(e.x); })
      .onUpdate(e => { setDrag(e.x); live(e.x); })
      .onEnd(e => { if (total > 0) runOnJS(commitJS)(snapped(e.x)); })
      .onFinalize(() => { dragPct.value = -1; lastEmitted.value = -1; runOnJS(dragEndJS)(); });
    const tap = Gesture.Tap()
      .onEnd(e => { if (total > 0) runOnJS(commitJS)(snapped(e.x)); });
    return Gesture.Race(pan, tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, step]);
  const fillStyle = useAnimatedStyle(() => {
    const pct = dragPct.value >= 0 ? dragPct.value : basePct.value;
    return { width: pct * trackW.value };
  });
  const thumbStyle = useAnimatedStyle(() => {
    const pct = dragPct.value >= 0 ? dragPct.value : basePct.value;
    return { transform: [{ translateX: Math.max(0, Math.min(trackW.value - 18, pct * trackW.value - 9)) }] };
  });
  // touchAction="pan-y" (web-only, ignoreras på native): webbläsaren behåller
  // vertikal scroll medan horisontella drag driver slidern — annars sätter
  // RNGH touch-action:none på spåret och scroll som börjar där blockeras i PWA:n.
  return (
    <GestureDetector gesture={gesture} touchAction="pan-y">
      <View
        style={s.invSliderTrack}
        onLayout={e => { trackW.value = e.nativeEvent.layout.width; }}
      >
        <View style={s.invSliderRail} />
        <Animated.View style={[s.invSliderFill, fillStyle]} />
        <Animated.View style={[s.invSliderThumb, thumbStyle]} />
      </View>
    </GestureDetector>
  );
}

// En mätbar inventeringsrad som EGEN komponent — under drag uppdateras bara
// den här radens lokala state (etikett + strykning), inte hela menyskärmen.
// Förälderns haveAtHome skrivs först vid släpp (onCommit).
function InvMeasuredRow({ agg, haveAmt, onCommit }: {
  agg: AggIngredient;
  haveAmt: number;
  onCommit: (v: number) => void;
}) {
  const [liveVal, setLiveVal] = useState<number | null>(null);
  const unitLabel = agg.unit ? ` ${agg.unit}` : '';
  const total = agg.totalQty ?? 0;
  const shown = liveVal ?? haveAmt;
  const covered = shown >= total && total > 0;
  const valueLabel = `${fmtQty(shown)}${unitLabel}`;
  return (
    <View style={s.invRowCol}>
      <View style={s.invRowTop}>
        <Text style={[s.invName, { flex: 1 }, covered && s.invNameDone]} numberOfLines={1}>
          {fmtQty(total)}{unitLabel} {agg.name}
        </Text>
        {/* Explicit minWidth — Android mäter vissa strängar ("kg", "dl") för
            smalt och klipper annars sista glyfen. */}
        <Text style={[s.invValue, { minWidth: valueLabel.length * 9 + 6 }]}>{valueLabel}</Text>
        <Pressable
          style={[s.invAllBtn, covered && s.invAllBtnOn]}
          onPress={() => onCommit(covered ? 0 : total)}
        >
          <Ionicons name="checkmark" size={15} color={covered ? '#fff' : '#a8a29e'} />
          <Text style={[s.invAllBtnText, covered && s.invAllBtnTextOn]}>{str.inventory.have}</Text>
        </Pressable>
      </View>
      <InvSlider
        total={total}
        value={shown}
        step={unitStep(agg.unit, total)}
        onLive={setLiveVal}
        onCommit={onCommit}
        onDragEnd={() => setLiveVal(null)}
      />
    </View>
  );
}

export default function MenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bulkTransfer?: string; originListId?: string; addRecipeId?: string; day?: string; replaceMenuItemId?: string; forMenuWeek?: string }>();
  const addRecipeTriggeredRef = useRef(false);
  // Always current — updated in render so it's available when useFocusEffect fires.
  const incomingAddRecipeRef = useRef(params.addRecipeId);
  incomingAddRecipeRef.current = params.addRecipeId;
  const bulkTransferTriggeredRef = useRef(false);
  const client = useApiClient();
  const { showToast: showGlobalToast, showError } = useToast();
  const confirm = useConfirm();
  const showTip = useSpotlightTip();
  const tipsReady = useTipsReady();
  const bulkRecipesTip = useOnceFlag('seen-bulk-recipes-tip');
  const bulkRecipesTipShownRef = useRef(false);
  const bulkInventoryTip = useOnceFlag('seen-bulk-inventory-tip');
  const bulkInventoryTipShownRef = useRef(false);
  const menuNavTip = useOnceFlag('seen-menu-nav-tip');
  const menuNavTipShownRef = useRef(false);
  const templatesTip = useOnceFlag('seen-templates-tip');
  const templatesTipShownRef = useRef(false);
  const templatesBtnRef = useRef<View>(null);
  const cartFabTip = useOnceFlag('seen-cart-fab-tip');
  const cartFabTipShownRef = useRef(false);
  const cartFabRef = useRef<View>(null);
  const recipesBtnTip = useOnceFlag('seen-recipes-btn-tip');
  const recipesBtnTipShownRef = useRef(false);
  const recipesBtnRef = useRef<View>(null);
  const scaleWarnedRef = useRef<Set<string>>(new Set());
  const { householdId } = useHousehold();
  const { getToken } = useAuth();
  const { markPending, clearPending, cancelAllPending, pendingMenuItemRemovals, pendingCount } = usePendingRemoval();
  const { fs, sp, isTablet } = useTablet();
  const { width: weekPageW, height: windowHeight } = useWindowDimensions();

  const [weekOffset, setWeekOffset] = useState(0);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const weekMonday = useMemo(() => getWeekMonday(weekOffset), [weekOffset]);
  const { weekYear, weekNumber } = useMemo(() => getISOWeek(weekMonday), [weekMonday]);

  const weekLabel = useMemo(() => `Vecka ${weekNumber}`, [weekNumber]);

  const [menuItems, setMenuItems] = useState<WeekMenuItemWithRecipe[]>([]);
  const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingListWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferSheet, setTransferSheet] = useState<WeekMenuItemWithRecipe | null>(null);
  const [transferringListId, setTransferringListId] = useState<string | null>(null);
  const [bulkTransferringListId, setBulkTransferringListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [ingredientCategories, setIngredientCategories] = useState<Record<string, string>>({}); // name -> category for inventory sorting
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
  // Inventory step (aggregated across selected recipes). En enda interaktion
  // per rad: "Har"-input för att ange mängd man har hemma + en "Allt"-knapp
  // som snabbsätter Har = Behöver. För omätta ingredienser (salt, peppar):
  // bara "Har"-toggle.
  const [haveAtHome, setHaveAtHome] = useState<Record<string, number>>({}); // aggKey -> mängd hemma
  const [hadUnmeasured, setHadUnmeasured] = useState<Set<string>>(new Set()); // omätta ingredienser markerade "har hemma"
  const [allMenus, setAllMenus] = useState<WeekMenuItemWithRecipe[]>([]);
  const [bulkTransferWeek, setBulkTransferWeek] = useState<{ weekYear: number; weekNumber: number } | null>(null);

  // Replace recipe: item being replaced
  const [replaceTarget, setReplaceTarget] = useState<WeekMenuItemWithRecipe | null>(null);

  // Edit recipe modal
  // Optimistic overlay for the −/+ scaler; the persisted truth is item.servings.
  // Reset on load() so another device's change isn't shadowed by a stale entry.
  const [menuItemServings, setMenuItemServings] = useState<Record<string, number>>({});
  const servingsSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function scaledServingsOf(item: WeekMenuItemWithRecipe): number {
    return menuItemServings[item.id] ?? item.servings ?? item.recipe.servings;
  }

  function getScaleRatio(item: WeekMenuItemWithRecipe): number {
    const base = item.recipe.servings;
    const scaled = scaledServingsOf(item);
    return base > 0 ? scaled / base : 1;
  }

  // Scale a placement's portions: instant optimistic overlay + debounced persist
  // (null = back to recipe default). PATCH broadcasts menu_updated so other
  // devices reload with the new servings.
  function scaleServings(item: WeekMenuItemWithRecipe, n: number) {
    setMenuItemServings(prev => ({ ...prev, [item.id]: n }));
    if (recipeListMap[item.id]?.length && !scaleWarnedRef.current.has(item.id)) {
      scaleWarnedRef.current.add(item.id);
      showGlobalToast(str.toasts.scalingAffectsNothing, 'neutral');
    }
    const toSave = n === item.recipe.servings ? null : n;
    if (servingsSaveTimers.current[item.id]) clearTimeout(servingsSaveTimers.current[item.id]);
    servingsSaveTimers.current[item.id] = setTimeout(() => {
      client.updateWeekMenuItem(item.id, { servings: toSave }).catch(e => showError(e, str.toasts.errorSaveServings));
    }, 600);
  }

  function scaleQty(qty: number | null, ratio: number): number | null {
    if (qty == null) return null;
    const n = qty * ratio;
    if (n % 1 === 0) return n;
    if (n < 1) return Math.round(n * 4) / 4;
    return Math.round(n * 2) / 2;
  }

  function resetInventory() {
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
    const s = new Set<string>();
    for (const l of lists) {
      // linkedMenuItemIds (backend) is the same authoritative source recipeListMap
      // uses — includes hidden merge-container items and works across all weeks,
      // unlike scanning visible l.items[].menuItemId.
      const linked = (l as { linkedMenuItemIds?: string[] }).linkedMenuItemIds ?? [];
      linked.forEach(id => s.add(id));
    }
    return s;
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
          // Prefer the learned/common category by name (where it lands in the
          // store); recipe ingredients themselves are usually 'other'.
          const cat = ingredientCategories[ing.name.toLowerCase().trim()] ?? ing.category;
          agg = { key, name: ing.name, unit, category: cat, totalQty: 0, measured: true, recipeTitles: [], sources: [] };
          map.set(key, agg);
        }
        agg.sources.push({ menuItemId: item.id, recipeId: item.recipeId, qty });
        if (!agg.recipeTitles.includes(item.recipe.title)) agg.recipeTitles.push(item.recipe.title);
        if (qty == null) agg.measured = false;
        if (agg.measured && agg.totalQty != null) agg.totalQty += qty ?? 0;
      }
    }
    // Group by store category (kyl/frys/skafferi…) so you don't run back and forth
    // while inventorying — alphabetical within each category. No headers shown.
    const catIdx = (c?: string) => {
      const i = DEFAULT_CATEGORY_ORDER.indexOf(c as never);
      return i < 0 ? DEFAULT_CATEGORY_ORDER.length : i;
    };
    return [...map.values()]
      .map(a => (a.measured && (a.totalQty ?? 0) > 0 ? a : { ...a, measured: false, totalQty: null }))
      .sort((a, b) => (catIdx(a.category) - catIdx(b.category)) || a.name.localeCompare(b.name, 'sv'));
  }, [selectedRecipesForTransfer, bulkTransferWeek, allMenus, menuItems, menuItemServings, transferredMenuItemIds, ingredientCategories]);

  // Inventory: en flat lista där varje rad har en dra-bar + ✓-knapp. Cap höjden
  // så Överför-/Tillbaka-knapparna inte klipps på korta skärmar.
  const invMaxListH = Math.max(200, windowHeight * 0.8 - 300);

  const toggleUnmeasured = (key: string) => setHadUnmeasured(prev => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  // En rad i inventerings-vyn. Mätbara ingredienser har:
  //  [Namn (+ behov)   värde   ✓ Finns-knapp]
  //  [───────●──────────────── dra-bar 0→allt]
  // Omätta ingredienser (qty=null, t.ex. salt) har bara ✓-knappen.
  // När Har ≥ Behöver: rad gråmarkerad/struken + ✓ filled.
  function renderInventoryRow(agg: AggIngredient) {
    if (!agg.measured) {
      const have = hadUnmeasured.has(agg.key);
      return (
        <View key={agg.key} style={s.invRowV2}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[s.invName, have && s.invNameDone]}>{agg.name}</Text>
          </View>
          <Pressable
            style={[s.invAllBtn, have && s.invAllBtnOn]}
            onPress={() => toggleUnmeasured(agg.key)}
          >
            <Ionicons name="checkmark" size={15} color={have ? '#fff' : '#a8a29e'} />
            <Text style={[s.invAllBtnText, have && s.invAllBtnTextOn]}>{str.inventory.have}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <InvMeasuredRow
        key={agg.key}
        agg={agg}
        haveAmt={haveAtHome[agg.key] ?? 0}
        onCommit={v => setHaveAtHome(prev => ({ ...prev, [agg.key]: v }))}
      />
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

  // Drag state — y = absolute screen Y; touchOffsetY = finger position within card
  type DragState = { item: WeekMenuItemWithRecipe; y: number; touchOffsetY: number };
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverDay, setHoverDay] = useState<WeekDay | null | 'unscheduled' | undefined>(undefined);

  // Refs for measuring day section positions (screen coords)
  const daySectionRefs = useRef<Record<string, View | null>>({});
  const dayLayouts = useRef<Record<string, { y: number; height: number }>>({});

  // Auto-scroll during drag near screen edges
  const menuScrollRef = useRef<ScrollView | null>(null);
  const weekListRef = useRef<FlatList<number>>(null);
  const weekScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Virtualised week pager: a long list of week offsets so swiping never has to
  // recenter (which is what caused the flash). The arrows just scrollToIndex.
  const WEEK_SPAN = 104; // ±2 years of weeks
  const weekIndices = useMemo(
    () => Array.from({ length: WEEK_SPAN * 2 + 1 }, (_, i) => i - WEEK_SPAN),
    [],
  );
  // Which ISO week the live `menuItems` currently represents — used so the
  // pager's centre page can tell genuine emptiness apart from "reload in
  // flight" without being fooled by an emptied-out week.
  const loadedWeekRef = useRef<{ wy: number; wn: number } | null>(null);
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
      const [menu, recs, activeLists, suggestions, all] = await Promise.all([
        client.getWeekMenu(householdId, weekYear, weekNumber),
        client.getRecipes(householdId),
        client.getShoppingLists(householdId),
        client.getIngredientSuggestions(householdId).catch(() => [] as { name: string; category: string }[]),
        client.getAllMenus(householdId).catch(() => [] as WeekMenuItemWithRecipe[]),
      ]);
      setMenuItems(menu);
      setMenuItemServings({}); // persisted item.servings is the truth after a load
      loadedWeekRef.current = { wy: weekYear, wn: weekNumber };
      setRecipes(recs);
      setShoppingLists(activeLists);
      setAllMenus(all);
      // name -> category map (learned aliases + common ingredients), so the
      // inventory can group by where the item lands in the store.
      const catMap: Record<string, string> = {};
      for (const sgg of suggestions) catMap[sgg.name.toLowerCase().trim()] = sgg.category;
      setIngredientCategories(catMap);
      const transferred = new Set<string>();
      const listMap: Record<string, ListEntry[]> = {};
      // Build over ALL weeks' menu items (not just the current week) so the
      // "I inköpslistan"-tag is already correct on neighbouring week pages the
      // moment you swipe to them, instead of popping in after the reload.
      (all.length ? all : menu).forEach(menuItem => {
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
      confirm({ title: str.dialogs.loadError.title, message: str.dialogs.loadError.message, buttons: [{ label: common.actions.ok }] });
    } finally {
      setLoading(false);
    }
  }, [householdId, weekYear, weekNumber]);

  useFocusEffect(useCallback(() => {
    // When returning from the recipe picker (addRecipeId present), state is intact
    // from before navigation — skip load() to avoid a FlatList re-render that would
    // race with the addRecipeId effect's optimistic insert and wipe it from state.
    // loadedWeekRef guards the "first mount" case: if no data has ever been loaded
    // we always load, regardless of addRecipeId.
    if (incomingAddRecipeRef.current && loadedWeekRef.current) return;
    load();
  }, [load]));
  // Reload when a shopping list changes elsewhere so the "I inköpslistan"-tag and
  // transfer filters stay in sync (e.g. after clearing/removing items in a list).
  useEffect(() => onShoppingChanged(load), [load]);

  // First time the user opens menyn with rätter inlagda: visa ett tip om att
  // man kan dra rätter mellan dagar och svepa mellan veckor — annars missar
  // många dessa funktioner helt.
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (menuNavTip.seen !== false || menuNavTipShownRef.current) return;
    if (menuItems.length === 0) return;
    const shown = showTip({
      title: str.tips.drag.title,
      message: str.tips.drag.message,
      swipeDemo: 'drag',
    });
    if (shown) { menuNavTipShownRef.current = true; menuNavTip.markSeen(); }
  }, [tipsReady, menuItems, menuNavTip.seen, menuNavTip.markSeen, showTip]));

  // Mallar-tip: visas EFTER att menu-nav-tipset är dismissat, så vi inte
  // bombar användaren med två tips på en gång. Spotlightar mallar-knappen.
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (templatesTip.seen !== false || templatesTipShownRef.current) return;
    if (menuNavTip.seen !== true) return; // vänta tills nav-tipset är sett
    if (menuItems.length === 0) return;
    const shown = showTip({
      title: str.tips.templates.title,
      message: str.tips.templates.message,
      targetRef: templatesBtnRef,
    });
    if (shown) { templatesTipShownRef.current = true; templatesTip.markSeen(); }
  }, [tipsReady, menuItems.length, menuNavTip.seen, templatesTip.seen, templatesTip.markSeen, showTip]));

  // Recept-knappen i meny-headern: visa direkt efter mallar-tipset så hela
  // header-sviten introduceras i ordning.
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (recipesBtnTip.seen !== false || recipesBtnTipShownRef.current) return;
    if (templatesTip.seen !== true) return;
    const shown = showTip({
      title: str.tips.recipes.title,
      message: str.tips.recipes.message,
      targetRef: recipesBtnRef,
    });
    if (shown) { recipesBtnTipShownRef.current = true; recipesBtnTip.markSeen(); }
  }, [tipsReady, templatesTip.seen, recipesBtnTip.seen, recipesBtnTip.markSeen, showTip]));

  // Cart FAB-tip: visas efter templates-tipset när det finns rätter kvar att
  // överföra (= när FAB:en faktiskt renderas). Workflow-koppling som många missar.
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (cartFabTip.seen !== false || cartFabTipShownRef.current) return;
    if (templatesTip.seen !== true) return;
    const fabVisible = menuItems.some(m => !recipeListMap[m.id]?.length);
    if (!fabVisible) return;
    const shown = showTip({
      title: str.tips.transfer.title,
      message: str.tips.transfer.message,
      targetRef: cartFabRef,
    });
    if (shown) { cartFabTipShownRef.current = true; cartFabTip.markSeen(); }
  }, [tipsReady, menuItems, recipeListMap, templatesTip.seen, cartFabTip.seen, cartFabTip.markSeen, showTip]));

  // Bulk-transfer steg-tips: fyrar oavsett om man kom hit via meny-fliken
  // (kundvagn-FAB) eller via import från inköpslistan. Gate på modal-state
  // (showBulkTransferModal) istället för bulkTransferWeek som bara sätts vid
  // import-flödet.
  useEffect(() => {
    if (!tipsReady) return;
    if (!showBulkTransferModal) return;
    if (bulkTransferStep !== 'recipe') return;
    if (bulkRecipesTip.seen !== false || bulkRecipesTipShownRef.current) return;
    const shown = showTip({
      title: str.tips.selectItems.title,
      message: str.tips.selectItems.message,
    });
    if (shown) { bulkRecipesTipShownRef.current = true; bulkRecipesTip.markSeen(); }
  }, [tipsReady, showBulkTransferModal, bulkTransferStep, bulkRecipesTip.seen, bulkRecipesTip.markSeen, showTip]);

  useEffect(() => {
    if (!tipsReady) return;
    if (!showBulkTransferModal) return;
    if (bulkTransferStep !== 'ingredients') return;
    if (bulkInventoryTip.seen !== false || bulkInventoryTipShownRef.current) return;
    const shown = showTip({
      title: str.tips.inventory.title,
      message: str.tips.inventory.message,
    });
    if (shown) { bulkInventoryTipShownRef.current = true; bulkInventoryTip.markSeen(); }
  }, [tipsReady, showBulkTransferModal, bulkTransferStep, bulkInventoryTip.seen, bulkInventoryTip.markSeen, showTip]);
  // Live menu updates: another device added/removed/moved a meal. load() refreshes
  // both the visible week and the allMenus snapshot that feeds neighbour pages.
  const menuReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Count of our own pending menu mutations. Each local mutation increments this
  // before the API call; the socket echo decrements it and skips the reload so
  // we don't get a FlatList re-render from our own broadcast.
  const suppressMenuReloadRef = useRef(0);
  useHouseholdSocket(householdId, getToken, (msg) => {
    if (msg.type !== 'menu_updated') return;
    if (suppressMenuReloadRef.current > 0) { suppressMenuReloadRef.current -= 1; return; }
    if (menuReloadTimer.current) clearTimeout(menuReloadTimer.current);
    menuReloadTimer.current = setTimeout(() => { load(); }, 350);
  });
  // Move the pager to a given week. Swipe handles itself (it's already there);
  // the arrows / "Idag" / week-picker scroll the list so they behave exactly
  // like a swipe instead of an instant jump.
  const goToWeek = useCallback((target: number, animated: boolean) => {
    const clamped = Math.max(-WEEK_SPAN, Math.min(WEEK_SPAN, target));
    setWeekOffset(clamped);
    weekListRef.current?.scrollToIndex({ index: clamped + WEEK_SPAN, animated });
  }, []);

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
    if (!params.addRecipeId) { addRecipeTriggeredRef.current = false; return; }
    if (recipes.length === 0 || addRecipeTriggeredRef.current) return;

    // The picker carries the week the user was viewing. The recipe-picker
    // round-trip can reset weekOffset to the current week, so restore the
    // viewed week first, then wait until its menu is loaded — otherwise the
    // duplicate checks and optimistic insert run against the wrong week.
    const target = parseWeekParam(params.forMenuWeek);
    if (target && (target.weekYear !== weekYear || target.weekNumber !== weekNumber)) {
      goToWeek(weekOffsetForWeek(target.weekYear, target.weekNumber), false);
      return; // re-runs once weekYear/weekNumber match the target
    }
    const lw = loadedWeekRef.current;
    if (!lw || lw.wy !== weekYear || lw.wn !== weekNumber) return; // wait for load()

    const recipe = recipes.find(r => r.id === params.addRecipeId);
    if (recipe) {
      addRecipeTriggeredRef.current = true;
      if (params.replaceMenuItemId) {
        replaceMenuItem(params.replaceMenuItemId, recipe);
      } else {
        const day = (params.day && DAYS.some(d => d.key === params.day) ? params.day : null) as WeekDay | null;
        addRecipeToDay(recipe, day);
      }
      router.setParams({ addRecipeId: undefined, day: undefined, replaceMenuItemId: undefined, forMenuWeek: undefined });
    }
  }, [params.addRecipeId, params.forMenuWeek, recipes, weekYear, weekNumber, menuItems]);

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
      showError(e, str.toasts.errorFetchWeeks);
    }
  }

  useEffect(() => {
    if (!showBulkTransferModal) {
      if (params.originListId) router.setParams({ originListId: undefined });
      setBulkTransferWeek(null);
    }
  }, [showBulkTransferModal, params.originListId]);

  // Pick a recipe for a day by opening the full recipe view in "select" mode,
  // instead of a separate in-menu picker dialog. The recipe screen routes back
  // with ?addRecipeId&day, which the addRecipeId effect below applies to the
  // currently shown week.
  function openPicker(day: WeekDay | null) {
    router.push(`/recipes?forMenuDay=${day ?? 'none'}&forMenuWeek=${weekYear}-${weekNumber}` as never);
  }

  // Replace flow now uses the full recipe view (select mode), like "+".
  function startReplaceRecipe(item: WeekMenuItemWithRecipe) {
    router.push(`/recipes?replaceMenuItemId=${item.id}&replaceTitle=${encodeURIComponent(item.recipe.title)}&forMenuWeek=${weekYear}-${weekNumber}` as never);
  }

  // Swap a menu item for another recipe on the same day/week (returned from the
  // recipe view via ?addRecipeId&replaceMenuItemId).
  async function replaceMenuItem(oldId: string, recipe: RecipeWithIngredients) {
    if (!householdId) return;
    const old = menuItems.find(i => i.id === oldId);
    const day = old?.day ?? null;
    const wy = old?.weekYear ?? weekYear;
    const wn = old?.weekNumber ?? weekNumber;
    // Warn if the replacement recipe is already planned elsewhere this week.
    if (menuItems.some(i => i.id !== oldId && i.recipeId === recipe.id)) {
      const ok = await new Promise<boolean>(resolve =>
        confirm({
          title: str.dialogs.replaceOccupied.title,
          message: str.dialogs.replaceOccupied.message(recipe.title),
          buttons: [
            { label: str.dialogs.replaceOccupied.confirm, onPress: () => resolve(true) },
            { label: common.actions.cancel, style: 'cancel', onPress: () => resolve(false) },
          ],
        })
      );
      if (!ok) return;
    }
    try {
      suppressMenuReloadRef.current += 2; // delete + add — suppress both socket echoes
      await client.deleteWeekMenuItem(oldId);
      const item = await client.addToWeekMenu({ householdId, recipeId: recipe.id, day, weekYear: wy, weekNumber: wn });
      setMenuItems(prev => prev.filter(i => i.id !== oldId).concat(item));
      setAllMenus(prev => prev.filter(i => i.id !== oldId).concat(item));
    } catch (e) {
      showError(e, str.toasts.errorReplace);
    }
  }

  function closePicker() {
    setShowPicker(false);
    setReplaceTarget(null);
  }

  function onDragStart(item: WeekMenuItemWithRecipe, _x: number, y: number, touchOffsetY: number) {
    setDragState({ item, y, touchOffsetY });
  }

  function onDragMove(_x: number, y: number) {
    setDragState(prev => prev ? { ...prev, y } : null);
    // Auto-scroll the menu list when finger nears screen edge
    const screenH = windowHeight;
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
        suppressMenuReloadRef.current += 2; // delete + add — set before any calls so both socket echos are caught
        await client.deleteWeekMenuItem(oldId);
        const item = await client.addToWeekMenu({ householdId, recipeId: recipe.id, day, weekYear, weekNumber });
        setMenuItems(prev => prev.filter(i => i.id !== oldId).concat(item));
        setAllMenus(prev => prev.filter(i => i.id !== oldId).concat(item));
      } catch (e) {
        showError(e, str.toasts.errorReplace);
      }
      return;
    }

    const day = dayOverride !== undefined ? dayOverride : pickingForDay;

    if (day !== null && menuItems.some(i => i.day === day && !pendingMenuItemRemovals.has(i.id))) {
      const dayLabel = DAYS.find(d => d.key === day)?.label ?? day;
      const confirmed = await new Promise<boolean>(resolve =>
        confirm({
          title: str.dialogs.dayOccupied.title,
          message: str.dialogs.dayOccupied.message(dayLabel),
          buttons: [
            { label: str.dialogs.dayOccupied.confirm, onPress: () => resolve(true) },
            { label: common.actions.cancel, style: 'cancel', onPress: () => resolve(false) },
          ],
        })
      );
      if (!confirmed) { closePicker(); return; }
    }

    if (menuItems.some(i => i.recipeId === recipe.id && !pendingMenuItemRemovals.has(i.id))) {
      const confirmed = await new Promise<boolean>(resolve =>
        confirm({
          title: str.dialogs.recipeOccupied.title,
          message: str.dialogs.recipeOccupied.message(recipe.title),
          buttons: [
            { label: str.dialogs.recipeOccupied.confirm, onPress: () => resolve(true) },
            { label: common.actions.cancel, style: 'cancel', onPress: () => resolve(false) },
          ],
        })
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
    setAllMenus(prev => [...prev, optimistic]); // keep snapshot in sync so non-loaded weeks render correctly
    try {
      suppressMenuReloadRef.current += 1;
      const item = await client.addToWeekMenu({ householdId, recipeId: recipe.id, day, weekYear, weekNumber });
      setMenuItems(prev => prev.map(m => m.id === tempId ? item : m));
      setAllMenus(prev => prev.map(m => m.id === tempId ? item : m));
      showToast(str.toasts.recipeAdded);
    } catch (e) {
      setMenuItems(prev => prev.filter(m => m.id !== tempId));
      setAllMenus(prev => prev.filter(m => m.id !== tempId));
      showError(e, str.toasts.errorAddRecipe);
    }
  }

  async function removeFromMenu(item: WeekMenuItemWithRecipe) {
    const ok = await new Promise<boolean>(resolve => {
      confirm({
        title: str.dialogs.removeFromMenu.title,
        message: item.recipe.title,
        buttons: [
          { label: str.dialogs.removeFromMenu.remove, style: 'destructive', onPress: () => resolve(true) },
          { label: common.actions.cancel, style: 'cancel', onPress: () => resolve(false) },
        ],
      });
    });
    if (!ok) return;
    let cancelled = false;
    // Mark as pending — the meal card is hidden immediately (optimistic) since the
    // render filters out pending items; the actual delete commits after the 5s undo
    // window. Register cancel callback so the toast's "Ångra" rolls back this and any
    // other meals in the pending queue (they reappear) with one tap.
    markPending(item.id, () => { cancelled = true; });
    // Show stacked toast: count is current pendingCount + 1 (this call) since state hasn't flushed.
    const upcomingCount = pendingCount + 1;
    showGlobalToast(
      upcomingCount === 1 ? str.toasts.removedSingle : str.toasts.removedMultiple(upcomingCount),
      'neutral',
      { label: str.toasts.undo, onPress: cancelAllPending },
    );
    setTimeout(async () => {
      if (cancelled) return;
      try {
        suppressMenuReloadRef.current += 1;
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
        showError(e, str.toasts.errorRemove);
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
      // Notify other tabs (shopping overview / open list) so they re-render
      // immediately instead of only on next focus.
      emitShoppingChanged();
    } catch (e) {
      showError(e, str.toasts.errorRemoveIngredients);
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
      showError(e, str.toasts.errorCreateList);
    } finally {
      setCreatingList(false);
    }
  }

  async function transferWeekMenu() {
    if (menuItems.length === 0) {
      confirm({ title: str.dialogs.weekEmpty.title, message: str.dialogs.weekEmpty.message, buttons: [{ label: 'OK' }] });
      return;
    }

    const notTransferred = menuItems.filter(m => !transferredMenuItemIds.has(m.id));
    if (notTransferred.length === 0) {
      confirm({ title: str.dialogs.alreadyTransferred.title, message: str.dialogs.alreadyTransferred.message, buttons: [{ label: 'OK' }] });
      return;
    }

    setSelectedRecipesForTransfer(new Set(notTransferred.map(m => m.id)));
    resetInventory();
    setBulkTransferStep('recipe');
    setShowBulkTransferModal(true);
  }

  async function executeBulkTransfer(listId: string) {
    if (selectedRecipesForTransfer.size === 0) {
      confirm({ title: str.dialogs.noSelection.title, message: str.dialogs.noSelection.message, buttons: [{ label: 'OK' }] });
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
        confirm({ title: str.dialogs.allInList.title, message: str.dialogs.allInList.message, buttons: [{ label: 'OK' }] });
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
      showToast(str.toasts.transferred(actuallyTransfer.length));
    } catch (e) {
      setBulkTransferringListId(null);
      showError(e, str.toasts.errorTransfer);
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
      showToast(str.toasts.ingredientsTransferred(recipe.title));
    } catch (e) {
      setTransferringListId(null);
      showError(e, str.toasts.errorTransferIngredients);
    }
  }

  async function moveToDay(item: WeekMenuItemWithRecipe, day: WeekDay | null) {
    // Ignore dishes pending removal (5s undo window) — the user already removed
    // them, so the day shouldn't count as occupied.
    if (day !== null && menuItems.some(i => i.day === day && i.id !== item.id && !pendingMenuItemRemovals.has(i.id))) {
      const dayLabel = DAYS.find(d => d.key === day)?.label ?? day;
      const confirmed = await new Promise<boolean>(resolve =>
        confirm({
          title: str.dialogs.dayOccupiedMove.title,
          message: str.dialogs.dayOccupiedMove.message(dayLabel),
          buttons: [
            { label: str.dialogs.dayOccupiedMove.confirm, onPress: () => resolve(true) },
            { label: common.actions.cancel, style: 'cancel', onPress: () => resolve(false) },
          ],
        })
      );
      if (!confirmed) return;
    }
    setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, day } : i));
    setAllMenus(prev => prev.map(i => i.id === item.id ? { ...i, day } : i));
    suppressMenuReloadRef.current += 1;
    try {
      const updated = await client.updateWeekMenuItem(item.id, { day });
      setMenuItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      setAllMenus(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch (e) {
      setMenuItems(prev => prev.map(i => i.id === item.id ? item : i));
      setAllMenus(prev => prev.map(i => i.id === item.id ? item : i));
      showError(e, str.toasts.errorMove);
    }
  }

  // Items for any page in the week pager. The centre page prefers the live,
  // editable `menuItems` — but only when they actually belong to the current
  // week; right after a week change `menuItems` is still the previous week's
  // data (async reload in flight), so we fall back to the preloaded `allMenus`
  // snapshot. That keeps both neighbours and the just-swiped-to week populated
  // instead of flashing empty/stale.
  const weekItemsForOffset = (o: number): WeekMenuItemWithRecipe[] => {
    const mon = getWeekMonday(o);
    const wk = getISOWeek(mon);
    if (o === weekOffset) {
      const lw = loadedWeekRef.current;
      if (lw != null && lw.wy === wk.weekYear && lw.wn === wk.weekNumber) return menuItems;
    }
    return allMenus.filter(m => m.weekYear === wk.weekYear && m.weekNumber === wk.weekNumber);
  };

  // One week's day-sections + unscheduled + transfer button. Only the centre
  // page is interactive (drag-and-drop, drop-zone measuring, edit/transfer);
  // neighbour pages are read-only previews.
  const renderWeekContent = (weekItems: WeekMenuItemWithRecipe[], weekMon: Date, isCenter: boolean, isPastWeek: boolean) => {
    // Stable order (createdAt, then id) so a day's recipes render identically
    // whether they come from the allMenus snapshot or the live menuItems — no
    // reordering "jump" when swiping between weeks.
    const byCreated = (a: WeekMenuItemWithRecipe, b: WeekMenuItemWithRecipe) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    // Optimistic removal: hide items pending deletion immediately so the card
    // disappears at once. They're still in state until the delete commits, so the
    // toast's "Ångra" restores them.
    const visible = (i: WeekMenuItemWithRecipe) => !pendingMenuItemRemovals.has(i.id);
    const unsched = weekItems.filter(i => i.day === null && visible(i)).sort(byCreated);
    const anyScheduled = weekItems.some(i => i.day !== null && visible(i));
    const noop = () => {};
    const isWide = false;
    return (
      <>
        <View style={isWide ? s.daysRow : s.daysCol}>
          {DAYS.map((day, i) => {
            const items = weekItems.filter(m => m.day === day.key && visible(m)).sort(byCreated);
            const date = new Date(weekMon.getFullYear(), weekMon.getMonth(), weekMon.getDate() + i);
            const isHovered = isCenter && hoverDay === day.key;
            const dragging = isCenter && !!dragState;
            const dayLabel = { abbr: day.short.toLowerCase(), date: date.getDate() };
            const filled = items.length > 0;
            return (
              <View
                key={day.key}
                style={[
                  s.daySlot,
                  isWide && s.daySlotWide,
                  !isWide && filled && s.daySlotFilled,
                  !isWide && !filled && s.daySlotEmpty,
                  isWide && !filled && s.daySlotEmptyWide,
                  dragging && s.daySlotDropTarget,
                  isHovered && s.daySlotHovered,
                ]}
                ref={isCenter ? (ref => measureDaySection(day.key, ref)) : undefined}
                onLayout={isCenter ? (() => measureDaySection(day.key, daySectionRefs.current[day.key] ?? null)) : undefined}
              >
                {isWide ? (
                  // Tablet: column layout — header always visible, content below
                  <>
                    <View style={s.dayColHeader}>
                      <Text style={[s.dayLabelAbbr, !filled && s.dayLabelAbbrMuted, { fontSize: 10 }]}>{dayLabel.abbr}</Text>
                      <Text style={[s.dayLabelDate, !filled && s.dayLabelDateMuted, { fontSize: 13 }]}>{dayLabel.date}</Text>
                    </View>
                    {!filled ? (
                      <Pressable
                        onPress={isCenter && !isPastWeek ? (() => openPicker(day.key)) : noop}
                        style={s.dayColEmptyTap}
                      >
                        {!isPastWeek && <Ionicons name="add" size={18} color="#e2bda1" />}
                      </Pressable>
                    ) : (
                      items.map(item => (
                        <MenuCard
                          key={item.id}
                          item={item}
                          collapsedForDrag={dragging}
                          isTransferred={item.transferred || !!recipeListMap[item.id]?.length}
                          isPending={isCenter && pendingMenuItemRemovals.has(item.id)}
                          isPastWeek={isPastWeek}
                          onRemove={isCenter && !isPastWeek ? (() => removeFromMenu(item)) : noop}
                          onViewRecipe={() => {
                          router.push(`/recipes/${item.recipeId}` as never);
                        }}
                          onMoveToDay={isCenter && !isPastWeek ? (d => moveToDay(item, d)) : noop}
                          onReplace={isCenter && !isPastWeek ? (() => startReplaceRecipe(item)) : noop}
                          onDragStart={isCenter && !isPastWeek ? ((x, y, ty) => onDragStart(item, x, y, ty)) : noop}
                          onDragMove={isCenter ? onDragMove : noop}
                          onDragEnd={isCenter ? onDragEnd : noop}
                          isDragging={isCenter && dragState?.item.id === item.id}
                          scaledServings={scaledServingsOf(item)}
                          onScaleServings={isCenter && !isPastWeek ? (n => scaleServings(item, n)) : noop}
                        />
                      ))
                    )}
                  </>
                ) : (
                  // Phone: existing horizontal layout
                  items.length === 0 ? (
                    <Pressable
                      onPress={isCenter && !isPastWeek ? (() => openPicker(day.key)) : noop}
                      style={s.daySlotEmptyRow}
                    >
                      <View style={[s.dayLabelBox, s.dayLabelBoxMuted, { width: sp(36), height: sp(36) }]}>
                        <Text style={[s.dayLabelAbbr, s.dayLabelAbbrMuted, { fontSize: fs(11) }]}>{dayLabel.abbr}</Text>
                        <Text style={[s.dayLabelDate, s.dayLabelDateMuted, { fontSize: fs(13) }]}>{dayLabel.date}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        {!isPastWeek && <Ionicons name="add" size={fs(22)} color="#a8a29e" />}
                      </View>
                      <View style={{ width: sp(36) }} />
                    </Pressable>
                  ) : (
                    items.map(item => (
                      <MenuCard
                        key={item.id}
                        item={item}
                        dayLabel={dayLabel}
                        collapsedForDrag={dragging}
                        isTransferred={item.transferred || !!recipeListMap[item.id]?.length}
                        isPending={isCenter && pendingMenuItemRemovals.has(item.id)}
                        isPastWeek={isPastWeek}
                        onRemove={isCenter && !isPastWeek ? (() => removeFromMenu(item)) : noop}
                        onViewRecipe={() => {
                          router.push(`/recipes/${item.recipeId}` as never);
                        }}
                        onMoveToDay={isCenter && !isPastWeek ? (d => moveToDay(item, d)) : noop}
                        onReplace={isCenter && !isPastWeek ? (() => startReplaceRecipe(item)) : noop}
                        onDragStart={isCenter && !isPastWeek ? ((x, y, ty) => onDragStart(item, x, y, ty)) : noop}
                        onDragMove={isCenter ? onDragMove : noop}
                        onDragEnd={isCenter ? onDragEnd : noop}
                        isDragging={isCenter && dragState?.item.id === item.id}
                        scaledServings={scaledServingsOf(item)}
                        onScaleServings={isCenter && !isPastWeek ? (n => scaleServings(item, n)) : noop}
                      />
                    ))
                  )
                )}
              </View>
            );
          })}
        </View>

        {/* Unscheduled */}
        <View
          style={[s.section, isCenter && hoverDay === 'unscheduled' && s.sectionHovered]}
          ref={isCenter ? (ref => measureDaySection('unscheduled', ref)) : undefined}
        >
          <View style={s.sectionRow}>
            <Text style={s.sectionLabel}>{str.sections.unscheduled}</Text>
            {isCenter && !isPastWeek && (
              <Pressable onPress={() => openPicker(null)}>
                <Ionicons name="add-circle-outline" size={20} color="#4e7a5e" />
              </Pressable>
            )}
          </View>
          {unsched.length === 0 ? (
            <Text style={s.unscheduledEmpty}>{str.sections.unscheduledHint}</Text>
          ) : (
            unsched.map(item => (
              <MenuCard
                key={item.id}
                item={item}
                collapsedForDrag={isCenter && !!dragState}
                isTransferred={!!recipeListMap[item.id]?.length}
                isPending={isCenter && pendingMenuItemRemovals.has(item.id)}
                isPastWeek={isPastWeek}
                onRemove={isCenter && !isPastWeek ? (() => removeFromMenu(item)) : noop}
                onViewRecipe={() => {
                          router.push(`/recipes/${item.recipeId}` as never);
                        }}
                onMoveToDay={isCenter && !isPastWeek ? (d => moveToDay(item, d)) : noop}
                onReplace={isCenter && !isPastWeek ? (() => startReplaceRecipe(item)) : noop}
                onDragStart={isCenter && !isPastWeek ? ((x, y, ty) => onDragStart(item, x, y, ty)) : noop}
                onDragMove={isCenter ? onDragMove : noop}
                onDragEnd={isCenter ? onDragEnd : noop}
                isDragging={isCenter && dragState?.item.id === item.id}
                scaledServings={scaledServingsOf(item)}
                onScaleServings={isCenter && !isPastWeek ? (n => scaleServings(item, n)) : noop}
              />
            ))
          )}
        </View>

        {!anyScheduled && unsched.length === 0 && (
          <EmptyState
            icon="restaurant-outline"
            title={str.emptyState.noDishesPlanned.title}
            subtitle={isPastWeek ? str.emptyState.noDishesPlanned.subtitlePast : str.emptyState.noDishesPlanned.subtitle}
            actionLabel={isPastWeek ? undefined : str.emptyState.noDishesPlanned.action}
            onAction={isPastWeek ? undefined : () => openPicker(null)}
          />
        )}
      </>
    );
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4e7a5e" /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView style={s.container}>
      <ScreenHeader
        title={str.title}
        actionNode={
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Pressable ref={templatesBtnRef} style={[s.headerIconBtn, { paddingHorizontal: sp(10), paddingVertical: sp(7) }]} onPress={() => setShowTemplates(true)} accessibilityLabel={str.a11y.templates}>
              <Ionicons name="bookmarks-outline" size={fs(18)} color="#4e7a5e" />
            </Pressable>
            <View ref={recipesBtnRef} collapsable={false}>
              <Pressable style={[s.headerActionBtn, { paddingHorizontal: sp(12), paddingVertical: sp(7) }]} onPress={() => router.push('/recipes' as never)}>
                <Ionicons name="book-outline" size={fs(16)} color="#4e7a5e" />
                <Text style={[s.headerActionText, { fontSize: fs(13) }]}>{str.a11y.recipesTab}</Text>
              </Pressable>
            </View>
          </View>
        }
      />
      <WeekNav
        weekLabel={weekLabel}
        isCurrentWeek={weekOffset === 0}
        isPastWeek={weekOffset < 0}
        onPrev={() => goToWeek(weekOffset - 1, true)}
        onNext={() => goToWeek(weekOffset + 1, true)}
        onToday={() => goToWeek(0, true)}
        onPickDate={() => setShowWeekPicker(true)}
      />

      {/* Virtualised week pager: each page is one week. Swiping just scrolls the
          list (no recenter → no flash); arrows/Idag/picker scrollToIndex so they
          behave identically. Locked while dragging/editing so drag-and-drop
          doesn't fight the swipe. Only the centred week is interactive. */}
      <FlatList
        ref={weekListRef}
        data={weekIndices}
        keyExtractor={o => String(o)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={[s.content, (Platform.OS === 'web' ? { scrollSnapType: 'x mandatory' } : null) as any]}
        scrollEnabled={!dragState}
        initialScrollIndex={weekOffset + WEEK_SPAN}
        getItemLayout={(_, index) => ({ length: weekPageW, offset: weekPageW * index, index })}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        scrollEventThrottle={16}
        extraData={{ weekOffset, menuItems, allMenus, recipeListMap, dragState, hoverDay, menuItemServings, pendingMenuItemRemovals }}
        onScrollToIndexFailed={() => {}}
        onMomentumScrollEnd={e => {
          const o = Math.round(e.nativeEvent.contentOffset.x / weekPageW) - WEEK_SPAN;
          if (o !== weekOffset) setWeekOffset(o);
        }}
        onScroll={Platform.OS === 'web' ? e => {
          const x = e.nativeEvent.contentOffset.x;
          if (weekScrollTimer.current) clearTimeout(weekScrollTimer.current);
          weekScrollTimer.current = setTimeout(() => {
            const o = Math.round(x / weekPageW) - WEEK_SPAN;
            if (o !== weekOffset) setWeekOffset(o);
          }, 80);
        } : undefined}
        renderItem={({ item: o }) => {
          const isCenter = o === weekOffset;
          return (
            <ScrollView
              ref={isCenter ? menuScrollRef : undefined}
              style={{ width: weekPageW }}
              {...((Platform.OS === 'web' ? { dataSet: { weekpage: '' } } : {}) as any)}
              contentContainerStyle={[s.contentInner, isTablet && s.contentInnerTablet]}
              refreshControl={isCenter ? <RefreshControl refreshing={false} onRefresh={load} /> : undefined}
              onScroll={isCenter ? (e => { scrollOffsetY.current = e.nativeEvent.contentOffset.y; }) : undefined}
              scrollEventThrottle={32}
            >
              {renderWeekContent(weekItemsForOffset(o), getWeekMonday(o), isCenter, o < 0)}
            </ScrollView>
          );
        }}
      />


      {/* Overför-FAB (kundkorg) — visas bara för nuvarande/framtida veckor
          när minst en rätt inte är överförd än. */}
      {!dragState && weekOffset >= 0 && menuItems.some(m => !recipeListMap[m.id]?.length) && (
        <Pressable ref={cartFabRef} style={[s.fab, { width: sp(56), height: sp(56), borderRadius: sp(28) }]} onPress={transferWeekMenu} accessibilityLabel={str.a11y.transferFab}>
          <Ionicons name="cart-outline" size={fs(26)} color="#fff" />
        </Pressable>
      )}
      {/* Mall-FAB — visas för gamla veckor med rätter så de lätt kan sparas som mall */}
      {!dragState && weekOffset < 0 && menuItems.length > 0 && (
        <Pressable style={[s.fab, { width: sp(56), height: sp(56), borderRadius: sp(28) }]} onPress={() => setShowTemplates(true)} accessibilityLabel={str.a11y.saveWeekAsTemplate}>
          <Ionicons name="bookmark-outline" size={fs(24)} color="#fff" />
        </Pressable>
      )}

      {/* Drag ghost card — full width, vertical-only movement */}
      {dragState && (
        <View
          pointerEvents="none"
          style={[s.ghostCard, { top: dragState.y - dragState.touchOffsetY }]}
        >
          <View style={s.ghostCardIcon}>
            <Ionicons name="restaurant-outline" size={18} color="#4e7a5e" />
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
        readOnly={weekOffset < 0}
        onApplied={load}
      />

      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={closePicker}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={closePicker} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />

          {pickerStep === 'day' ? (
            <>
              <Text style={s.sheetTitle}>{str.picker.chooseDay}</Text>
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
                  <Text style={[s.dayGridLabel, s.dayGridLabelNone]}>{str.picker.noDay}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <View style={s.sheetTitleRow}>
                {!replaceTarget && (
                  <Pressable onPress={() => setPickerStep('day')} style={s.backBtn}>
                    <Ionicons name="chevron-back" size={20} color="#4e7a5e" />
                  </Pressable>
                )}
                <Text style={s.sheetTitle}>
                  {replaceTarget
                    ? str.picker.replaceTitle(replaceTarget.recipe.title)
                    : pickingForDay
                      ? DAYS.find(d => d.key === pickingForDay)?.label
                      : str.picker.noDay}
                </Text>
              </View>
              {recipes.length === 0 ? (
                <View style={s.pickerEmpty}>
                  <Text style={s.pickerEmptyText}>{str.picker.noRecipesYet}</Text>
                  <Pressable style={s.pickerEmptyBtn} onPress={() => { setShowPicker(false); router.push('/recipes' as never); }}>
                    <Text style={s.pickerEmptyBtnText}>{str.picker.goToRecipes}</Text>
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
                        router.push(`/recipes?create=1&forMenuDay=${day}&forMenuWeek=${weekYear}-${weekNumber}` as never);
                      }}
                    >
                      <View style={[s.recipeCardIcon, { backgroundColor: '#ecf3ec' }]}>
                        <Ionicons name="add" size={20} color="#4e7a5e" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.recipeCardTitle, { color: '#4e7a5e' }]}>{str.picker.createNewRecipe}</Text>
                      </View>
                    </Pressable>
                  }
                  renderItem={({ item }) => (
                    <Pressable style={s.recipeCard} onPress={() => {
                      if (replaceTarget) {
                        confirm({
                          title: str.dialogs.replaceRecipe.title,
                          message: str.dialogs.replaceRecipe.message(replaceTarget.recipe.title, item.title),
                          buttons: [
                            { label: str.dialogs.replaceRecipe.confirm, style: 'destructive', onPress: () => addRecipeToDay(item) },
                            { label: common.actions.cancel, style: 'cancel' },
                          ],
                        });
                      } else {
                        addRecipeToDay(item);
                      }
                    }}>
                      <View style={s.recipeCardIcon}>
                        <Ionicons name="restaurant-outline" size={20} color="#4e7a5e" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.recipeCardTitle}>{item.title}</Text>
                        <Text style={s.recipeCardMeta}>{recipesStr.card.meta(item.servings, item.ingredients.length)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#d6d3d1" />
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
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => setCleanupPrompt(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{str.dialogs.removeFromShoppingList.title}</Text>
          {cleanupPrompt ? (
            <Text style={s.cleanupSub}>{str.dialogs.removeFromShoppingList.subtitle}</Text>
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
                    color={selected ? '#4e7a5e' : '#a8a29e'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.cleanupListName}>{l.listName}</Text>
                    <Text style={s.cleanupItemCount}>{str.cleanup.listIngredientsCount(l.itemCount)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={s.cleanupActions}>
            <Pressable style={s.cleanupCancel} onPress={() => setCleanupPrompt(null)}>
              <Text style={s.cleanupCancelText}>{str.dialogs.removeFromShoppingList.keep}</Text>
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
              <Text style={s.cleanupConfirmText}>{str.dialogs.removeFromShoppingList.removeFromSelected}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {/* Transfer to shopping list modal */}
      <Modal visible={!!transferSheet} transparent animationType="slide" onRequestClose={() => setTransferSheet(null)}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => setTransferSheet(null)} />
        <KeyboardAvoidingView behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{str.bulk.chooseShoppingList}</Text>
          {shoppingLists.length === 0 ? (
            <>
              <Text style={s.pickerEmptyText}>{str.bulk.noActiveList}</Text>
              <View style={s.createListRow}>
                <TextInput
                  style={[s.input, { flex: 1, marginTop: 0 }]}
                  placeholder={str.bulk.newListNamePlaceholder}
                  placeholderTextColor="#a8a29e"
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
                    : <Text style={s.createListBtnText}>{str.bulk.create}</Text>}
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
                  <Text style={s.pickerItemMeta}>{str.bulk.itemsCount(l.items.length)}</Text>
                </View>
                {transferringListId === l.id && <ActivityIndicator size="small" color="#4e7a5e" />}
              </Pressable>
            ))
          )}
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Bulk transfer modal — choose recipes and list */}
      <Modal visible={showBulkTransferModal} transparent animationType="slide" onRequestClose={() => handleBulkBack()}>
        {/* RN Modal är ett eget native-fönster utanför appens GestureHandlerRootView
            — utan en egen rotvy här registreras aldrig sliderns pan/tap-gester. */}
        <GestureHandlerRootView style={{ flex: 1 }}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => handleCancelBulkTransfer()} />
        <KeyboardAvoidingView
          behavior={kavBehavior}
          // Inventerings-steget hanterar tangentbordet själv via inre ScrollView
          // — annars hoppar Nästa-/Tillbaka-knapparna upp ovanför tangentbordet.
          enabled={bulkTransferStep !== 'ingredients'}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}
         
        >
        <View style={s.sheet}>
          <View style={s.sheetHandle} />

          {bulkTransferStep === 'week' ? (
            <>
              <Text style={s.sheetTitle}>{str.bulk.chooseWeekMenu}</Text>
              <Text style={s.sheetSub}>{str.bulk.chooseWeekMenuSub}</Text>
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
                    return <Text style={s.pickerEmptyText}>{str.bulk.noActiveWeek}</Text>;
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
                        <Ionicons name="calendar-outline" size={22} color="#4e7a5e" />
                        <View style={{ flex: 1 }}>
                          <Text style={s.bulkRecipeTitle}>{str.bulk.weekLabel(wn, wy)}</Text>
                          <Text style={s.bulkRecipeDay}>
                            {str.bulk.dishesCount(items.length)}
                            {destList ? ` · ${allTransferred ? str.bulk.allAlreadyAdded : str.bulk.newCount(newCount)}` : ''}
                          </Text>
                        </View>
                        {!allTransferred && <Ionicons name="chevron-forward" size={20} color="#a8a29e" />}
                      </Pressable>
                    );
                  });
                })()}
              </ScrollView>
            </>
          ) : bulkTransferStep === 'recipe' ? (
            <>
              <Text style={s.sheetTitle}>{str.bulk.chooseDishes}</Text>
              <Text style={s.sheetSub}>{bulkTransferWeek ? str.bulk.weekLabel(bulkTransferWeek.weekNumber, bulkTransferWeek.weekYear) : str.bulk.chooseDishesSub}</Text>
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
                          color={selected ? '#4e7a5e' : '#a8a29e'}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={s.bulkRecipeTitle} numberOfLines={1}>{item.recipe.title}</Text>
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
                <Text style={s.buttonText}>{str.bulk.next}</Text>
              </Pressable>
            </>
          ) : bulkTransferStep === 'ingredients' ? (
            <>
              <Text style={s.sheetTitle}>{str.bulk.whatDoYouHave}</Text>
              <Text style={s.invSub}>
                {str.bulk.haveHint}
              </Text>
              <ScrollView
                style={{ maxHeight: invMaxListH, marginBottom: 12 }}
                keyboardShouldPersistTaps="handled"
              >
                {aggregatedInventory.map(agg => renderInventoryRow(agg))}
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
                <Text style={s.buttonText}>{params.originListId ? str.bulk.transfer : str.bulk.next}</Text>
              </Pressable>
              <Pressable style={s.cancelBtn} onPress={() => setBulkTransferStep('recipe')}>
                <Text style={s.cancelBtnText}>{str.bulk.back}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={s.sheetTitle}>{str.bulk.chooseShoppingList}</Text>
              <Text style={s.sheetSub}>{str.bulk.dishesToTransfer(selectedRecipesForTransfer.size)}</Text>
              {shoppingLists.length === 0 ? (
                <>
                  <Text style={s.pickerEmptyText}>{str.bulk.noActiveList}</Text>
                  <View style={s.createListRow}>
                    <TextInput
                      style={[s.input, { flex: 1, marginTop: 0 }]}
                      placeholder={str.bulk.newListNamePlaceholder}
                      placeholderTextColor="#a8a29e"
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
                        : <Text style={s.createListBtnText}>{str.bulk.create}</Text>}
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
                        <Text style={s.pickerItemMeta}>{str.bulk.itemsCount(l.items.length)}</Text>
                      </View>
                      {bulkTransferringListId === l.id && <ActivityIndicator size="small" color="#4e7a5e" />}
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <Pressable
                style={[s.button, { backgroundColor: '#e7e5e4' }]}
                onPress={() => setBulkTransferStep('ingredients')}
              >
                <Text style={[s.buttonText, { color: '#44403c' }]}>{str.bulk.back}</Text>
              </Pressable>
            </>
          )}
        </View>
        </KeyboardAvoidingView>
        </GestureHandlerRootView>
      </Modal>

      <DatePickerModal
        visible={showWeekPicker}
        value={null}
        title={str.weekPicker.title}
        onChange={(dateStr) => {
          if (!dateStr) return;
          const picked = new Date(dateStr + 'T00:00:00');
          const day = picked.getDay();
          picked.setDate(picked.getDate() + (day === 0 ? -6 : 1 - day));
          const todayMonday = getWeekMonday(0);
          const diffWeeks = Math.round((picked.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
          goToWeek(diffWeeks, false);
          setShowWeekPicker(false);
        }}
        onClose={() => setShowWeekPicker(false)}
      />

      <RNAnimated.View style={[s.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={s.toastText}>{toastMessage}</Text>
      </RNAnimated.View>
      </SafeAreaView>
    </View>
  );
}

function MenuCard({
  item,
  isTransferred,
  isPending,
  isPastWeek,
  onRemove,
  onViewRecipe,
  onReplace,
  onMoveToDay,
  onDragStart,
  onDragMove,
  onDragEnd,
  isDragging,
  scaledServings,
  onScaleServings,
  dayLabel,
  collapsedForDrag,
}: {
  item: WeekMenuItemWithRecipe;
  isTransferred: boolean;
  isPending?: boolean;
  isPastWeek?: boolean;
  dayLabel?: { abbr: string; date: number };
  onRemove: () => void;
  onViewRecipe: () => void;
  onMoveToDay: (day: WeekDay | null) => void;
  onReplace: () => void;
  onDragStart: (x: number, y: number, touchOffsetY: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  scaledServings: number;
  onScaleServings: (n: number) => void;
  collapsedForDrag?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // While any card is being dragged, collapse every card so the list is compact.
  // Also clear the expanded state so cards stay collapsed after the move.
  const isExpanded = expanded && !collapsedForDrag;
  useEffect(() => { if (collapsedForDrag) setExpanded(false); }, [collapsedForDrag]);
  const { medium } = useHaptics();
  const { fs, sp } = useTablet();

  // Pan gesture for drag — use only onFinalize to avoid double-fire
  const panGesture = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart(e => {
      runOnJS(medium)();
      runOnJS(onDragStart)(e.absoluteX, e.absoluteY, e.y);
    })
    .onUpdate(e => {
      runOnJS(onDragMove)(e.absoluteX, e.absoluteY);
    })
    .onFinalize(() => {
      runOnJS(onDragEnd)();
    });

  function handlePress() {
    setExpanded(e => !e);
  }

  // På web sätter RNGH:s GestureDetector `touch-action: none` på kortet, vilket
  // blockerar webbläsarens horisontella sid-svep (kan inte byta vecka när det
  // ligger maträtter). Drag-flytt finns bara på native; på web renderas kortet
  // utan GestureDetector och flytt görs via dag-chipsen i utfällda vyn.
  const isWeb = Platform.OS === 'web';
  const cardBody = (
      <View style={[s.card, isDragging && s.cardDragging, isPending && s.cardPending]}>
        <View style={s.cardInner}>
          <Pressable style={[s.cardMain, { padding: sp(14), gap: sp(12) }]} onPress={handlePress}>
            {dayLabel ? (
              <View style={[s.dayLabelBox, { width: sp(36), height: sp(36) }]}>
                <Text style={[s.dayLabelAbbr, { fontSize: fs(11) }]}>{dayLabel.abbr}</Text>
                <Text style={[s.dayLabelDate, { fontSize: fs(13) }]}>{dayLabel.date}</Text>
              </View>
            ) : (
              <View style={[s.cardIcon, { width: sp(30), height: sp(30) }]}>
                <Ionicons name="restaurant-outline" size={fs(16)} color="#4e7a5e" />
              </View>
            )}
            <View style={s.cardContent}>
              <Text style={[s.cardTitle, { fontSize: fs(16) }, isPending && s.cardTitlePending]} numberOfLines={isExpanded ? undefined : 1}>{item.recipe.title}</Text>
            </View>
            {isTransferred && (
              <Ionicons name="cart" size={fs(16)} color="#10b981" />
            )}
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={fs(16)} color="#a8a29e" />
          </Pressable>

          {isExpanded && (
            <View style={s.cardExpanded}>
              {/* Meta — moved here to keep the collapsed row to a single line */}
              <Text style={[s.cardMeta, { fontSize: fs(12), marginBottom: sp(4) }]}>
                {scaledServings !== item.recipe.servings
                  ? str.card.servings(scaledServings, item.recipe.servings)
                  : str.card.servingsOnly(item.recipe.servings)}
                {' · '}{str.card.ingredientsCount(item.recipe.ingredients.length)}
              </Text>
              {isTransferred && (
                <View style={[s.transferredBadge, { marginBottom: sp(8) }]}>
                  <Ionicons name="cart" size={fs(14)} color="#10b981" />
                  <Text style={[s.transferredText, { fontSize: fs(11) }]}>{str.card.inShoppingList}</Text>
                </View>
              )}
              {/* Portion scaler — cutlery icon grouped with the −/+ on the right */}
              <View style={s.servingScaler}>
                <Ionicons name="restaurant-outline" size={fs(16)} color="#78716c" />
                <View style={s.servingScalerControls}>
                  <Pressable
                    onPress={() => onScaleServings(Math.max(1, scaledServings - 1))}
                    style={s.servingScalerBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="remove" size={14} color="#4e7a5e" />
                  </Pressable>
                  <Text style={s.servingScalerValue}>{scaledServings}</Text>
                  <Pressable
                    onPress={() => onScaleServings(scaledServings + 1)}
                    style={s.servingScalerBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="add" size={14} color="#4e7a5e" />
                  </Pressable>
                </View>
              </View>

              <View style={s.cardActions}>
                <Pressable style={s.cardAction} onPress={onViewRecipe}>
                  <Ionicons name="open-outline" size={15} color="#78716c" />
                  <Text style={s.cardActionText}>{str.card.show}</Text>
                </Pressable>
                {!isPastWeek && (
                  <Pressable style={s.cardAction} onPress={onReplace}>
                    <Ionicons name="swap-horizontal-outline" size={15} color="#78716c" />
                    <Text style={s.cardActionText}>{str.card.replace}</Text>
                  </Pressable>
                )}
                {!isPastWeek && (
                  <Pressable style={s.cardAction} onPress={onRemove}>
                    <Ionicons name="trash-outline" size={15} color="#ef4444" />
                    <Text style={[s.cardActionText, { color: '#ef4444' }]}>{str.card.remove}</Text>
                  </Pressable>
                )}
              </View>

              {/* Web saknar drag (touch-action) → flytta via dag-chips i stället */}
              {isWeb && !isPastWeek && (
                <View style={s.moveRow}>
                  <Text style={s.moveLabel}>{str.card.moveToDay}</Text>
                  <View style={s.moveChips}>
                    {DAYS.map(d => {
                      const active = item.day === d.key;
                      return (
                        <Pressable
                          key={d.key}
                          style={[s.moveChip, active && s.moveChipActive]}
                          onPress={() => { if (!active) onMoveToDay(d.key); }}
                        >
                          <Text style={[s.moveChipText, active && s.moveChipTextActive]}>{d.short}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
  );

  return isWeb ? cardBody : <GestureDetector gesture={panGesture}>{cardBody}</GestureDetector>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf8f3' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ecf3ec', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  headerActionText: { fontWeight: '600', color: '#4e7a5e', fontSize: 13 },
  headerIconBtn: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#ecf3ec', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  invSub: { fontSize: 13, color: '#78716c', textAlign: 'left', marginTop: 12, marginBottom: 10, lineHeight: 18 },
  // En rad i den nya inventerings-vyn: namn + behov till vänster, "Har"-input
  // + ✓ Allt-knapp till höger. Allt på samma rad, ingen mode-toggle.
  invRowV2: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1efec', gap: 6 },
  invRowCol: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1efec', gap: 4 },
  invName: { fontSize: 15, color: '#292524', fontWeight: '500' },
  invNameDone: { color: '#a8a29e', textDecorationLine: 'line-through' },
  invProvenance: { fontSize: 12, color: '#a8a29e', marginTop: 2 },
  // minWidth = baseline; växer automatiskt om enheten är lång (paket, påse…)
  // så enheten alltid syns helt. paddingHorizontal lite mindre för att inte
  // knappen ska bli onödigt bred.
  invRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Explicit minWidth (beräknas per label) — Android mäter vissa strängar
  // ("kg", "dl", "tsk") för smalt och klipper annars sista glyfen.
  invValue: { fontSize: 14, color: '#4e7a5e', fontWeight: '700' },
  invSliderTrack: { height: 26, justifyContent: 'center', marginTop: 2 },
  invSliderRail: { position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: '#e7e5e4' },
  invSliderFill: { position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: '#4e7a5e' },
  invSliderThumb: { position: 'absolute', left: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', borderWidth: 2, borderColor: '#4e7a5e', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  // Default-läge: NEUTRAL grå/vit så knappen INTE ser tryckt ut. Aktivt läge
  // (tryckt) blir grön + ifylld.
  invAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: '#e7e5e4', backgroundColor: '#fff' },
  invAllBtnOn: { backgroundColor: '#10b981', borderColor: '#10b981' },
  invAllBtnText: { fontSize: 12, fontWeight: '700', color: '#78716c' },
  invAllBtnTextOn: { color: '#fff' },
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 2, paddingBottom: 80 },
  contentInnerTablet: { padding: 8, gap: 2 },
  daysRow: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  daysCol: { gap: 2 },
  daySlotWide: { flex: 1, minWidth: 0, minHeight: 80 },
  daySlotEmptyWide: { borderStyle: 'dashed', borderColor: '#d6d3d1', backgroundColor: 'transparent' },
  dayColHeader: { alignItems: 'center', paddingTop: 4, paddingBottom: 2 },
  dayColEmptyTap: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  section: { gap: 2 },
  dayLabelBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#ecf3ec', alignItems: 'center', justifyContent: 'center' },
  dayLabelAbbr: { fontSize: 11, fontWeight: '800', color: '#b96a45', letterSpacing: 0.3 },
  dayLabelDate: { fontSize: 13, fontWeight: '700', color: '#4e7a5e' },
  dayLabelBoxMuted: { backgroundColor: '#f1efec' },
  dayLabelAbbrMuted: { color: '#a8a29e' },
  dayLabelDateMuted: { color: '#78716c' },
  daySlotEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, minHeight: 44, alignSelf: 'stretch' },
  daySlot: { borderWidth: 1, borderColor: '#c6ddcd', borderRadius: 12, padding: 6, gap: 3, backgroundColor: '#fff' },
  daySlotEmpty: { borderStyle: 'dashed', borderColor: '#d6d3d1', backgroundColor: 'transparent', minHeight: 64, alignItems: 'center', justifyContent: 'center', padding: 0 },
  daySlotFilled: { borderWidth: 0, padding: 0, backgroundColor: 'transparent' },
  daySlotDropTarget: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#c6ddcd', borderRadius: 12, padding: 6, backgroundColor: '#faf8f3' },
  daySlotHovered: { borderWidth: 1.5, borderStyle: 'solid', borderColor: '#4e7a5e', backgroundColor: '#ecf3ec' },
  daySlotEmptyTap: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#b96a45', letterSpacing: 0.8 },
  dayHeader: { gap: 1 },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 14, fontWeight: '700', color: '#292524' },
  dayDate: { fontSize: 11, color: '#78716c' },
  unscheduledEmpty: { fontSize: 13, color: '#a8a29e', paddingVertical: 8 },
  emptyDayText: { fontSize: 13, color: '#a8a29e', paddingVertical: 8 },
  emptyDayTap: { paddingVertical: 4, alignItems: 'flex-start' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4e7a5e', alignItems: 'center', justifyContent: 'center', shadowColor: '#4e7a5e', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  card: { borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#c6ddcd', backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardInner: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  cardMain: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  cardIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#ecf3ec', alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#292524' },
  cardMeta: { fontSize: 12, color: '#78716c', marginTop: 2 },
  transferredBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  transferredText: { fontSize: 11, color: '#10b981', fontWeight: '600' },
  cardExpanded: { borderTopWidth: 1, borderTopColor: '#f1efec', paddingHorizontal: 14, paddingBottom: 12 },
  servingScaler: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 12, paddingBottom: 4 },
  servingScalerLabel: { fontSize: 13, color: '#78716c', fontWeight: '500' },
  servingScalerControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  servingScalerBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#ecf3ec', alignItems: 'center', justifyContent: 'center' },
  servingScalerValue: { fontSize: 15, fontWeight: '700', color: '#292524', minWidth: 24, textAlign: 'center' },
  servingScalerReset: { fontSize: 12, color: '#a8a29e', textDecorationLine: 'underline' },
  cardActions: { flexDirection: 'row', gap: 0, paddingTop: 10, pointerEvents: 'auto' },
  moveRow: { paddingTop: 10, gap: 6 },
  moveLabel: { fontSize: 12, fontWeight: '600', color: '#78716c' },
  moveChips: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  moveChip: { flexGrow: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e7e5e4', backgroundColor: '#faf8f3' },
  moveChipActive: { borderColor: '#4e7a5e', backgroundColor: '#ecf3ec' },
  moveChipText: { fontSize: 12, color: '#78716c', fontWeight: '500' },
  moveChipTextActive: { color: '#4e7a5e', fontWeight: '700' },
  cardAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, pointerEvents: 'auto' },
  cardActionText: { fontSize: 12, color: '#78716c', fontWeight: '500' },
  assignDayRow: { marginTop: 8, gap: 6 },
  assignDayLabel: { fontSize: 12, color: '#a8a29e' },
  assignDayBtns: { flexDirection: 'row', gap: 6 },
  assignDayBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1efec' },
  assignDayBtnActive: { backgroundColor: '#4e7a5e' },
  assignDayBtnText: { fontSize: 12, color: '#44403c', fontWeight: '500' },
  assignDayBtnTextActive: { color: '#fff', fontWeight: '600' },
  // Dim på eget absolut lager så det täcker bakom sheetens rundade hörn.
  overlay: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e7e5e4', alignSelf: 'center', marginBottom: 12 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#292524', marginBottom: 16 },
  sheetSub: { fontSize: 13, color: '#78716c', marginTop: -10, marginBottom: 12 },
  backBtn: { padding: 4, marginBottom: 16 },
  bulkRecipeList: { maxHeight: 400, marginBottom: 12 },
  bulkRecipeItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#faf8f3', borderWidth: 1, borderColor: '#e7e5e4', marginBottom: 6 },
  bulkRecipeItemActive: { backgroundColor: '#ecf3ec', borderColor: '#4e7a5e' },
  bulkRecipeTitle: { fontSize: 15, fontWeight: '600', color: '#292524' },
  bulkRecipeDay: { fontSize: 12, color: '#78716c', marginTop: 2 },
  dayGrid: { gap: 10 },
  dayGridItem: { paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#f1efec', borderRadius: 12 },
  dayGridItemNone: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e7e5e4' },
  dayGridLabel: { fontSize: 15, fontWeight: '600', color: '#292524' },
  dayGridLabelNone: { color: '#a8a29e' },
  pickerList: { maxHeight: 480 },
  recipeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f1efec' },
  recipeCardIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#faf8f3', alignItems: 'center', justifyContent: 'center' },
  recipeCardTitle: { fontSize: 15, fontWeight: '600', color: '#292524' },
  recipeCardMeta: { fontSize: 12, color: '#78716c', marginTop: 2 },
  pickerItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1efec', flexDirection: 'row', alignItems: 'center' },
  pickerItemDisabled: { opacity: 0.5 },
  pickerItemTitle: { fontSize: 16, fontWeight: '600', color: '#292524' },
  pickerItemMeta: { fontSize: 13, color: '#78716c', marginTop: 2 },
  pickerEmpty: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  pickerEmptyText: { fontSize: 14, color: '#78716c', textAlign: 'center' },
  pickerEmptyBtn: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#4e7a5e', borderRadius: 8 },
  pickerEmptyBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  createListRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 8 },
  createListBtn: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#4e7a5e', borderRadius: 10 },
  createListBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
  cleanupSub: { fontSize: 13, color: '#78716c', marginTop: -10 },
  cleanupList: { gap: 8 },
  cleanupItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: '#faf8f3', borderWidth: 1, borderColor: '#e7e5e4' },
  cleanupItemActive: { backgroundColor: '#ecf3ec', borderColor: '#4e7a5e' },
  cleanupListName: { fontSize: 15, fontWeight: '600', color: '#292524' },
  cleanupItemCount: { fontSize: 12, color: '#78716c', marginTop: 2 },
  cleanupActions: { flexDirection: 'row', gap: 12 },
  cleanupCancel: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#e7e5e4' },
  cleanupCancelText: { fontSize: 15, fontWeight: '600', color: '#44403c' },
  cleanupConfirm: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: '#ef4444' },
  cleanupConfirmDisabled: { opacity: 0.4 },
  cleanupConfirmText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  pickerDivider: { height: 1, backgroundColor: '#e7e5e4', marginVertical: 12 },
  newListLabel: { fontSize: 13, fontWeight: '600', color: '#78716c', marginTop: 8, marginBottom: 8 },
  newListRow: { flexDirection: 'row', gap: 10 },
  newListSection: { paddingVertical: 24, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: '#f1efec', marginTop: 24 },
  newListBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#ecf3ec', borderRadius: 12, borderWidth: 1, borderColor: '#c6ddcd' },
  newListBtnDisabled: { backgroundColor: '#f1efec', borderColor: '#e7e5e4' },
  newListBtnText: { fontSize: 16, fontWeight: '600', color: '#4e7a5e' },
  newListBtnTextDisabled: { color: '#a8a29e' },
  input: { borderWidth: 1, borderColor: '#e7e5e4', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#faf8f3' },
  button: { backgroundColor: '#4e7a5e', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minWidth: 44 },
  cancelBtn: { paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, color: '#78716c', fontWeight: '500' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.4 },
  // Edit mode
  sectionHovered: { backgroundColor: '#ecf3ec', borderRadius: 12, borderWidth: 1, borderColor: '#4e7a5e' },
  cardDragging: { opacity: 0.4 },
  cardPending: { opacity: 0.4, backgroundColor: '#fef2f2' },
  cardTitlePending: { textDecorationLine: 'line-through', color: '#a8a29e' },
  cardDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: '#fff', borderRadius: 11 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', paddingHorizontal: 32, paddingVertical: 14, backgroundColor: '#292524', borderRadius: 24, zIndex: 20 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ghostCard: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, elevation: 10, zIndex: 100 },
  ghostCardIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#ecf3ec', alignItems: 'center', justifyContent: 'center' },
  ghostCardText: { fontSize: 15, fontWeight: '600', color: '#292524', flex: 1 },
  toast: { position: 'absolute', bottom: 32, alignSelf: 'center', backgroundColor: '#34d399', borderRadius: 24, paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
