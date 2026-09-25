import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTheme } from '../../src/context/ThemeContext';
import type { Palette } from '../../src/lib/theme';
import {
  ActivityIndicator,
  AppState,
  Animated as RNAnimated,
  FlatList,
  Image,
  type GestureResponderEvent,
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
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useApiClient, type WeekMenuItemWithRecipe, type RecipeWithIngredients, type ShoppingListWithItems } from '../../src/api/client';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useAuth } from '@clerk/expo';
import { useHouseholdSocket } from '../../src/hooks/useHouseholdSocket';
import { usePendingRemoval } from '../../src/context/PendingRemovalContext';
import { getISOWeek, addWeeks, getISOWeekMonday } from '../../src/lib/week';
import { useHaptics } from '../../src/hooks/useHaptics';
import { useTablet } from '../../src/hooks/useTablet';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { consumeSpotlight } from '../../src/lib/spotlightRequest';
import { EmptyState } from '../../src/components/EmptyState';
import { DraggableBottomSheet } from '../../src/components/DraggableBottomSheet';
import { SHEET_HEADER_ICON } from '../../src/components/SheetHeader';
import { useSheetLift } from '../../src/hooks/useSheetLift';
import { MenuTemplatesModal } from '../../src/components/MenuTemplatesModal';
import { onShoppingChanged, emitShoppingChanged } from '../../src/lib/shoppingEvents';
import { WeekNav } from '../../src/components/WeekNav';
import { useDesign } from '../../src/context/DesignContext';
import { nyFont, type NyPalett } from '../../src/lib/nyDesign';
import { NyHeader, NyIkonKnapp } from '../../src/components/nydesign/NyHeader';
import { ReceptBild } from '../../src/components/ReceptBild';
import { platshallare } from '../../src/lib/receptPlatshallare';
import { DatePickerModal } from '../../src/components/DatePickerModal';
import type { WeekDay, MealType } from '@veckis/shared';
import { DEFAULT_CATEGORY_ORDER, MEAL_TYPE_ORDER } from '@veckis/shared';
import { menu as str, common, recipes as recipesStr } from '../../src/lib/svenska';
import { formateraTidsetikett } from '../../src/lib/cookTimer';

// _stableKey håller React-nyckeln konstant genom optimistiska tillägg: när
// temp-ID:t (satt vid lokal infogning) byts mot serverns riktiga ID ser React
// annars ut som att ett kort tas bort och ett nytt läggs till → in/ut-
// animationerna kolliderar synligt ("blinket" vid ta bort + lägg till samma
// dag). Med samma _stableKey hela vägen tolkas det som en uppdatering av
// SAMMA kort istället.
type MenuRow = WeekMenuItemWithRecipe & { _stableKey?: string };

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
  const { colors: c, ny } = useTheme();
  const s = useMemo(() => makeStyles(c, ny), [c, ny]);
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
  const { colors: c, ny } = useTheme();
  const s = useMemo(() => makeStyles(c, ny), [c, ny]);
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
          <Ionicons name="checkmark" size={15} color={covered ? ny.skog : ny.textDampad} />
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
  const { colors: c, ny } = useTheme();
  const s = useMemo(() => makeStyles(c, ny), [c, ny]);
  const router = useRouter();
  const params = useLocalSearchParams<{ bulkTransfer?: string; originListId?: string; addRecipeId?: string; day?: string; replaceMenuItemId?: string; forMenuWeek?: string; reqId?: string }>();
  const addRecipeTriggeredRef = useRef(false);
  // Håller VILKEN reqId som senast applicerades — aldrig nollställd (till
  // skillnad från addRecipeTriggeredRef ovan, som medvetet nollställs när
  // addRecipeId blir undefined för att tillåta en NY tillägg-navigation).
  // Skyddar mot att exakt samma navigation (samma reqId) appliceras två
  // gånger om routern av någon anledning levererar samma params igen —
  // bekräftat 2026-09-06 via DIAG v3: skapade två menu-rader med samma
  // recept för samma dag.
  const appliedReqIdRef = useRef<string | null>(null);
  // Always current — updated in render so it's available when useFocusEffect fires.
  const incomingAddRecipeRef = useRef(params.addRecipeId);
  incomingAddRecipeRef.current = params.addRecipeId;
  const bulkTransferTriggeredRef = useRef(false);
  // Har guiden varit öppen? Skiljer "stängdes nyss" från "har aldrig öppnats".
  const bulkWasOpenRef = useRef(false);
  // Ankare för överförings-popupen, så den hamnar ovanför kundkorgs-FAB:en.
  const transferFabRef = useRef<View>(null);
  const client = useApiClient();
  const { showToast: showGlobalToast, showError } = useToast();
  const confirm = useConfirm();
  const { householdId, householdName } = useHousehold();
  const { nyDesign } = useDesign();
  const { getToken } = useAuth();
  const { markPending, clearPending, cancelAllPending, pendingMenuItemRemovals, pendingCount } = usePendingRemoval();
  const { fs, sp, isTablet } = useTablet();
  const { width: weekPageW, height: windowHeight } = useWindowDimensions();

  // Mät-och-lyft i stället för KeyboardAvoidingView: den krympte arket och
  // lämnade ett tomrum när tangentbordet stängdes.
  const { sheetLift, onFocusInput } = useSheetLift();
  const newListRef = useRef<TextInput>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const weekMonday = useMemo(() => getWeekMonday(weekOffset), [weekOffset]);
  const { weekYear, weekNumber } = useMemo(() => getISOWeek(weekMonday), [weekMonday]);

  const weekLabel = useMemo(() => `Vecka ${weekNumber}`, [weekNumber]);

  const [menuItems, setMenuItems] = useState<MenuRow[]>([]);
  const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
  const [shoppingLists, setShoppingLists] = useState<ShoppingListWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferSheet, setTransferSheet] = useState<WeekMenuItemWithRecipe | null>(null);
  const [transferringListId, setTransferringListId] = useState<string | null>(null);
  const [bulkTransferringListId, setBulkTransferringListId] = useState<string | null>(null);
  // Markerad lista i list-steget — överföring sker först vid "Överför"-knappen
  // så man inte råkar trycka på fel lista (kan inte ångras).
  const [bulkSelectedListId, setBulkSelectedListId] = useState<string | null>(null);
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
  // Vilka recept-id:n haveAtHome/hadUnmeasured just nu är ifyllda för — så en
  // ofrivillig bakåt-navigering (recept-steg → ingrediens-steg igen) INTE
  // nollställer det man redan hunnit fylla i, så länge receptvalet är oförändrat.
  const inventoryBuiltForRef = useRef<Set<string> | null>(null);
  const [allMenus, setAllMenus] = useState<MenuRow[]>([]);
  // Nycklar "år-vecka". Flera veckor kan väljas samtidigt; aggregeringen slår
  // ihop samma ingrediens över dem, vilket är hela poängen med att kunna ta mer
  // än en vecka i taget. Tom mängd = ingen veckofiltrering (nuvarande vecka).
  const [bulkTransferWeeks, setBulkTransferWeeks] = useState<Set<string>>(new Set());

  // Replace recipe: item being replaced
  const [replaceTarget, setReplaceTarget] = useState<WeekMenuItemWithRecipe | null>(null);

  // Edit recipe modal
  // Optimistic overlay for the −/+ scaler; the persisted truth is item.servings.
  // Reset on load() so another device's change isn't shadowed by a stale entry.
  const [menuItemServings, setMenuItemServings] = useState<Record<string, number>>({});
  const servingsSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Rätter vars portions-override ännu inte sparats/committats — så en reload
  // inte nollställer dem och får värdet att studsa fram och tillbaka.
  const pendingServingsRef = useRef<Set<string>>(new Set());

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
  // Gammal vecka: skalningen är bara lokal. Den följer med till Laga men
  // sparas inte — historiken ändras inte, och därför behövs inte heller
  // låset för överförda rätter.
  function scaleServingsLokalt(item: WeekMenuItemWithRecipe, n: number) {
    setMenuItemServings(prev => ({ ...prev, [item.id]: n }));
  }

  function scaleServings(item: WeekMenuItemWithRecipe, n: number) {
    // Låst när rätten redan förts över: listan har mängderna för de gamla
    // portionerna, och en skalning här ändrade bara vad laga-läget visade —
    // menyn och listan sa då olika saker. Ta bort ur listan för att skala.
    if (recipeListMap[item.id]?.length) {
      showGlobalToast(str.toasts.scalingLocked, 'neutral');
      return;
    }
    setMenuItemServings(prev => ({ ...prev, [item.id]: n }));
    pendingServingsRef.current.add(item.id);
    const toSave = n === item.recipe.servings ? null : n;
    if (servingsSaveTimers.current[item.id]) clearTimeout(servingsSaveTimers.current[item.id]);
    servingsSaveTimers.current[item.id] = setTimeout(() => {
      client.updateWeekMenuItem(item.id, { servings: toSave })
        .then(() => {
          pendingServingsRef.current.delete(item.id);
          // Persisterade värdet matchar nu → släpp override (om inget nyare val hunnit ske).
          setMenuItemServings(prev => {
            if (prev[item.id] !== n) return prev;
            const { [item.id]: _drop, ...rest } = prev;
            return rest;
          });
        })
        .catch(e => {
          // Bara VID FEL ändras det tillbaka — släpp override → visar persisterat värde.
          pendingServingsRef.current.delete(item.id);
          setMenuItemServings(prev => { const { [item.id]: _drop, ...rest } = prev; return rest; });
          showError(e, str.toasts.errorSaveServings);
        });
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
  function idSetsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const id of a) if (!b.has(id)) return false;
    return true;
  }
  // Nollställ bara om receptvalet faktiskt ändrats sedan senast — annars
  // behåll ifyllda mängder (se inventoryBuiltForRef ovan).
  function resetInventoryFor(ids: Set<string>) {
    resetInventory();
    inventoryBuiltForRef.current = new Set(ids);
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

  // Vilka menyrader som är i spel för bulk-överföringen. Låg tidigare
  // triplicerad (aggregeringen, receptsteget och executeBulkTransfer) med små
  // skillnader sinsemellan — en delad memo håller dem i synk, och gör att en
  // AVMARKERAD vecka inte kan smita med via kvarglömda id:n i selectionen.
  const bulkPool = useMemo(
    () => (bulkTransferWeeks.size > 0
      // Rätter utan dag syns inte längre i menyn — de ska inte följa med osynligt.
      ? allMenus.filter(m => m.day !== null && bulkTransferWeeks.has(`${m.weekYear}-${m.weekNumber}`))
      : menuItems),
    [bulkTransferWeeks, allMenus, menuItems],
  );

  // Ingredients across the selected recipes, merged into one row per name+unit
  // (with provenance), so a shared ingredient isn't inventoried multiple times.
  // Restricted to the active week and excludes already-transferred recipes so it
  // matches exactly what step 1 offered + the user picked.
  const aggregatedInventory = useMemo<AggIngredient[]>(() => {
    const selected = bulkPool.filter(m => selectedRecipesForTransfer.has(m.id) && !transferredMenuItemIds.has(m.id));
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
  }, [selectedRecipesForTransfer, bulkPool, menuItemServings, transferredMenuItemIds, ingredientCategories]);

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
            <Ionicons name="checkmark" size={15} color={have ? ny.skog : ny.textDampad} />
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

  // Drag state — y = absolute screen Y; touchOffsetY = finger position within card
  type DragState = { item: WeekMenuItemWithRecipe; y: number; touchOffsetY: number };
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoverDay, setHoverDay] = useState<WeekDay | undefined>(undefined);
  // Refs speglar dragläget. Gestens slut kan komma innan React hunnit rendera
  // om efter starten — t.ex. när systemets bakåtgest tar över fingret direkt.
  // onDragEnd såg då ett gammalt dragState = null, gick ur tidigt utan att
  // nollställa, och kortet blev hängande i luften, även vid byte av vecka och
  // flik. Refs läses alltid färska.
  const dragRef = useRef<DragState | null>(null);
  const hoverRef = useRef<WeekDay | undefined>(undefined);

  // Refs for measuring day section positions (screen coords)
  const daySectionRefs = useRef<Record<string, View | null>>({});
  const dayLayouts = useRef<Record<string, { y: number; height: number }>>({});

  // Auto-scroll during drag near screen edges
  const menuScrollRef = useRef<ScrollView | null>(null);
  const weekListRef = useRef<FlatList<number>>(null);
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
  // Veckoraden fälls ihop när man scrollar nedåt och följer med scrollen,
  // så den glider tillbaka i samma takt på vägen upp. Första versionen
  // fälldes vid en tröskel och poppade in nära toppen — ett hack precis där
  // man stannade. Höjdändringen per scrollhändelse går bra här: veckans
  // innehåll byter inte bredd, så det flödar inte om (till skillnad från
  // receptlistans murverk, där samma sak laggade).
  const veckaSynlig = useSharedValue(1);
  // Uppskattad höjd tills raden mätts, så sidhuvudet inte blinkar till utan rad.
  const [veckaH, setVeckaH] = useState(62);
  const veckaHRef = useRef(62);
  veckaHRef.current = veckaH;
  const följVeckaScroll = useCallback((y: number) => {
    veckaSynlig.value = 1 - Math.min(1, Math.max(0, y / veckaHRef.current));
  }, [veckaSynlig]);
  const veckaAnimStyle = useAnimatedStyle(() => (
    veckaH ? { height: veckaH * veckaSynlig.value, opacity: veckaSynlig.value } : {}
  ));
  // Ny vecka börjar om högst upp — då ska veckoraden synas igen.
  useEffect(() => {
    veckaSynlig.value = withTiming(1, { duration: 180 });
  }, [weekOffset, veckaSynlig]);
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

  // Serialiserar menyns auktoritativa state-commits (t.ex. tillägg som
  // ersätter en optimistisk temp-rad) så två commits inte hamnar i samma
  // synkrona React-omgång, med en liten paus emellan.
  const commitQueueRef = useRef<Promise<void>>(Promise.resolve());
  function commitSerially(fn: () => void): Promise<void> {
    const next = commitQueueRef.current
      .catch(() => { /* en tidigare länk fick inte stoppa kön */ })
      .then(async () => {
        fn();
        await new Promise(r => setTimeout(r, 32)); // ~2 bildrutor @60fps
      });
    commitQueueRef.current = next;
    return next;
  }

  const loadSeqRef = useRef(0);
  // Skyddar mot att ett load()-anrop som startade INNAN en mutation (ta bort/
  // lägg till/byt) hinner svara EFTER mutationens egen direkta state-
  // uppdatering. Ett sånt sent load()-svar bär på en ögonblicksbild från
  // innan mutationen och återupplivar kortvarigt t.ex. ett redan borttaget
  // recept — bekräftat 2026-09-06 (exakt sekvens: nytt recept ensamt → gamla
  // dyker upp igen en kort stund → försvinner igen). loadSeqRef skyddar bara
  // load()-anrop mot VARANDRA. Varje mutation stegar stateVersionRef precis
  // innan sin egen auktoritativa state-uppdatering; load() fångar versionen
  // vid start och kastar sitt svar om den hunnit ändras under tiden — dvs.
  // "har något mer auktoritativt redan hänt sen jag frågade servern".
  const stateVersionRef = useRef(0);
  const load = useCallback(async () => {
    if (!householdId) return;
    const seq = ++loadSeqRef.current;
    const versionAtStart = stateVersionRef.current;
    try {
      const [menu, recs, activeLists, suggestions, all] = await Promise.all([
        client.getWeekMenu(householdId, weekYear, weekNumber),
        client.getRecipes(householdId),
        client.getShoppingLists(householdId),
        client.getIngredientSuggestions(householdId).catch(() => [] as { name: string; category: string }[]),
        client.getAllMenus(householdId).catch(() => [] as WeekMenuItemWithRecipe[]),
      ]);
      if (seq !== loadSeqRef.current) return; // en nyare load() har redan startat — kasta detta inaktuella svaret
      if (stateVersionRef.current !== versionAtStart) return; // en mutation har hunnit ändra state medan denna load() väntade på servern
      // Filtrera bort allt som är markerat pending-borttagning INNAN vi
      // skriver in serverns svar. Detta är INTE ett race mellan två
      // klient-state-källor (det var redan fixat) — det är att servern
      // fortfarande, helt korrekt, känner till raden tills 5-sekunders
      // Ångra-fönstret går ut och den RIKTIGA DELETE:n skickas. Triggas
      // NÅGOT som helst load() under den väntetiden (websocket-eko,
      // fokus-effekt, vad som helst) hämtar den färsk data som fortfarande
      // innehåller raden och skriver tillbaka den i state, mitt i
      // väntetiden — bekräftat i produktion 2026-09-06/07 (samma
      // "gammalt+nytt recept samtidigt"-symptom kvarstod trots att raden
      // togs bort direkt ur arrayen vid tryck).
      const menuFiltered = menu.filter(i => !pendingMenuItemRemovals.has(i.id));
      const allFiltered = all.filter(i => !pendingMenuItemRemovals.has(i.id));
      setMenuItems(menuFiltered);
      // Behåll overrides för rätter vars sparning ännu är på gång (annars studsar
      // portionerna); resten är redan committade → persisterat värde är sanning.
      setMenuItemServings(prev => {
        const next: Record<string, number> = {};
        for (const [id, v] of Object.entries(prev)) if (pendingServingsRef.current.has(id)) next[id] = v;
        return next;
      });
      loadedWeekRef.current = { wy: weekYear, wn: weekNumber };
      setRecipes(recs);
      setShoppingLists(activeLists);
      setAllMenus(allFiltered);
      // name -> category map (learned aliases + common ingredients), so the
      // inventory can group by where the item lands in the store.
      const catMap: Record<string, string> = {};
      for (const sgg of suggestions) catMap[sgg.name.toLowerCase().trim()] = sgg.category;
      setIngredientCategories(catMap);
      const listMap: Record<string, ListEntry[]> = {};
      // Build over ALL weeks' menu items (not just the current week) so the
      // "I inköpslistan"-tag is already correct on neighbouring week pages the
      // moment you swipe to them, instead of popping in after the reload.
      (all.length ? all : menu).forEach(menuItem => {
        if (!listMap[menuItem.id]) listMap[menuItem.id] = [];
        activeLists.forEach(l => {
          // Koppling är strikt PER meny-item via linkedMenuItemIds (visible +
          // hidden merge-container). INGEN legacy per-recept-match här — den tände
          // kundvagnen på alla veckors förekomster av samma recept (bug).
          const linked = (l as { linkedMenuItemIds?: string[] }).linkedMenuItemIds ?? [];
          if (linked.includes(menuItem.id)) {
            const visibleCount = l.items.filter(item => item.menuItemId === menuItem.id).length;
            if (!listMap[menuItem.id].find(e => e.listId === l.id)) {
              listMap[menuItem.id].push({ listId: l.id, listName: l.name, itemCount: visibleCount });
            }
          }
        });
      });
      setRecipeListMap(listMap);
    } catch {
      if (seq === loadSeqRef.current) {
        confirm({ title: str.dialogs.loadError.title, message: str.dialogs.loadError.message, buttons: [{ label: common.actions.ok }] });
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [householdId, weekYear, weekNumber, pendingMenuItemRemovals]);

  // Kom igång-overlayn: meny-steget bad om att öppna planeraren → gör det när
  // meny-fliken fokuseras (spinnern släppt). openPlanner är hoistad; goToWeek
  // nås via closure (körs efter render).
  useFocusEffect(useCallback(() => {
    if (loading) return;
    if (!consumeSpotlight('gs-menu')) return;
    goToWeek(0, true);
    openPlanner();
  }, [loading]));

  useFocusEffect(useCallback(() => {
    // When returning from the recipe picker (addRecipeId present), state is intact
    // from before navigation — skip load() to avoid a FlatList re-render that would
    // race with the addRecipeId effect's optimistic insert and wipe it from state.
    // loadedWeekRef guards the "first mount" case: if no data has ever been loaded
    // we always load, regardless of addRecipeId.
    //
    // …men BARA om det är målveckans data som redan ligger inne. Väljaren
    // nollställer veckan till innevarande vid återresan, så lägger man till i en
    // kommande vecka pekar loadedWeekRef på fel vecka. Då väntade addRecipeId-
    // effekten på en load() som den här raden just hade bestämt sig för att
    // hoppa över — deadlock, och rätten lades aldrig till (tyst, tills man
    // laddade om manuellt). Bekräftat 2026-09-08: felet uppstod bara vid
    // tillägg i en annan vecka än den innevarande.
    const focusTarget = parseWeekParam(params.forMenuWeek);
    const lw = loadedWeekRef.current;
    const loadedIsTargetWeek = !focusTarget
      || (lw != null && lw.wy === focusTarget.weekYear && lw.wn === focusTarget.weekNumber);
    if (incomingAddRecipeRef.current && lw && loadedIsTargetWeek) return;
    load();
  }, [load, params.forMenuWeek]));
  // Reload when a shopping list changes elsewhere so the "I inköpslistan"-tag and
  // transfer filters stay in sync (e.g. after clearing/removing items in a list).
  useEffect(() => onShoppingChanged(load), [load]);

  // Säkerhetsspärr: ett drag får aldrig överleva att fliken tappar fokus eller
  // att appen går i bakgrunden, vad som än avbröt gesten.
  const avbrytDragRef = useRef(avbrytDrag);
  avbrytDragRef.current = avbrytDrag;
  useFocusEffect(useCallback(() => () => avbrytDragRef.current(), []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => { if (st !== 'active') avbrytDragRef.current(); });
    return () => sub.remove();
  }, []);

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

  // Web/PWA: horisontellt svep för att byta vecka (den horisontella pager-FlatListan
  // är avstängd på web pga scroll-konflikt). Riktnings-styrt: aktiverar bara på
  // tydligt horisontella drag och failar vid vertikala, så den vertikala scrollen
  // yieldas. touchAction="pan-y" på GestureDetectorn låter browsern behålla scroll.
  // Web/PWA: RNGH:s Pan-gest kände aldrig igen svepet tillförlitligt i
  // webbläsare. Läs istället råa DOM-touch-koordinater via RNW:s onTouchStart/
  // End på ScrollViewn — passivt (ingen preventDefault), så vertikal scroll är
  // orörd, och vi byter vecka bara vid ett TYDLIGT horisontellt svep vid släpp.
  const webTouchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const onWebTouchStart = useCallback((e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches?.[0];
    if (t) webTouchStart.current = { x: t.pageX, y: t.pageY, t: Date.now() };
  }, []);
  const onWebTouchEnd = useCallback((e: GestureResponderEvent) => {
    const start = webTouchStart.current;
    webTouchStart.current = null;
    const t = e.nativeEvent.changedTouches?.[0];
    if (!start || !t) return;
    const dx = t.pageX - start.x;
    const dy = t.pageY - start.y;
    if (Date.now() - start.t > 700) return;         // svep, inte långsamt drag
    if (Math.abs(dx) < 45) return;                   // tillräckligt horisontellt
    if (Math.abs(dx) <= Math.abs(dy) * 1.2) return;  // måste dominera vertikalt
    goToWeek(weekOffset + (dx < 0 ? 1 : -1), true);
  }, [weekOffset, goToWeek]);

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
    if (params.reqId && appliedReqIdRef.current === params.reqId) return;
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

    const localRecipe = recipes.find(r => r.id === params.addRecipeId);
    const apply = (recipe: RecipeWithIngredients) => {
      addRecipeTriggeredRef.current = true;
      if (params.reqId) appliedReqIdRef.current = params.reqId;
      if (params.replaceMenuItemId) {
        replaceMenuItem(params.replaceMenuItemId, recipe);
      } else {
        const day = (params.day && DAYS.some(d => d.key === params.day) ? params.day : null) as WeekDay | null;
        addRecipeToDay(recipe, day);
      }
      router.setParams({ addRecipeId: undefined, day: undefined, replaceMenuItemId: undefined, forMenuWeek: undefined });
    };
    if (localRecipe) {
      apply(localRecipe);
    } else {
      // Nyss skapat recept (via "Skapa nytt recept"-flödet) — load() hoppas
      // medvetet över här (se useFocusEffect ovan) för att skydda den
      // optimistiska infogningen, så den lokala `recipes`-listan hann aldrig
      // uppdateras. Utan fallbacken hittades receptet aldrig och tillägget
      // uteblev helt tyst tills man manuellt laddade om sidan.
      addRecipeTriggeredRef.current = true;
      client.getRecipe(params.addRecipeId).then(apply).catch((e) => {
        addRecipeTriggeredRef.current = false;
        showError(e, str.toasts.errorAddRecipe);
      });
    }
  }, [params.addRecipeId, params.reqId, params.forMenuWeek, recipes, weekYear, weekNumber, menuItems]);

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
      // Samma filtrering som load() — annars kan en pending-borttagen rad
      // (5s Ångra-fönster) dyka upp igen via den här separata hämtningen.
      setAllMenus(all.filter(i => !pendingMenuItemRemovals.has(i.id)));
      // Nollställ urvalet vid ingången — MEN bara om det inte redan finns ett
      // pågående val att återuppta (stängde man guiden mitt i, t.ex. på
      // inventeringssteget, ska den återöppnas där man var). Tidigare
      // ERSATTE ett veckoklick hela urvalet, så gammalt skräp maskerades; nu
      // adderas/tas rätter bort per vecka och kvarglömda id:n skulle följa
      // med in i överföringen — det är därför just den nollställningen är
      // ovillkorlig i själva veckoväljar-flödet, inte vid själva öppningen.
      if (bulkTransferWeeks.size === 0 && selectedRecipesForTransfer.size === 0) {
        setBulkTransferStep('week');
      }
      setShowBulkTransferModal(true);
    } catch (e) {
      showError(e, str.toasts.errorFetchWeeks);
    }
  }

  useEffect(() => {
    // Bara vid STÄNGNING, inte vid mount. Kommer man in via
    // ?bulkTransfer=1&originListId=… är modalen ännu inte öppnad när effekten
    // först kör, och den rensade då destinationslistan direkt — varpå "redan
    // tillagd" räknades mot ALLA listor i stället för den man kom ifrån.
    if (showBulkTransferModal) { bulkWasOpenRef.current = true; return; }
    if (!bulkWasOpenRef.current) return;
    bulkWasOpenRef.current = false;
    if (params.originListId) router.setParams({ originListId: undefined });
    // Rensa bara veckovalet om guiden stängdes UTAN ett pågående receptval
    // att återuppta (avbruten eller helt tom) — annars vore det just det
    // valet som skulle finnas kvar vid nästa öppning.
    if (selectedRecipesForTransfer.size === 0) setBulkTransferWeeks(new Set());
  }, [showBulkTransferModal, params.originListId, selectedRecipesForTransfer]);

  // Pick a recipe for a day by opening the full recipe view in "select" mode,
  // instead of a separate in-menu picker dialog. The recipe screen routes back
  // with ?addRecipeId&day, which the addRecipeId effect below applies to the
  // currently shown week.
  function openPicker(day: WeekDay | null) {
    router.push(`/recipes/pick?forMenuDay=${day ?? 'none'}&forMenuWeek=${weekYear}-${weekNumber}` as never);
  }

  // Botten-"+": öppna receptväljaren i "välj dag"-läge — man väljer recept och
  // sedan dag/vecka (inkl. utan dag) via "Lägg till i meny"-popupen.
  function openPlanner() {
    router.push(`/recipes/pick?chooseDay=1&forMenuWeek=${weekYear}-${weekNumber}` as never);
  }

  // Replace flow now uses the full recipe view (select mode), like "+".
  function startReplaceRecipe(item: WeekMenuItemWithRecipe) {
    router.push(`/recipes/pick?replaceMenuItemId=${item.id}&replaceTitle=${encodeURIComponent(item.recipe.title)}&forMenuWeek=${weekYear}-${weekNumber}` as never);
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
      stateVersionRef.current += 1;
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
    const drag = { item, y, touchOffsetY };
    dragRef.current = drag;
    hoverRef.current = undefined;
    setDragState(drag);
  }

  function onDragMove(_x: number, y: number) {
    if (dragRef.current) dragRef.current = { ...dragRef.current, y };
    setDragState(prev => prev ? { ...prev, y } : null);
    // Auto-scroll the menu list when finger nears screen edge
    const screenH = windowHeight;
    ensureAutoScroll(y, screenH);
    // Find which day section we're hovering over
    let found: WeekDay | undefined = undefined;
    for (const [key, layout] of Object.entries(dayLayouts.current)) {
      if (y >= layout.y && y <= layout.y + layout.height) {
        found = key as WeekDay;
        break;
      }
    }
    hoverRef.current = found;
    setHoverDay(found);
  }

  // Nollställer alltid — även när draget avbröts innan det hann renderas.
  function avbrytDrag() {
    stopAutoScroll();
    dragRef.current = null;
    hoverRef.current = undefined;
    setDragState(null);
    setHoverDay(undefined);
  }

  function onDragEnd() {
    const drag = dragRef.current;
    const hover = hoverRef.current;
    avbrytDrag();
    if (!drag || hover === undefined) return;
    if (hover !== drag.item.day) {
      moveToDay(drag.item, hover);
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
        stateVersionRef.current += 1;
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
    const optimistic: MenuRow = {
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
      _stableKey: tempId,
    } as MenuRow;
    stateVersionRef.current += 1;
    setMenuItems(prev => [...prev, optimistic]);
    setAllMenus(prev => [...prev, optimistic]); // keep snapshot in sync so non-loaded weeks render correctly
    try {
      suppressMenuReloadRef.current += 1;
      const item = await client.addToWeekMenu({ householdId, recipeId: recipe.id, day, weekYear, weekNumber });
      // Robust mot att temp-raden redan hunnit försvinna (t.ex. om ett load()
      // från veckobyte/socket-echo hann skriva över hela listan innan svaret
      // kom tillbaka) — utan detta tappades tillägget tyst (map hittade inget
      // att ersätta), eller dubblerades om ett senare load() också inkluderade
      // det riktiga svaret. Ersätt om temp-raden finns kvar; annars lägg bara
      // till om det riktiga ID:t inte redan råkat komma in via ett load().
      const replaceOrAppend = (prev: MenuRow[]) => {
        if (prev.some(m => m.id === tempId)) return prev.map(m => m.id === tempId ? { ...item, _stableKey: tempId } : m);
        if (prev.some(m => m.id === item.id)) return prev;
        return [...prev, item];
      };
      await commitSerially(() => {
        stateVersionRef.current += 1;
        setMenuItems(replaceOrAppend);
        setAllMenus(replaceOrAppend);
      });
      showGlobalToast(str.toasts.recipeAdded, 'success');
    } catch (e) {
      stateVersionRef.current += 1;
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
    // Ta bort UR ARRAYEN direkt vid tryck — enda sanningskällan för "syns/
    // syns inte", i stället för att dölja via pendingMenuItemRemovals (en
    // separat context) och filtrera bort den vid render. markPending/
    // pendingMenuItemRemovals lever kvar för ANDRA skärmar (inköpslistan
    // filtrerar ingredienser på den) och "Ångra"-räkningen, men styr inte
    // längre menyskärmens egen synlighet.
    stateVersionRef.current += 1;
    setMenuItems(prev => prev.filter(i => i.id !== item.id));
    setAllMenus(prev => prev.filter(i => i.id !== item.id));
    const restore = () => {
      cancelled = true;
      stateVersionRef.current += 1;
      setMenuItems(prev => prev.some(i => i.id === item.id) ? prev : [...prev, item]);
      setAllMenus(prev => prev.some(i => i.id === item.id) ? prev : [...prev, item]);
    };
    markPending(item.id, restore);
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
        setRecipeListMap(prev => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      } catch (e) {
        // Borttagningen misslyckades — raden finns fortfarande på servern,
        // så återställ den i state (den togs bort optimistiskt ovan).
        restore();
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


  // Popupen väljer omfattning innan guiden öppnas: den visade veckan (som förut,
  // rakt in i rätt-steget) eller flera veckor (via veckovalet). Utan den fanns
  // flerveckorsvägen bara från en inköpslista, vilket ingen hittade.
  function handleShowTransferMenu() {
    confirm({
      variant: 'menu',
      menuAnchor: 'bottom-right',
      menuAnchorRef: transferFabRef,
      buttons: [
        { label: str.bulk.transferThisWeek, icon: 'cart-outline', onPress: transferWeekMenu },
        { label: str.bulk.transferMultipleWeeks, icon: 'calendar-outline', onPress: openWeekPicker },
        { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }
  async function transferWeekMenu() {
    if (menuItems.length === 0) {
      confirm({ title: str.dialogs.weekEmpty.title, message: str.dialogs.weekEmpty.message, buttons: [{ label: 'OK' }] });
      return;
    }

    // Rätter utan dag syns inte längre i menyn — de ska inte följa med osynligt.
    const notTransferred = menuItems.filter(m => m.day !== null && !transferredMenuItemIds.has(m.id));
    if (notTransferred.length === 0) {
      confirm({ title: str.dialogs.alreadyTransferred.title, message: str.dialogs.alreadyTransferred.message, buttons: [{ label: 'OK' }] });
      return;
    }

    // Stängde man guiden mitt i (inventeringssteget) i stället för att
    // fullfölja den, ska ett nytt tryck på "Överför" återuppta där man var
    // — inte kasta bort ifyllda "har hemma"-bockar och hoppa tillbaka till
    // receptvalet. Bara en genuint ny överföring (inget pågående val) nollställer.
    if (selectedRecipesForTransfer.size === 0) {
      // Förkryssat = det som ALDRIG förts över. Rensar man listan mitt i
      // veckan försvinner kopplingen, och utan det här skulle måndagens redan
      // handlade rätt kryssas i igen och hamna i listan en andra gång.
      // Den som verkligen vill föra över den igen kryssar i den för hand.
      const freshIds = new Set(notTransferred.filter(m => !m.transferred).map(m => m.id));
      setSelectedRecipesForTransfer(freshIds);
      resetInventoryFor(freshIds);
      setBulkTransferStep('recipe');
    }
    setShowBulkTransferModal(true);
  }

  async function executeBulkTransfer(listId: string) {
    if (selectedRecipesForTransfer.size === 0) {
      confirm({ title: str.dialogs.noSelection.title, message: str.dialogs.noSelection.message, buttons: [{ label: 'OK' }] });
      return;
    }

    try {
      const toTransfer = bulkPool.filter(item => selectedRecipesForTransfer.has(item.id));
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
      // En LYCKAD överföring är klar, inte "stängd mitt i" — nollställ så
      // nästa öppning inte tror att den ska återuppta redan överförda rätter
      // (se transferWeekMenu/openWeekPicker, som bara nollställer om det INTE
      // finns ett pågående val).
      setSelectedRecipesForTransfer(new Set());
      setBulkTransferWeeks(new Set());
      resetInventory();
      inventoryBuiltForRef.current = null;
      setBulkTransferStep('recipe');
      load();
      showGlobalToast(str.toasts.transferred(actuallyTransfer.length), 'success');
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
      showGlobalToast(str.toasts.ingredientsTransferred(recipe.title), 'success');
    } catch (e) {
      setTransferringListId(null);
      showError(e, str.toasts.errorTransferIngredients);
    }
  }

  async function moveToDay(item: WeekMenuItemWithRecipe, day: WeekDay | null) {
    // Ingen fråga när måldagen redan har en rätt. Den skyddade mot något som går
    // att ångra med ett drag till, och blev bara friktion: flera rätter samma dag
    // är tillåtet och syns direkt. (Att LÄGGA TILL en rätt på en upptagen dag
    // frågar fortfarande — där är risken en oavsiktlig andra rätt, inte en flytt.)
    stateVersionRef.current += 1;
    setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, day } : i));
    setAllMenus(prev => prev.map(i => i.id === item.id ? { ...i, day } : i));
    suppressMenuReloadRef.current += 1;
    try {
      const updated = await client.updateWeekMenuItem(item.id, { day });
      stateVersionRef.current += 1;
      setMenuItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      setAllMenus(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch (e) {
      stateVersionRef.current += 1;
      setMenuItems(prev => prev.map(i => i.id === item.id ? item : i));
      setAllMenus(prev => prev.map(i => i.id === item.id ? item : i));
      showError(e, str.toasts.errorMove);
    }
  }

  // Sätt/ändra/rensa måltidstyp direkt på ett menykort (frivillig etikett).
  // Toggla samma typ = rensa (null). Optimistiskt, som moveToDay.
  async function setMenuItemMeal(item: WeekMenuItemWithRecipe, meal: MealType | null) {
    const next = item.mealType === meal ? null : meal;
    stateVersionRef.current += 1;
    setMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, mealType: next } : i));
    setAllMenus(prev => prev.map(i => i.id === item.id ? { ...i, mealType: next } : i));
    suppressMenuReloadRef.current += 1;
    try {
      const updated = await client.updateWeekMenuItem(item.id, { mealType: next });
      stateVersionRef.current += 1;
      setMenuItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      setAllMenus(prev => prev.map(i => i.id === updated.id ? updated : i));
    } catch (e) {
      stateVersionRef.current += 1;
      setMenuItems(prev => prev.map(i => i.id === item.id ? item : i));
      setAllMenus(prev => prev.map(i => i.id === item.id ? item : i));
      showError(e, common.errors.couldNotSave(common.mealTypes.entity));
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

  // One week's day-sections + transfer button. Only the centre
  // page is interactive (drag-and-drop, drop-zone measuring, edit/transfer);
  // neighbour pages are read-only previews.
  const renderWeekContent = (weekItems: MenuRow[], weekMon: Date, isCenter: boolean, isPastWeek: boolean) => {
    // Stable order (createdAt, then id) so a day's recipes render identically
    // whether they come from the allMenus snapshot or the live menuItems — no
    // reordering "jump" when swiping between weeks.
    // Sortera dagens rätter efter måltidsordning (frukost→middag→efterrätt),
    // därefter skapandeordning. Rätter utan måltidstyp hamnar sist.
    // Känd nackdel: byter man måltid flyttar rätten, och eftersom dagens nyckel
    // bygger på ordningen monteras dagen om och ett utfällt kort stängs. Löses
    // av egen ordning inom dagen (se backloggen), inte av att sluta sortera.
    const mealRank = (i: WeekMenuItemWithRecipe) => {
      const idx = i.mealType ? MEAL_TYPE_ORDER.indexOf(i.mealType) : -1;
      return idx === -1 ? MEAL_TYPE_ORDER.length : idx;
    };
    const byCreated = (a: WeekMenuItemWithRecipe, b: WeekMenuItemWithRecipe) =>
      mealRank(a) - mealRank(b) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    // Optimistic removal: hide items pending deletion immediately so the card
    // disappears at once. They're still in state until the delete commits, so the
    // toast's "Ångra" restores them.
    const visible = (i: WeekMenuItemWithRecipe) => !pendingMenuItemRemovals.has(i.id);
    const anyScheduled = weekItems.some(i => i.day !== null && visible(i));
    const noop = () => {};
    const isWide = false;
    // Ett kort i telefonvyn — samma props oavsett design, så de inte glider isär.
    const renderKort = (item: MenuRow, hero = false, idag = false) => (
      <MenuCard
        key={item._stableKey ?? item.id}
        item={item}
        hero={hero}
        idag={idag}
        collapsedForDrag={isCenter && !!dragState}
        isTransferred={!!recipeListMap[item.id]?.length}
        listNamn={(recipeListMap[item.id] ?? []).map(e => e.listName)}
        isPending={isCenter && pendingMenuItemRemovals.has(item.id)}
        isPastWeek={isPastWeek}
        onRemove={isCenter && !isPastWeek ? (() => removeFromMenu(item)) : noop}
        onCookRecipe={() => {
          router.push(`/recipes/${item.recipeId}?cook=1&servings=${scaledServingsOf(item)}` as never);
        }}
        onMoveToDay={isCenter && !isPastWeek ? (d => moveToDay(item, d)) : noop}
        onReplace={isCenter && !isPastWeek ? (() => startReplaceRecipe(item)) : noop}
        onDragStart={isCenter && !isPastWeek ? ((x, y, ty) => onDragStart(item, x, y, ty)) : noop}
        onDragMove={isCenter ? onDragMove : noop}
        onDragEnd={isCenter ? onDragEnd : noop}
        isDragging={isCenter && dragState?.item.id === item.id}
        scaledServings={scaledServingsOf(item)}
        onScaleServings={isCenter ? (n => (isPastWeek ? scaleServingsLokalt(item, n) : scaleServings(item, n))) : noop}
        onSetMeal={isCenter && !isPastWeek ? (m => setMenuItemMeal(item, m)) : noop}
      />
    );
    return (
      <>
        <View style={[isWide ? s.daysRow : s.daysCol, nyDesign && s.nyDagar]}>
          {DAYS.map((day, i) => {
            const items = weekItems.filter(m => m.day === day.key && visible(m)).sort(byCreated);
            const date = new Date(weekMon.getFullYear(), weekMon.getMonth(), weekMon.getDate() + i);
            const isHovered = isCenter && hoverDay === day.key;
            const dragging = isCenter && !!dragState;
            const dayLabel = { abbr: day.short.toLowerCase(), date: date.getDate() };
            const filled = items.length > 0;
            const isToday = date.toDateString() === new Date().toDateString();
            // Vilken rätt som får bildbanderollen: middagen om dagen har en,
            // annars den första. Se renderingen längre ned.
            const heroId = (items.find(m => m.mealType === 'dinner') ?? items[0])?.id;
            // Ny design: dagens rubrik — namn, datum och ev. "Idag"-märke.
            // Kort månad ("16 sep") och EXPLICIT bredd ur teckenantalet: utan
            // den försvann månaden helt på Android. flexShrink: 0 räckte inte,
            // så det är textmätningen som är fel, inte flex. Se minnet
            // android-text-clipping.
            const datumText = `${dayLabel.date} ${common.months.short[date.getMonth()]}`;
            const dagRubrik = (
              <>
                <Text style={s.nyDagNamn} numberOfLines={1}>{day.label}</Text>
                <Text style={[s.nyDagDatum, { width: datumText.length * 8 + 8 }]} numberOfLines={1}>{datumText}</Text>
                {isToday && (
                  // Datumets box ar avsiktligt bredare an texten (explicit bredd
                  // mot klippbuggen). Overskottet hamnar till hoger, sa market
                  // dras in i det — annars ser gapet dag→datum och datum→marke
                  // olika stora ut. Samma formel som bredden, sa den foljer med
                  // nar strangen byter langd ("3 sep" vs "16 sep").
                  <View style={[s.nyIdagMarke, { marginLeft: -Math.round(datumText.length * 1.5 + 8) }]}>
                    <Text style={s.nyIdagMarkeText}>{str.nyDesign.today}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }} />
              </>
            );
            return (
              <View
                // Nyckeln inkluderar det EXAKTA innehållet (inte bara day.key) —
                // tvingar hela dagens kort-sektion att monteras om helt vid varje
                // ändring i sammansättningen, i stället för att React ska försöka
                // återanvända/diffa enskilda kort. Sista utvägen mot ett synligt
                // "gammalt+nytt kort samtidigt"-fel som bevisligen INTE berodde
                // på fel state (grundligt uteslutet via diagnostik 2026-09-06)
                // och INTE på OS-animationer (uteslutet — 0x animationsskala
                // gav ingen skillnad).
                key={`${day.key}-${items.map(i => i.id).join(',')}`}
                style={[
                  s.daySlot,
                  isWide && s.daySlotWide,
                  // Telefon: dagen är en transparent behållare med rubrik + kort;
                  // tomma dagar får sin dashed-box på själva "+"-ytan i stället.
                  !isWide && s.daySlotFilled,
                  isWide && filled && s.daySlotFilled,
                  isWide && !filled && s.daySlotEmptyWide,
                  // Bara surfplatta markerar hela dagen: där är dagen en kolumn
                  // och rubriken en del av den. På telefon ringas korten in
                  // (se nedan) — rubriken är en etikett, inte ett droppmål.
                  dragging && isWide && s.daySlotDropTarget,
                  isHovered && isWide && s.daySlotHovered,
                ]}
                ref={isCenter ? (ref => measureDaySection(day.key, ref)) : undefined}
                onLayout={isCenter ? (() => measureDaySection(day.key, daySectionRefs.current[day.key] ?? null)) : undefined}
              >
                {/* Ramen ritas ovanpå i stället för att läggas till på dagen:
                    en border som tänds ändrar annars lådmodellen, och hela
                    veckan hoppade till så fort ett drag började. */}
                {dragging && isWide && (
                  <View pointerEvents="none" style={[s.dropOutline, isHovered && s.dropOutlineHovered]} />
                )}
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
                        {!isPastWeek && <Ionicons name="add" size={18} color={c.accent300} />}
                      </Pressable>
                    ) : (
                      items.map(item => (
                        <MenuCard
                          key={item._stableKey ?? item.id}
                          item={item}
                          collapsedForDrag={dragging}
                          isTransferred={!!recipeListMap[item.id]?.length}
                          listNamn={(recipeListMap[item.id] ?? []).map(e => e.listName)}
                          isPending={isCenter && pendingMenuItemRemovals.has(item.id)}
                          isPastWeek={isPastWeek}
                          onRemove={isCenter && !isPastWeek ? (() => removeFromMenu(item)) : noop}
                          onCookRecipe={() => {
                          router.push(`/recipes/${item.recipeId}?cook=1&servings=${scaledServingsOf(item)}` as never);
                        }}
                          onMoveToDay={isCenter && !isPastWeek ? (d => moveToDay(item, d)) : noop}
                          onReplace={isCenter && !isPastWeek ? (() => startReplaceRecipe(item)) : noop}
                          onDragStart={isCenter && !isPastWeek ? ((x, y, ty) => onDragStart(item, x, y, ty)) : noop}
                          onDragMove={isCenter ? onDragMove : noop}
                          onDragEnd={isCenter ? onDragEnd : noop}
                          isDragging={isCenter && dragState?.item.id === item.id}
                          scaledServings={scaledServingsOf(item)}
                          onScaleServings={isCenter ? (n => (isPastWeek ? scaleServingsLokalt(item, n) : scaleServings(item, n))) : noop}
                          onSetMeal={isCenter && !isPastWeek ? (m => setMenuItemMeal(item, m)) : noop}
                        />
                      ))
                    )}
                  </>
                ) : nyDesign ? (
                  // Ny design: hela dagen är en egen ruta med rubriken överst
                  // och korten i full bredd under, så flera rätter samma dag
                  // syns som en grupp. En datumbricka till vänster gav en lång,
                  // smal tom yta så fort ett kort fälldes ut. En tom dag är en
                  // streckad ruta som markeras när man drar ett kort över den.
                  // Den yttre dag-vyn, som mäts som droppmål, är densamma.
                  <View style={[s.nyDag, !filled && s.nyDagTomRuta, !filled && isHovered && s.nyDagTomRutaHover]}>
                    {filled || isPastWeek || !isCenter ? (
                      <View style={s.nyDagHuvud}>
                        {dagRubrik}
                        {/* Fler rätter samma dag direkt härifrån — ersätter
                            "Lägg till rätt" längst ned i veckan. */}
                        {filled && !isPastWeek && isCenter && (
                          <Pressable
                            style={s.nyDagPlus}
                            onPress={() => openPicker(day.key)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`${str.card.addAnother} · ${day.label}`}
                          >
                            <Ionicons name="add" size={18} color={ny.chipText} />
                          </Pressable>
                        )}
                      </View>
                    ) : (
                      <Pressable
                        style={s.nyDagHuvud}
                        onPress={() => openPicker(day.key)}
                        accessibilityRole="button"
                        accessibilityLabel={`${str.card.addAnother} · ${day.label}`}
                      >
                        {dagRubrik}
                        <View style={s.nyDagLaggTill}>
                          <Ionicons name="add" size={16} color={ny.chipText} />
                          <Text style={s.nyDagTomText}>{str.card.addAnother}</Text>
                        </View>
                      </Pressable>
                    )}
                    {filled && (
                      <View style={s.nyDagKortLista}>
                        {dragging && (
                          <View pointerEvents="none" style={[s.dropOutline, s.dropOutlineContent, isHovered && s.dropOutlineHovered]} />
                        )}
                        {/* Bildbanderollen går till dagens MIDDAG, inte till
                            den rätt som råkar ligga först. Är dagen planerad
                            med frukost och mellanmål är det ändå middagen man
                            vill se när man öppnar appen. Finns ingen middag
                            faller den tillbaka på första rätten. */}
                        {items.map(item => renderKort(item, isToday && item.id === heroId, isToday))}
                      </View>
                    )}
                  </View>
                ) : (
                  // Phone: dag-rubrik ("Måndag 15") ovanför dagens kort
                  <>
                    <View style={s.dayNameHeaderRow}>
                      <Text style={[s.dayHeaderName, !filled && s.dayHeaderMuted, { fontSize: fs(14) }]}>{day.label}</Text>
                      <Text style={[s.dayHeaderDate, !filled && s.dayHeaderMuted, { fontSize: fs(13) }]}>{dayLabel.date} {common.months.long[date.getMonth()]}</Text>
                    </View>
                    {items.length === 0 ? (
                      // Tom dag: den streckade ytan ÄR redan droppmålet, så den
                      // får bara en tydligare markering när man svävar över den.
                      <Pressable
                        onPress={isCenter && !isPastWeek ? (() => openPicker(day.key)) : noop}
                        style={[s.dayEmptyTap, isHovered && s.dayEmptyTapHovered]}
                      >
                        {!isPastWeek && <Ionicons name="add" size={fs(20)} color={c.textFaint} />}
                      </Pressable>
                    ) : (
                      // Ramen runt dagens kort, inte runt rubriken — samma
                      // känsla som den streckade ytan på en tom dag.
                      <View>
                      {dragging && (
                        <View pointerEvents="none" style={[s.dropOutline, s.dropOutlineContent, isHovered && s.dropOutlineHovered]} />
                      )}
                      {items.map(item => renderKort(item))}
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })}
        </View>

        {/* Rätter utan dag finns inte längre: varken valet "Utan dag" eller
            sektionen Ej schemalagda. Flera rätter samma dag ersätter dem. */}

        {/* Botten-"+": lägg till en rätt var som helst i veckan — öppnar
            receptväljaren där man väljer dag/vecka via popupen. Ny design:
            varje dag har ett eget "+" på rubrikraden, så knappen behövs inte. */}
        {!nyDesign && isCenter && !isPastWeek && anyScheduled && (
          <Pressable style={s.weekAddBtn} onPress={openPlanner}>
            <Ionicons name="add" size={fs(18)} color={c.primary} />
            <Text style={[s.weekAddBtnText, { fontSize: fs(14) }]}>{str.card.addAnother}</Text>
          </Pressable>
        )}

        {!anyScheduled && (
          <EmptyState
            icon="restaurant-outline"
            title={str.emptyState.noDishesPlanned.title}
            subtitle={isPastWeek ? str.emptyState.noDishesPlanned.subtitlePast : str.emptyState.noDishesPlanned.subtitle}
            actionLabel={isPastWeek ? undefined : str.emptyState.noDishesPlanned.action}
            onAction={isPastWeek ? undefined : openPlanner}
          />
        )}
      </>
    );
  };

  const veckoNav = (
    <WeekNav
      variant={nyDesign ? 'ny' : undefined}
      weekLabel={weekLabel}
      isCurrentWeek={weekOffset === 0}
      isPastWeek={weekOffset < 0}
      onPrev={() => goToWeek(weekOffset - 1, true)}
      onNext={() => goToWeek(weekOffset + 1, true)}
      onToday={() => goToWeek(0, true)}
      onPickDate={() => setShowWeekPicker(true)}
    />
  );

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView style={[s.container, nyDesign && s.nyContainer]} edges={nyDesign ? ['top', 'left', 'right'] : undefined}>
      {nyDesign ? (
        <NyHeader
          title={str.title}
          subtitle={householdName}
          right={<NyIkonKnapp icon="bookmarks-outline" onPress={() => setShowTemplates(true)} label={str.a11y.templates} />}
        >
          <Animated.View style={[s.nyVeckaFall, veckaAnimStyle]}>
            <View
              style={s.nyVeckaNav}
              onLayout={e => {
                const h = e.nativeEvent.layout.height;
                if (h > 0) setVeckaH(prev => (Math.abs(prev - h) > 1 ? h : prev));
              }}
            >
              {veckoNav}
            </View>
          </Animated.View>
        </NyHeader>
      ) : (<>
      <ScreenHeader
        title={str.title}
        actionNode={
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Pressable style={[s.headerIconBtn, { paddingHorizontal: sp(10), paddingVertical: sp(7) }]} onPress={() => setShowTemplates(true)} accessibilityLabel={str.a11y.templates}>
              <Ionicons name="bookmarks-outline" size={fs(18)} color={c.primary} />
            </Pressable>
          </View>
        }
      />
      {veckoNav}
      </>)}

      {/* Web/PWA: en nästlad vertikal ScrollView i en horisontell pager gör att
          webbläsaren aldrig delegerar vertikala drag till innerlistan → gick
          inte att scrolla. På web renderas därför bara aktuell vecka som en
          rak vertikal ScrollView; veckobyte sker via pilarna/Idag (goToWeek
          sätter weekOffset, scrollToIndex blir no-op utan FlatList-ref). */}
      {Platform.OS as any === 'web' ? (
        <ScrollView
          ref={menuScrollRef}
          style={[s.content, nyDesign && s.nyInnehall]}
          contentContainerStyle={[s.contentInner, isTablet && s.contentInnerTablet, nyDesign && s.nyInnehallInner]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          onScroll={e => { scrollOffsetY.current = e.nativeEvent.contentOffset.y; följVeckaScroll(scrollOffsetY.current); }}
          scrollEventThrottle={16}
          onTouchStart={onWebTouchStart}
          onTouchEnd={onWebTouchEnd}
        >
          {renderWeekContent(weekItemsForOffset(weekOffset), getWeekMonday(weekOffset), true, weekOffset < 0)}
        </ScrollView>
      ) : (
      /* Virtualised week pager: each page is one week. Swiping just scrolls the
          list (no recenter → no flash); arrows/Idag/picker scrollToIndex so they
          behave identically. Locked while dragging/editing so drag-and-drop
          doesn't fight the swipe. Only the centred week is interactive. */
      <FlatList
        ref={weekListRef}
        data={weekIndices}
        keyExtractor={o => String(o)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={[s.content, nyDesign && s.nyInnehall]}
        scrollEnabled={!dragState}
        initialScrollIndex={weekOffset + WEEK_SPAN}
        getItemLayout={(_, index) => ({ length: weekPageW, offset: weekPageW * index, index })}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        // AVSTÄNGT (var på): känd Android-bugg där removeClippedSubviews kan
        // återanvända en klippt native-vy och kortvarigt visa dess GAMLA bitmap
        // innan den hinner rita om — en ren compositor-glitch, inte ett state-
        // fel. Matchar exakt "gammalt+nytt kort samtidigt"-buggen: diagnostik
        // bevisade upprepat att menuItems/allMenus ALDRIG divergerade när felet
        // syntes, dvs. datat var alltid korrekt. Se commit 2026-09-06.
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        extraData={{ weekOffset, menuItems, allMenus, recipeListMap, dragState, hoverDay, menuItemServings, pendingMenuItemRemovals }}
        onScrollToIndexFailed={() => {}}
        onMomentumScrollEnd={e => {
          const o = Math.round(e.nativeEvent.contentOffset.x / weekPageW) - WEEK_SPAN;
          if (o !== weekOffset) setWeekOffset(o);
        }}
        renderItem={({ item: o }) => {
          const isCenter = o === weekOffset;
          return (
            <ScrollView
              ref={isCenter ? menuScrollRef : undefined}
              style={{ width: weekPageW }}
              contentContainerStyle={[s.contentInner, isTablet && s.contentInnerTablet, nyDesign && s.nyInnehallInner]}
              refreshControl={isCenter ? <RefreshControl refreshing={false} onRefresh={load} /> : undefined}
              onScroll={isCenter ? (e => { scrollOffsetY.current = e.nativeEvent.contentOffset.y; följVeckaScroll(scrollOffsetY.current); }) : undefined}
              scrollEventThrottle={16}
            >
              {renderWeekContent(weekItemsForOffset(o), getWeekMonday(o), isCenter, o < 0)}
            </ScrollView>
          );
        }}
      />
      )}


      {/* Overför-FAB (kundkorg) — visas bara för nuvarande/framtida veckor
          när minst en rätt inte är överförd än. */}
      {!dragState && weekOffset >= 0 && menuItems.some(m => !recipeListMap[m.id]?.length) && (
        <Pressable ref={transferFabRef} style={[s.fab, { width: sp(56), height: sp(56), borderRadius: sp(28) }, nyDesign && s.nyFab]} onPress={handleShowTransferMenu} accessibilityLabel={str.a11y.transferFab}>
          <Ionicons name="cart-outline" size={fs(26)} color={nyDesign ? ny.skog : '#fff'} />
        </Pressable>
      )}
      {/* Mall-FAB — visas för gamla veckor med rätter så de lätt kan sparas som mall */}
      {!dragState && weekOffset < 0 && menuItems.length > 0 && (
        <Pressable style={[s.fab, { width: sp(56), height: sp(56), borderRadius: sp(28) }, nyDesign && s.nyFab]} onPress={() => setShowTemplates(true)} accessibilityLabel={str.a11y.saveWeekAsTemplate}>
          <Ionicons name="bookmark-outline" size={fs(24)} color={nyDesign ? ny.skog : '#fff'} />
        </Pressable>
      )}

      {/* Drag ghost card — full width, vertical-only movement */}
      {dragState && (
        <View
          pointerEvents="none"
          style={[s.ghostCard, nyDesign && s.nyGhost, { top: dragState.y - dragState.touchOffsetY }]}
        >
          <View style={[s.ghostCardIcon, nyDesign && s.nyGhostIkon]}>
            <Ionicons name="restaurant-outline" size={18} color={nyDesign ? ny.lime : c.primary} />
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

      <DraggableBottomSheet
        visible={showPicker}
        onRequestClose={closePicker}
        sheetStyle={s.sheet}
        title={pickerStep === 'day'
          ? str.picker.chooseDay
          : replaceTarget
            ? str.picker.replaceTitle(replaceTarget.recipe.title)
            : pickingForDay
              ? DAYS.find(d => d.key === pickingForDay)?.label
              : str.picker.noDay}
        headerLeft={pickerStep !== 'day' && !replaceTarget ? (
          <Pressable onPress={() => setPickerStep('day')} hitSlop={10} accessibilityRole="button" accessibilityLabel={str.bulk.back}>
            <Ionicons name="chevron-back" size={22} color={SHEET_HEADER_ICON} />
          </Pressable>
        ) : undefined}
      >
          {pickerStep === 'day' ? (
            <>
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
              </View>
            </>
          ) : (
            <>
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
                        router.push(`/recipes/pick?create=1&forMenuDay=${day}&forMenuWeek=${weekYear}-${weekNumber}` as never);
                      }}
                    >
                      <View style={[s.recipeCardIcon, { backgroundColor: c.primaryTint }]}>
                        <Ionicons name="add" size={20} color={c.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.recipeCardTitle, { color: c.primary }]}>{str.picker.createNewRecipe}</Text>
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
                        <Ionicons name="restaurant-outline" size={20} color={c.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.recipeCardTitle}>{item.title}</Text>
                        <Text style={s.recipeCardMeta}>{recipesStr.card.meta(item.servings, item.ingredients.length, item.cookMinutes ? formateraTidsetikett(item.cookMinutes) : null)}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={c.border} />
                    </Pressable>
                  )}
                />
              )}
            </>
          )}
      </DraggableBottomSheet>

      {/* Shopping list cleanup modal */}
      <DraggableBottomSheet
        visible={!!cleanupPrompt}
        onRequestClose={() => setCleanupPrompt(null)}
        sheetStyle={s.sheet}
        title={str.dialogs.removeFromShoppingList.title}
        subtitle={cleanupPrompt ? str.dialogs.removeFromShoppingList.subtitle : undefined}
      >
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
                    color={selected ? c.primary : c.textFaint}
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
      </DraggableBottomSheet>
      {/* Transfer to shopping list modal */}
      <DraggableBottomSheet isDirty={newListName.trim() !== ''} visible={!!transferSheet} onRequestClose={() => { setTransferSheet(null); setNewListName(''); }} liftOffset={sheetLift} sheetStyle={s.sheet} title={str.bulk.chooseShoppingList}>
          {shoppingLists.length === 0 ? (
            <>
              <Text style={s.pickerEmptyText}>{str.bulk.noActiveList}</Text>
              <View style={s.createListRow}>
                <TextInput
                  ref={newListRef}
                  onFocus={onFocusInput(newListRef)}
                  style={[s.input, { flex: 1, marginTop: 0 }]}
                  placeholder={str.bulk.newListNamePlaceholder}
                  placeholderTextColor={c.textFaint}
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
                {transferringListId === l.id && <ActivityIndicator size="small" color={c.primary} />}
              </Pressable>
            ))
          )}
      </DraggableBottomSheet>

      {/* Bulk transfer modal — choose recipes and list */}
      <DraggableBottomSheet
        visible={showBulkTransferModal}
        // Drag nedåt och bakåtknappen STÄNGER guiden, precis som i appens
        // övriga ark. Förut steg de bakåt i guiden i stället, vilket kändes
        // som att arket hoppade tillbaka till föregående ruta när man försökte
        // stänga det. Stegen backas med de synliga Tillbaka-knapparna, och
        // öppnar man guiden igen återupptas samma steg med valen kvar (se
        // transferWeekMenu/openWeekPicker).
        onRequestClose={() => handleCancelBulkTransfer()}
        onOverlayPress={() => handleCancelBulkTransfer()}
        sheetStyle={s.sheet}
        title={bulkTransferStep === 'week'
          ? str.bulk.chooseWeekMenu
          : bulkTransferStep === 'recipe'
            ? str.bulk.chooseDishes
            : bulkTransferStep === 'ingredients'
              ? str.bulk.whatDoYouHave
              : str.bulk.chooseShoppingList}
        subtitle={bulkTransferStep === 'week'
          ? str.bulk.chooseWeekMenuSub
          : bulkTransferStep === 'recipe'
            ? (bulkTransferWeeks.size > 0
              ? str.bulk.fromWeeks(selectedRecipesForTransfer.size, bulkTransferWeeks.size)
              : str.bulk.chooseDishesSub)
            : bulkTransferStep === 'ingredients'
              ? str.bulk.haveHint
              : str.bulk.dishesToTransfer(selectedRecipesForTransfer.size)}
      >
          {bulkTransferStep === 'week' ? (
            <>
              <ScrollView style={s.bulkRecipeList}>
                {(() => {
                  // Samma källa som receptsteget och aggregeringen använder:
                  // transferredMenuItemIds är scopad till destinationslistan när
                  // vi kommer från en (originListId), annars över ALLA listor.
                  // Den lokala varianten här tittade bara på destList.items och
                  // gav en tom mängd när man kom från menyfliken — då gick det
                  // att välja en vecka vars rätter redan var överförda, och
                  // landa på ett tomt receptsteg. Den läser dessutom
                  // linkedMenuItemIds, som även fångar dolda merge-containers.
                  const transferredIds = transferredMenuItemIds;
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
                    // Samma regel som ovan: en vecka bockar bara i det som
                    // aldrig förts över, och räknas som färdig när inget är kvar.
                    const freshIds = items.filter(i => !transferredIds.has(i.id) && !i.transferred).map(i => i.id);
                    const allTransferred = freshIds.length === 0;
                    const weekSelected = bulkTransferWeeks.has(key);
                    return (
                      <Pressable
                        key={key}
                        style={[s.bulkRecipeItem, allTransferred && { opacity: 0.5 }, weekSelected && s.bulkRecipeItemActive]}
                        disabled={allTransferred}
                        onPress={() => {
                          setBulkTransferWeeks(prev => {
                            const n = new Set(prev);
                            if (n.has(key)) n.delete(key); else n.add(key);
                            return n;
                          });
                          // Håll rätt-valet i takt med veckovalet: en påslagen vecka
                          // tar med sina nya rätter, en avslagen plockar bort sina —
                          // annars ligger id:n kvar från en vecka man ångrat.
                          setSelectedRecipesForTransfer(prev => {
                            const n = new Set(prev);
                            for (const id of freshIds) {
                              if (weekSelected) n.delete(id); else n.add(id);
                            }
                            return n;
                          });
                        }}
                      >
                        <Ionicons
                          name={weekSelected ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={weekSelected ? c.primary : c.textFaint}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={s.bulkRecipeTitle}>{str.bulk.weekLabel(wn, wy)}</Text>
                          <Text style={s.bulkRecipeDay}>
                            {str.bulk.dishesCount(items.length)}
                            {` · ${allTransferred ? str.bulk.allAlreadyAdded : str.bulk.newCount(freshIds.length)}`}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  });
                })()}
              </ScrollView>
              <Pressable
                style={[s.button, bulkTransferWeeks.size === 0 && s.buttonDisabled]}
                disabled={bulkTransferWeeks.size === 0}
                onPress={() => setBulkTransferStep('recipe')}
              >
                <Text style={s.buttonText}>{str.bulk.weeksNext(bulkTransferWeeks.size)}</Text>
              </Pressable>
            </>
          ) : bulkTransferStep === 'recipe' ? (
            <>
              <ScrollView style={s.bulkRecipeList}>
                {(() => {
                  const rows = bulkPool.filter(item => !transferredMenuItemIds.has(item.id));
                  const renderRow = (item: (typeof rows)[number]) => {
                    const selected = selectedRecipesForTransfer.has(item.id);
                    return (
                      <Pressable
                        key={item._stableKey ?? item.id}
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
                          color={selected ? c.primary : c.textFaint}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={s.bulkRecipeTitle} numberOfLines={1}>{item.recipe.title}</Text>
                          {item.day !== null && (
                            <Text style={s.bulkRecipeDay}>
                              {DAYS.find(d => d.key === item.day)?.label}
                              {/* Förts över förut men inte längre kopplad till
                                  någon lista — troligen handlad och rensad.
                                  Den står okryssad; texten säger varför. */}
                              {item.transferred ? ` · ${str.bulk.alreadyTransferredRow}` : ''}
                            </Text>
                          )}
                        </View>
                      </Pressable>
                    );
                  };
                  // Utan veckorubriker går det inte att se vilken vecka en rätt
                  // hör till när man valt flera — och samma rätt kan ligga i två.
                  if (bulkTransferWeeks.size <= 1) return rows.map(renderRow);
                  const byWeek = new Map<string, typeof rows>();
                  for (const m of rows) {
                    const k = `${m.weekYear}-${m.weekNumber}`;
                    if (!byWeek.has(k)) byWeek.set(k, []);
                    byWeek.get(k)!.push(m);
                  }
                  return [...byWeek.entries()]
                    .sort(([a], [b]) => {
                      const [ay, aw] = a.split('-').map(Number);
                      const [by, bw] = b.split('-').map(Number);
                      return ay - by || aw - bw; // numeriskt: "2026-9" före "2026-10"
                    })
                    .map(([k, items]) => (
                      <View key={k}>
                        <Text style={s.bulkWeekHeader}>{str.bulk.weekShort(Number(k.split('-')[1]))}</Text>
                        {items.map(renderRow)}
                      </View>
                    ));
                })()}
              </ScrollView>
              <Pressable
                style={[s.button, selectedRecipesForTransfer.size === 0 && s.buttonDisabled]}
                disabled={selectedRecipesForTransfer.size === 0}
                onPress={() => {
                  if (!inventoryBuiltForRef.current || !idSetsEqual(inventoryBuiltForRef.current, selectedRecipesForTransfer)) {
                    resetInventoryFor(selectedRecipesForTransfer);
                  }
                  setBulkTransferStep('ingredients');
                }}
              >
                <Text style={s.buttonText}>{str.bulk.next}</Text>
              </Pressable>
              {/* Bara när man kom hit via veckovalet — annars är receptsteget
                  första steget och har inget att gå tillbaka till. Samma villkor
                  som hårdvaru-back använder i handleBulkBack. */}
              {bulkTransferWeeks.size > 0 && (
                <Pressable style={s.cancelBtn} onPress={() => setBulkTransferStep('week')}>
                  <Text style={s.cancelBtnText}>{str.bulk.back}</Text>
                </Pressable>
              )}
            </>
          ) : bulkTransferStep === 'ingredients' ? (
            <>
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
                    setBulkSelectedListId(null);
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
              {shoppingLists.length === 0 ? (
                <>
                  <Text style={s.pickerEmptyText}>{str.bulk.noActiveList}</Text>
                  <View style={s.createListRow}>
                    <TextInput
                      style={[s.input, { flex: 1, marginTop: 0 }]}
                      placeholder={str.bulk.newListNamePlaceholder}
                      placeholderTextColor={c.textFaint}
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
                  {shoppingLists.map(l => {
                    const selected = bulkSelectedListId === l.id;
                    return (
                      <Pressable
                        key={l.id}
                        style={[s.pickerItem, selected && s.pickerItemActive, !!bulkTransferringListId && s.pickerItemDisabled]}
                        onPress={() => setBulkSelectedListId(l.id)}
                        disabled={!!bulkTransferringListId}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.pickerItemTitle}>{l.name}</Text>
                          <Text style={s.pickerItemMeta}>{str.bulk.itemsCount(l.items.length)}</Text>
                        </View>
                        {bulkTransferringListId === l.id
                          ? <ActivityIndicator size="small" color={c.primary} />
                          : selected && <Ionicons name="checkmark-circle" size={22} color={c.primary} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
              {shoppingLists.length > 0 && (
                <Pressable
                  style={[s.button, (!bulkSelectedListId || !!bulkTransferringListId) && s.buttonDisabled]}
                  onPress={() => bulkSelectedListId && executeBulkTransfer(bulkSelectedListId)}
                  disabled={!bulkSelectedListId || !!bulkTransferringListId}
                >
                  {bulkTransferringListId
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.buttonText}>{str.bulk.transfer}</Text>}
                </Pressable>
              )}
              <Pressable
                style={[s.button, { backgroundColor: ny.ljus }]}
                onPress={() => setBulkTransferStep('ingredients')}
              >
                <Text style={[s.buttonText, { color: ny.padYta }]}>{str.bulk.back}</Text>
              </Pressable>
            </>
          )}
      </DraggableBottomSheet>

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
      </SafeAreaView>
    </View>
  );
}

/**
 * Draghandtag på menykortet — samma affordans som kategorilistan i butiksvyn.
 *
 * Gesten ligger på handtaget i stället för på hela kortet, av ett skäl som bara
 * gäller webben: ett kort måste släppa igenom vertikal scroll (touchAction
 * "pan-y"), och då avbryter webbläsaren gesten så fort fingret rör sig nedåt —
 * draget grep tag men släppte direkt. Ett dedikerat handtag får touchAction
 * "none" utan att stjäla scroll, eftersom ytan inte är något annat än handtaget.
 *
 * Inget långtryck här: handtaget ÄR avsikten, så draget ska starta direkt.
 * Gestobjektet memoiseras så det lever genom hela draget i stället för att
 * byggas om vid varje omrendering.
 */
function MenuCardDragHandle({ onDragStart, onDragMove, onDragEnd }: {
  onDragStart: (x: number, y: number, touchOffsetY: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
}) {
  const { colors: c, ny } = useTheme();
  const { medium } = useHaptics();
  const gesture = useMemo(() => Gesture.Pan()
    .hitSlop(8)
    .onStart(e => {
      runOnJS(medium)();
      runOnJS(onDragStart)(e.absoluteX, e.absoluteY, e.y);
    })
    .onUpdate(e => { runOnJS(onDragMove)(e.absoluteX, e.absoluteY); })
    .onFinalize(() => { runOnJS(onDragEnd)(); }),
    [onDragStart, onDragMove, onDragEnd, medium]);

  return (
    <GestureDetector gesture={gesture} touchAction="none">
      <View style={{ width: 36, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' }}>
        <Ionicons name="reorder-two" size={22} color={c.textFaint} />
      </View>
    </GestureDetector>
  );
}

function MenuCard({
  item,
  isTransferred,
  listNamn,
  isPending,
  isPastWeek,
  onRemove,
  onCookRecipe,
  onReplace,
  onMoveToDay,
  onDragStart,
  onDragMove,
  onDragEnd,
  isDragging,
  scaledServings,
  onScaleServings,
  onSetMeal,
  dayLabel,
  collapsedForDrag,
  hero,
  idag,
}: {
  item: WeekMenuItemWithRecipe;
  isTransferred: boolean;
  /** Namnen på de listor rätten ligger i just nu. Tom = ingen. */
  listNamn: string[];
  isPending?: boolean;
  isPastWeek?: boolean;
  dayLabel?: { abbr: string; date: number };
  onRemove: () => void;
  onCookRecipe: () => void;
  onMoveToDay: (day: WeekDay | null) => void;
  onReplace: () => void;
  onDragStart: (x: number, y: number, touchOffsetY: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  scaledServings: number;
  onScaleServings: (n: number) => void;
  onSetMeal: (meal: MealType | null) => void;
  collapsedForDrag?: boolean;
  /** Ny design: dagens första rätt visar receptbilden som banderoll. */
  hero?: boolean;
  /** Ny design: dagens rätter visar Laga direkt i det hopfällda kortet. */
  idag?: boolean;
}) {
  const { colors: c, ny } = useTheme();
  const s = useMemo(() => makeStyles(c, ny), [c, ny]);
  const [expanded, setExpanded] = useState(false);
  // While any card is being dragged, collapse every card so the list is compact.
  // Also clear the expanded state so cards stay collapsed after the move.
  const isExpanded = expanded && !collapsedForDrag;
  useEffect(() => { if (collapsedForDrag) setExpanded(false); }, [collapsedForDrag]);
  const { fs, sp } = useTablet();
  const { nyDesign } = useDesign();
  const bildUrl = item.recipe.imageUrl ?? null;
  // "I inköpslistan" räcker inte när hushållet har flera listor — då säger
  // märket inte VILKEN man ska titta i. Med flera listor blir det antalet;
  // namnen skulle inte få plats på raden.
  const listMarke = listNamn.length === 1
    ? str.card.inNamedList(listNamn[0])
    : listNamn.length > 1
      ? str.card.inSeveralLists(listNamn.length)
      : str.card.inShoppingList;
  // Dagens första rätt visar bilden stort hela tiden; övriga när de fälls ut.
  const visaHero = nyDesign && !!bildUrl && (!!hero || isExpanded);
  // Samma platshållare som receptlistan, så ett recept ser likadant ut i båda.
  const ph = nyDesign && !bildUrl
    ? platshallare(item.recipe.id, [item.recipe.title, ...(item.recipe.tags ?? [])].join(' '))
    : null;

  function handlePress() {
    setExpanded(e => !e);
  }

  // Drag-flytt sker via handtaget på kortet (MenuCardDragHandle), på alla
  // plattformar. Tidigare var det långtryck på hela kortet på native och
  // saknades helt på web.
  //
  // Avstängningen på web motiverades en gång med att RNGH:s touch-action: none
  // blockerade webbläsarens horisontella sid-svep för veckobyte. Det svepet
  // togs bort i en senare ändring — web renderar bara aktuell vecka och byter
  // via pilarna — men avstängningen blev kvar. touchAction="pan-y" på kortet
  // provades sedan och fungerade inte: browsern startar sin scroll så fort
  // fingret rör sig nedåt och avbryter gesten, så draget grep tag och släppte
  // direkt. Ett dedikerat handtag löser bådadera.
  const isWeb = Platform.OS as any === 'web';
  const cardBody = (
      <View style={[s.card, nyDesign && s.nyKort, isDragging && s.cardDragging, isPending && s.cardPending]}>
        <View style={[s.cardInner, nyDesign && s.nyKortInner]}>
          {/* Bilden faller ocksa ut kortet. Den ar kortets storsta yta, alltsa
              det lattaste att traffa — att bara rubrikraden fungerade gjorde
              utfallningen onodigt svar pa dagens ratt. */}
          {visaHero && (
            <Pressable style={s.nyHero} onPress={handlePress} accessibilityRole="button" accessibilityLabel={item.recipe.title}>
              {/* ReceptBild, inte en rå Image: utsnittet man valt i receptet ligger i
                  imageFocusX/Y, och utan den beskars bilden uppifrån här. */}
              <ReceptBild uri={bildUrl!} fokusX={item.recipe.imageFocusX} fokusY={item.recipe.imageFocusY} style={StyleSheet.absoluteFill} />
              {/* Tiden på bilden, som på receptkorten — bara hopfälld. Utfällt
                  står den bredvid "I inköpslistan". */}
              {!isExpanded && item.recipe.cookMinutes ? (() => {
                const tid = formateraTidsetikett(item.recipe.cookMinutes);
                return (
                  <View style={s.nyHeroTid}>
                    <Ionicons name="time-outline" size={13} color={ny.lime} />
                    {/* Explicit bredd: Android klipper annars sista glyfen. */}
                    <Text style={[s.nyHeroTidText, { width: Math.ceil(tid.length * 7) + 4 }]} numberOfLines={1}>{tid}</Text>
                  </View>
                );
              })() : null}
            </Pressable>
          )}
          {/* Egen rad för den hopfällda delen: cardInner staplar vertikalt (den
              bär även den utfällda delen), så handtaget hamnade annars på en ny
              rad under kortet i stället för i högerkanten. */}
          <View style={s.cardTopRow}>
          {/* paddingRight mindre än övrig padding: avståndet till handtaget är
              summan av den HÄR paddingen och handtagets inre marginal (ikonen
              är 22 px i en 36 px bred yta, alltså 7 px på var sida). Med 14 blev
              glappet ~21 px mot kundvagnens 12. 5 + 7 ≈ 12 — samma rytm. */}
          <Pressable style={[s.cardMain, { padding: sp(14), paddingRight: sp(5), gap: sp(12) }, nyDesign && s.nyKortMain]} onPress={handlePress}>
            {dayLabel ? (
              <View style={[s.dayLabelBox, { width: sp(36), height: sp(36) }]}>
                <Text style={[s.dayLabelAbbr, { fontSize: fs(11) }]}>{dayLabel.abbr}</Text>
                <Text style={[s.dayLabelDate, { fontSize: fs(13) }]}>{dayLabel.date}</Text>
              </View>
            ) : nyDesign ? (
              visaHero ? null : bildUrl ? (
                <Image source={{ uri: bildUrl }} style={s.nyTumnagel} resizeMode="cover" />
              ) : (
                <View style={[s.nyTumnagel, s.nyTumnagelTom, ph?.ton === 'mork' ? s.nyTumMork : s.nyTumLjus]}>
                  <Ionicons name={ph!.ikon} size={20} color={ph?.ton === 'mork' ? ny.lime : ny.padYta} />
                </View>
              )
            ) : (
              <View style={[s.cardIcon, { width: sp(30), height: sp(30) }]}>
                <Ionicons name="restaurant-outline" size={fs(16)} color={c.primary} />
              </View>
            )}
            <View style={s.cardContent}>
              {item.mealType && (
                <Text style={[s.cardMealTag, { fontSize: fs(10) }, nyDesign && s.nyMaltid]}>{common.mealTypes[item.mealType].toUpperCase()}</Text>
              )}
              {/* Ingen chevron i nya designen: att kortet gar att falla ut
                  forstar man anda, och den satt i vagen bredvid rubriken. */}
              <Text style={[s.cardTitle, { fontSize: fs(16) }, nyDesign && s.nyKortTitel, isPending && s.cardTitlePending]} numberOfLines={isExpanded ? undefined : 1}>{item.recipe.title}</Text>
            </View>
            {/* Kundvagnen före chevronen, och chevronen närmast draghandtaget:
                de två sitter ihop som kortets högerkant. Båda ligger utanför
                innehållskolumnen så cardMain centrerar dem mot kortet — inne i
                kolumnen hamnade chevronen under mitten så fort måltidsetiketten
                fanns ovanför rubriken. */}
            {/* Dagens rätter: Laga direkt i det hopfällda kortet — det är vad
                man oftast vill göra med kvällens mat. Utfällt ligger den bland
                de andra knapparna, på samma plats som för övriga dagar. */}
            {nyDesign && idag && !isExpanded && (
              <Pressable style={s.nyLagaSnabb} onPress={onCookRecipe} hitSlop={6} accessibilityRole="button" accessibilityLabel={str.card.cook}>
                <Ionicons name="flame-outline" size={15} color={ny.skog} />
                <Text style={s.nyLagaSnabbText}>{str.card.cook}</Text>
              </Pressable>
            )}
            {/* Ny design: ingen kundvagn i det hopfällda läget — det utfällda
                visar om rätten ligger i inköpslistan, och utrymmet behövs till
                titeln. Chevronen sitter vid rubriken i stället för här. */}
            {!nyDesign && isTransferred && (
              <Ionicons name="cart" size={fs(16)} color={c.success} />
            )}
            {!nyDesign && (
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={fs(16)} color={c.textFaint} />
            )}
          </Pressable>

          {/* Eget draghandtag, samma som kategorilistan. Ett dedikerat handtag
              är enda sättet som fungerar i PWA:n: på HELA kortet måste
              touchAction vara "pan-y" för att listan ska gå att scrolla, och då
              avbryter webbläsaren gesten så fort fingret rör sig nedåt — draget
              grep tag men släppte direkt. Här är ytan dedikerad till draget, så
              touchAction "none" är korrekt och gesten blir pålitlig. */}
          {!isPastWeek && (
            <MenuCardDragHandle onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} />
          )}
          </View>

          {/* Ny design: eget utfällt läge i stället för den gamla designens
              grå chips och textknappar. */}
          {isExpanded && nyDesign && (
            <View style={s.nyUtfallt}>
              {/* Måltiden överst — samma plats som etiketten i hopfällt läge.
                  En gammal vecka är historik: allt syns som vanligt, men inget
                  går att ändra (dämpat och avstängt). */}
              <View style={s.nyUtfalltSektion}>
                <Text style={s.nyEtikett}>{common.mealTypes.label}</Text>
                {/* Radbrytning, INTE sidscroll. Raden låg tidigare i en
                    horisontell ScrollView inuti veckopagern, som också scrollar
                    i sidled — och pagern tog gesten: man bytte vecka i stället
                    för måltid. Att stänga av pagern medan raden rörs räckte
                    inte, den hade redan tagit svepet. Med sju måltider ryms
                    alla på två rader, och då behövs ingen scroll alls. */}
                <View style={s.nyChipRader}>
                  {MEAL_TYPE_ORDER.map(mt => {
                    const active = item.mealType === mt;
                    return (
                      <Pressable key={mt} style={[s.nyChip, active && s.nyChipAktiv, isPastWeek && !active && s.nyLast]} onPress={() => onSetMeal(mt)} disabled={isPastWeek}>
                        <Text style={[s.nyChipText, active && s.nyChipTextAktiv]}>{common.mealTypes[mt]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Tid och "I inköpslistan" som vanlig text till vänster — som
                  brickor såg de tryckbara ut. Portionerna till höger. */}
              <View style={s.nyUtfalltRad}>
                <View style={s.nyMarken}>
                  {item.recipe.cookMinutes ? (() => {
                    const tid = formateraTidsetikett(item.recipe.cookMinutes);
                    return (
                      <View style={s.nyMarke}>
                        <Ionicons name="time-outline" size={14} color={ny.padYta} />
                        {/* Explicit bredd: Android klipper annars sista glyfen. */}
                        <Text style={[s.nyMarkeText, s.nyTid, { width: tid.length * 8 + 6 }]} numberOfLines={1}>{tid}</Text>
                      </View>
                    );
                  })() : null}
                  {isTransferred && (
                    <View style={s.nyMarke}>
                      <Ionicons name="cart" size={13} color={ny.textDampad} />
                      {/* Explicit bredd — utan den klipptes texten till "I". */}
                      <Text
                        style={[s.nyMarkeText, { width: Math.min(150, listMarke.length * 8 + 8) }]}
                        numberOfLines={1}
                      >{listMarke}</Text>
                    </View>
                  )}
                </View>
                {/* Överförd rätt: portionerna är låsta — listan har redan
                    mängderna för dem. Låset visas i stället för −/+. */}
                {isTransferred && !isPastWeek ? (
                  <View style={s.nyPortioner} accessibilityLabel={str.card.servingsLockedA11y(scaledServings)}>
                    <Ionicons name="lock-closed" size={12} color={ny.textDampad} style={s.nyPortionLas} />
                    <Text style={s.nyPortionVarde}>{str.card.servingsOnly(scaledServings)}</Text>
                  </View>
                ) : (
                  <View style={s.nyPortioner}>
                    <Pressable onPress={() => onScaleServings(Math.max(1, scaledServings - 1))} style={s.nyPortionKnapp} hitSlop={6}>
                      <Ionicons name="remove" size={14} color={ny.padYta} />
                    </Pressable>
                    <Text style={s.nyPortionVarde}>{str.card.servingsOnly(scaledServings)}</Text>
                    <Pressable onPress={() => onScaleServings(scaledServings + 1)} style={s.nyPortionKnapp} hitSlop={6}>
                      <Ionicons name="add" size={14} color={ny.padYta} />
                    </Pressable>
                  </View>
                )}
              </View>


              {/* Laga med text till vänster; byt ut och ta bort som ikonknappar
                  till höger — tre textknappar blev plottrigt. */}
              <View style={s.nyKnappRad}>
                <Pressable style={[s.nyKnapp, s.nyKnappLime]} onPress={onCookRecipe}>
                  <Ionicons name="flame-outline" size={15} color={ny.skog} />
                  <Text style={s.nyKnappText}>{str.card.cook}</Text>
                </Pressable>
                <View style={s.nyKnappFyll} />
                <Pressable style={[s.nyIkonKnapp, isPastWeek && s.nyLast]} onPress={onReplace} disabled={isPastWeek} accessibilityRole="button" accessibilityLabel={str.card.replace} accessibilityState={{ disabled: !!isPastWeek }}>
                  <Ionicons name="swap-horizontal-outline" size={18} color={ny.padYta} />
                </Pressable>
                <Pressable style={[s.nyIkonKnapp, isPastWeek && s.nyLast]} onPress={onRemove} disabled={isPastWeek} accessibilityRole="button" accessibilityLabel={str.card.remove} accessibilityState={{ disabled: !!isPastWeek }}>
                  <Ionicons name="trash-outline" size={18} color={ny.padYta} />
                </Pressable>
              </View>
            </View>
          )}

          {isExpanded && !nyDesign && (
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
                  <Ionicons name="cart" size={fs(14)} color={c.success} />
                  <Text style={[s.transferredText, { fontSize: fs(11) }]}>{listMarke}</Text>
                </View>
              )}
              {/* Portion scaler — cutlery icon grouped with the −/+ on the right */}
              <View style={s.servingScaler}>
                <Ionicons name="restaurant-outline" size={fs(16)} color={c.textMuted} />
                <View style={s.servingScalerControls}>
                  <Pressable
                    onPress={() => onScaleServings(Math.max(1, scaledServings - 1))}
                    style={s.servingScalerBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="remove" size={14} color={c.primary} />
                  </Pressable>
                  <Text style={s.servingScalerValue}>{scaledServings}</Text>
                  <Pressable
                    onPress={() => onScaleServings(scaledServings + 1)}
                    style={s.servingScalerBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="add" size={14} color={c.primary} />
                  </Pressable>
                </View>
              </View>

              {/* Måltidstyp — frivillig etikett. Tryck igen för att rensa. */}
              {!isPastWeek && (
                <View style={s.mealPicker}>
                  <Text style={[s.mealPickerLabel, { fontSize: fs(12) }]}>{common.mealTypes.label}</Text>
                  <View style={s.mealPickerChips}>
                    {MEAL_TYPE_ORDER.map(mt => {
                      const active = item.mealType === mt;
                      return (
                        <Pressable key={mt} style={[s.mealPickerChip, active && s.mealPickerChipActive]} onPress={() => onSetMeal(mt)}>
                          <Text style={[s.mealPickerChipText, active && s.mealPickerChipTextActive, { fontSize: fs(11) }]}>{common.mealTypes[mt]}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={s.cardActions}>
                {/* "Laga" i stället för "Visa": från veckomenyn är avsikten
                    oftast att laga rätten, inte att läsa om den. Receptet nås
                    ändå — laga-läget öppnas ovanpå receptsidan, så ett bakåt
                    lämnar en där. */}
                <Pressable style={s.cardAction} onPress={onCookRecipe}>
                  <Ionicons name="flame-outline" size={15} color={c.textMuted} />
                  <Text style={s.cardActionText}>{str.card.cook}</Text>
                </Pressable>
                {!isPastWeek && (
                  <Pressable style={s.cardAction} onPress={onReplace}>
                    <Ionicons name="swap-horizontal-outline" size={15} color={c.textMuted} />
                    <Text style={s.cardActionText}>{str.card.replace}</Text>
                  </Pressable>
                )}
                {!isPastWeek && (
                  <Pressable style={s.cardAction} onPress={onRemove}>
                    <Ionicons name="trash-outline" size={15} color={c.danger} />
                    <Text style={[s.cardActionText, { color: c.danger }]}>{str.card.remove}</Text>
                  </Pressable>
                )}
              </View>

              {/* Dag-chipsen tillkom när web saknade drag. Draget finns nu även
                  där, men chipsen är kvar: med mus är ett klick bekvämare än
                  att dra, och de fungerar utan att man hittar handtaget. */}
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

  // Draget startas från handtaget, på alla plattformar. Tidigare låg det som ett
  // långtryck på hela kortet på native och saknades helt på web — två olika sätt
  // att göra samma sak, beroende på var man råkade vara.
  return cardBody;
}

const makeStyles = (c: Palette, ny: NyPalett) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.primaryTint, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  headerActionText: { fontWeight: '600', color: c.primary, fontSize: 13 },
  headerIconBtn: { justifyContent: 'center', alignItems: 'center', backgroundColor: c.primaryTint, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  // En rad i den nya inventerings-vyn: namn + behov till vänster, "Har"-input
  // + ✓ Allt-knapp till höger. Allt på samma rad, ingen mode-toggle.
  invRowV2: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ny.kontur, gap: 6 },
  invRowCol: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ny.kontur, gap: 4 },
  invName: { fontSize: 15, color: ny.text, fontWeight: '500' },
  invNameDone: { color: ny.textDampad, textDecorationLine: 'line-through' },
  invProvenance: { fontSize: 12, color: ny.textDampad, marginTop: 2 },
  // minWidth = baseline; växer automatiskt om enheten är lång (paket, påse…)
  // så enheten alltid syns helt. paddingHorizontal lite mindre för att inte
  // knappen ska bli onödigt bred.
  invRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Explicit minWidth (beräknas per label) — Android mäter vissa strängar
  // ("kg", "dl", "tsk") för smalt och klipper annars sista glyfen.
  invValue: { fontSize: 14, color: ny.padYta, fontWeight: '700' },
  invSliderTrack: { height: 26, justifyContent: 'center', marginTop: 2 },
  // borderLight/surface försvann mot arkets ljusgröna botten. Spåret i kontur,
  // fyllnaden mörkgrön och knoppen lime med mörkgrön kant — samma par som
  // notistogglen. Knoppens mått (18) används i thumbStyle, ändra inte ensidigt.
  invSliderRail: { position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: ny.kontur },
  invSliderFill: { position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: ny.padYta },
  invSliderThumb: { position: 'absolute', left: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: ny.lime, borderWidth: 2, borderColor: ny.skog, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  // Default-läge: NEUTRAL grå/vit så knappen INTE ser tryckt ut. Aktivt läge
  // (tryckt) blir grön + ifylld.
  // Lime när varan finns: designens "vald". Av-läget ljust på den gröna botten.
  invAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: ny.kontur, backgroundColor: ny.ljus },
  invAllBtnOn: { backgroundColor: ny.lime, borderColor: ny.lime },
  invAllBtnText: { fontSize: 12, fontWeight: '700', color: ny.textDampad },
  invAllBtnTextOn: { color: ny.skog },
  content: { flex: 1 },
  // Ny design (beta)
  nyContainer: { backgroundColor: ny.skog },
  nyInnehall: { backgroundColor: ny.bakgrund },
  // Raden ligger ABSOLUT i ytan, förankrad i nederkanten. I flödet krympte
  // den med ytan under animationen, onLayout mätte den krympta höjden och den
  // blev ny fullhöjd — raden kom aldrig tillbaka hel. Absolut påverkas dess
  // höjd aldrig av ytan; ytan får sin höjd enbart från mätningen.
  nyVeckaNav: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 14 },
  nyVeckaFall: { overflow: 'hidden' },
  nyInnehallInner: { paddingHorizontal: 12 },
  nyDagar: { gap: 10 },
  // Dagens ruta i samma distinkta ton som receptens platshållare: mot `kort`
  // syntes knappt var en dag började, och med flera rätter samma dag gick det
  // inte att se att de hörde ihop.
  nyDag: { padding: 8, paddingTop: 6, gap: 6, borderRadius: 18, backgroundColor: ny.platsLjus },
  // Borderns 1,5 px dras av från utfyllnaden, så en tom dag är lika bred som en fylld.
  nyDagTomRuta: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: ny.kontur, padding: 6.5, paddingTop: 4.5 },
  nyDagTomRutaHover: { borderStyle: 'solid', borderColor: ny.skog, backgroundColor: ny.platsLjus },
  nyDagHuvud: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30, paddingHorizontal: 4 },
  // flexShrink: 0 hindrar texterna från att krympa mot flex-utfyllnaden, men
  // räckte inte ensamt — datumet och "I inköpslistan" får explicit bredd i JSX.
  nyDagNamn: { fontFamily: nyFont.fet, fontSize: 15, color: ny.padYta, flexShrink: 0 },
  // Vansterstalld: centrerad delade overskottet i boxen lika och skot i stallet
  // ivag datumet fran dagens namn. Market kompenserar i stallet med negativ
  // marginal, se dagRubrik.
  nyDagDatum: { fontSize: 13, color: ny.textDampad, flexShrink: 0 },
  nyIdagMarke: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: ny.skog, flexShrink: 0 },
  nyIdagMarkeText: { fontSize: 11, fontWeight: '700', color: ny.lime, flexShrink: 0 },
  nyDagLaggTill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nyDagKortLista: { gap: 6 },
  nyDagTomText: { fontSize: 13, fontWeight: '600', color: ny.chipText, flexShrink: 0 },
  // Korten är ljusa inuti dagens gröntonade ruta.
  nyKort: { borderRadius: 14, borderWidth: 0, borderLeftWidth: 0, backgroundColor: ny.ljus, shadowOpacity: 0, elevation: 0 },
  nyKortInner: { backgroundColor: ny.ljus, borderRadius: 14 },
  nyKortMain: { padding: 6, paddingRight: 2, gap: 10 },
  // Outfit har vikten i själva typsnittet — en fontWeight till gör att
  // Android väljer ett reservtypsnitt.
  nyKortTitel: { fontFamily: nyFont.fet, fontWeight: 'normal', fontSize: 15, letterSpacing: -0.3, color: ny.text },
  nyMaltid: { color: ny.chipText },
  nyTid: { color: ny.padYta, fontWeight: '700' },
  nyMarken: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 1 },
  nyPortionLas: { marginHorizontal: 4 },
  // Gammal vecka: kontrollen syns men går inte att använda.
  nyLast: { opacity: 0.35 },
  nyTumnagel: { width: 44, height: 44, borderRadius: 11 },
  nyTumnagelTom: { alignItems: 'center', justifyContent: 'center' },
  nyTumMork: { backgroundColor: ny.skogMellan },
  // Samma ljusgröna bricka som ikonerna i inköpslistor och butiker. platsLjus
  // gick inte längre att använda: dagens ruta bär den tonen nu, så ikonen
  // smälte ihop med bakgrunden i stället för att läsa som en egen bricka.
  nyTumLjus: { backgroundColor: ny.bricka },
  nyHero: { height: 120 },
  nyHeroTid: {
    position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, height: 26, borderRadius: 13, backgroundColor: ny.bandOverlay,
  },
  nyHeroTidText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  // Luft mot draghandtaget, så Laga inte hamnar tätt intill strecken.
  nyLagaSnabb: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 11, borderRadius: 16, marginRight: 8, backgroundColor: ny.lime },
  nyLagaSnabbText: { fontSize: 13, fontWeight: '700', color: ny.skog },
  // Utfällt kort
  // Utfällt: SAMMA färg som kortet — varje avvikande ton (mörkgrön, och sedan
  // vit) lästes som ett annat kort. Bara en hårfin linje mot rubrikraden.
  nyUtfallt: {
    paddingHorizontal: 10, paddingTop: 10, paddingBottom: 10, gap: 12,
    borderTopWidth: 1, borderTopColor: ny.kontur,
  },
  nyUtfalltRad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nyUtfalltSektion: { gap: 6 },
  // Text, ingen bricka — men samma höjd som portionskapseln så raden linjerar.
  nyMarke: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingLeft: 2, flexShrink: 0 },
  nyMarkeText: { fontSize: 12, color: ny.textDampad, flexShrink: 0 },
  nyPortioner: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: 17, backgroundColor: ny.kort },
  nyPortionKnapp: { width: 28, height: 28, borderRadius: 14, backgroundColor: ny.ljus, alignItems: 'center', justifyContent: 'center' },
  nyPortionVarde: { fontSize: 13, fontWeight: '700', color: ny.padYta, paddingHorizontal: 6, flexShrink: 0 },
  nyEtikett: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, color: ny.textDampad },
  nyChipRad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nyChipRader: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nyChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, backgroundColor: ny.kort },
  nyChipAktiv: { backgroundColor: ny.skog },
  nyChipText: { fontSize: 12, fontWeight: '600', color: ny.chipText },
  nyChipTextAktiv: { color: ny.lime },
  nyKnappRad: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nyKnappFyll: { flex: 1 },
  nyKnapp: { height: 38, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 16, backgroundColor: ny.kort, flexShrink: 0 },
  nyKnappLime: { backgroundColor: ny.lime },
  nyIkonKnapp: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ny.kort },
  nyKnappText: { fontSize: 13, fontWeight: '700', color: ny.skog, flexShrink: 0 },
  nyDagPlus: { width: 28, height: 28, borderRadius: 14, backgroundColor: ny.bricka, alignItems: 'center', justifyContent: 'center' },
  nyFab: { backgroundColor: ny.lime, shadowColor: ny.skog, shadowOpacity: 0.3 },
  nyGhost: { backgroundColor: ny.ljus, borderRadius: 14, borderWidth: 1.5, borderColor: ny.skog, shadowColor: ny.skog },
  nyGhostIkon: { backgroundColor: ny.skogMellan },
  contentInner: { padding: 16, gap: 2, paddingBottom: 80 },
  contentInnerTablet: { padding: 8, gap: 2 },
  daysRow: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  daysCol: { gap: 14 },
  weekAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: c.primary200, borderStyle: 'dashed', backgroundColor: c.surface },
  weekAddBtnText: { fontSize: 14, fontWeight: '600', color: c.primary },
  daySlotWide: { flex: 1, minWidth: 0, minHeight: 80 },
  daySlotEmptyWide: { borderStyle: 'dashed', borderColor: c.border, backgroundColor: 'transparent' },
  dayColHeader: { alignItems: 'center', paddingTop: 4, paddingBottom: 2 },
  dayColEmptyTap: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  section: { gap: 2 },
  dayLabelBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.primaryTint, alignItems: 'center', justifyContent: 'center' },
  dayLabelAbbr: { fontSize: 11, fontWeight: '800', color: c.accent, letterSpacing: 0.3 },
  dayLabelDate: { fontSize: 13, fontWeight: '700', color: c.primary },
  dayLabelBoxMuted: { backgroundColor: c.surfaceSubtle },
  dayLabelAbbrMuted: { color: c.textFaint },
  dayLabelDateMuted: { color: c.textMuted },
  daySlotEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, minHeight: 44, alignSelf: 'stretch' },
  dayNameHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 4, paddingBottom: 6 },
  dayHeaderName: { fontSize: 14, fontWeight: '700', color: c.text },
  dayHeaderDate: { fontSize: 13, fontWeight: '600', color: c.textFaint },
  dayHeaderMuted: { color: c.textFaint },
  dayEmptyTap: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  daySlot: { borderWidth: 1, borderColor: c.primary200, borderRadius: 12, padding: 6, gap: 2, backgroundColor: c.surface },
  daySlotEmpty: { borderStyle: 'dashed', borderColor: c.border, backgroundColor: 'transparent', minHeight: 64, alignItems: 'center', justifyContent: 'center', padding: 0 },
  daySlotFilled: { borderWidth: 0, padding: 0, backgroundColor: 'transparent' },
  // Droppmålets ram ligger i ett ABSOLUT överlägg (dropOutline), inte på
  // dagen själv. Tidigare satte den borderWidth 1.5 + padding 6 på en dag som
  // annars har 0 och 0 — varje dag växte alltså 15 px så fort ett drag
  // började, och hela veckan hoppade till. Bara bakgrunden ändras här.
  daySlotDropTarget: { backgroundColor: c.background },
  daySlotHovered: { backgroundColor: c.primaryTint },
  // Absolut placerad ram: påverkar inte layouten, så inget hoppar när den
  // tänds. borderRadius matchar dagens egen så hörnen ligger rätt.
  dropOutline: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.primary200, borderRadius: 12 },
  dropOutlineHovered: { borderStyle: 'solid', borderColor: c.primary },
  // Telefon: ramen ligger runt korten och sticker ut 4 px, så den inte göms
  // under kortens egna rundade hörn och skugga. Absolut — ingen layoutpåverkan.
  dropOutlineContent: { top: -4, right: -4, bottom: -4, left: -4, borderRadius: 14 },
  dayEmptyTapHovered: { borderStyle: 'solid', borderColor: c.primary, backgroundColor: c.primaryTint },
  daySlotEmptyTap: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: c.accent, letterSpacing: 0.8 },
  dayHeader: { gap: 1 },
  dayHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 14, fontWeight: '700', color: c.text },
  dayDate: { fontSize: 11, color: c.textMuted },
  emptyDayText: { fontSize: 13, color: c.textFaint, paddingVertical: 8 },
  emptyDayTap: { paddingVertical: 4, alignItems: 'flex-start' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: c.primaryBtn, alignItems: 'center', justifyContent: 'center', shadowColor: c.primary, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  // Heltäckande ram + tydligare skugga så kortet syns mot den ljusa bakgrunden
  // även i PWA (web renderar knappt shadowOpacity 0.03 → kortet såg ramlöst ut).
  card: { borderRadius: 12, borderWidth: 1, borderColor: c.borderLight, borderLeftWidth: 3, borderLeftColor: c.primary200, backgroundColor: c.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardInner: { backgroundColor: c.surface, borderRadius: 12, overflow: 'hidden' },
  // Raden som bär hopfällda kortet + draghandtaget. cardMain får flex:1 så
  // handtaget hamnar i högerkanten oavsett hur lång rubriken är.
  cardTopRow: { flexDirection: 'row', alignItems: 'stretch' },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  cardIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: c.primaryTint, alignItems: 'center', justifyContent: 'center' },
  // flex:1 så kundvagn och chevron pressas ut mot draghandtaget i stället för
  // att klibba vid rubriken — de tre bildar kortets högerkant tillsammans.
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: c.text, flexShrink: 1 },
  cardMealTag: { fontSize: 10, fontWeight: '700', color: c.primary, letterSpacing: 0.5, marginBottom: 1 },
  mealPicker: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4, paddingBottom: 8 },
  mealPickerLabel: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  mealPickerChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  mealPickerChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: c.surfaceSubtle, borderWidth: 1, borderColor: c.borderLight },
  mealPickerChipActive: { backgroundColor: c.primaryTint, borderColor: c.primary },
  mealPickerChipText: { fontSize: 11, fontWeight: '600', color: c.textMuted },
  mealPickerChipTextActive: { color: c.primary },
  cardMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  transferredBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  transferredText: { fontSize: 11, color: c.success, fontWeight: '600' },
  cardExpanded: { borderTopWidth: 1, borderTopColor: c.surfaceSubtle, paddingHorizontal: 14, paddingBottom: 12 },
  servingScaler: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 12, paddingBottom: 4 },
  servingScalerLabel: { fontSize: 13, color: c.textMuted, fontWeight: '500' },
  servingScalerControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  servingScalerBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: c.primaryTint, alignItems: 'center', justifyContent: 'center' },
  servingScalerValue: { fontSize: 15, fontWeight: '700', color: c.text, minWidth: 24, textAlign: 'center' },
  servingScalerReset: { fontSize: 12, color: c.textFaint, textDecorationLine: 'underline' },
  cardActions: { flexDirection: 'row', gap: 0, paddingTop: 10, pointerEvents: 'auto' },
  moveRow: { paddingTop: 10, gap: 6 },
  moveLabel: { fontSize: 12, fontWeight: '600', color: c.textMuted },
  moveChips: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  moveChip: { flexGrow: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: c.borderLight, backgroundColor: c.background },
  moveChipActive: { borderColor: c.primary, backgroundColor: c.primaryTint },
  moveChipText: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  moveChipTextActive: { color: c.primary, fontWeight: '700' },
  cardAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, pointerEvents: 'auto' },
  cardActionText: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  assignDayRow: { marginTop: 8, gap: 6 },
  assignDayLabel: { fontSize: 12, color: c.textFaint },
  assignDayBtns: { flexDirection: 'row', gap: 6 },
  assignDayBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: c.surfaceSubtle },
  assignDayBtnActive: { backgroundColor: c.primaryBtn },
  assignDayBtnText: { fontSize: 12, color: c.textSecondary, fontWeight: '500' },
  assignDayBtnTextActive: { color: '#fff', fontWeight: '600' },
  // Bakgrund, rundning och padding kommer från DraggableBottomSheet.
  sheet: { maxHeight: '80%' },
  bulkRecipeList: { maxHeight: 400, marginBottom: 12 },
  bulkRecipeItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.background, borderWidth: 1, borderColor: c.borderLight, marginBottom: 6 },
  bulkRecipeItemActive: { backgroundColor: c.primaryTint, borderColor: c.primary },
  bulkRecipeTitle: { fontSize: 15, fontWeight: '600', color: ny.text },
  bulkWeekHeader: { fontSize: 12, fontWeight: '700', color: ny.chipText, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  bulkRecipeDay: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  dayGrid: { gap: 10 },
  dayGridItem: { paddingVertical: 14, paddingHorizontal: 16, backgroundColor: ny.platsLjus, borderRadius: 16 },
  dayGridLabel: { fontFamily: nyFont.fet, fontWeight: 'normal', fontSize: 16, letterSpacing: -0.3, color: ny.padYta },
  pickerList: { maxHeight: 480 },
  recipeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: ny.kort, borderRadius: 16, padding: 14 },
  recipeCardIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: ny.bricka, alignItems: 'center', justifyContent: 'center' },
  recipeCardTitle: { fontFamily: nyFont.halvfet, fontSize: 15, color: ny.text },
  recipeCardMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  pickerItem: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: ny.kontur, flexDirection: 'row', alignItems: 'center' },
  pickerItemActive: { backgroundColor: ny.bricka, borderRadius: 10, borderBottomColor: 'transparent' },
  pickerItemDisabled: { opacity: 0.5 },
  pickerItemTitle: { fontSize: 16, fontWeight: '600', color: ny.text },
  pickerItemMeta: { fontSize: 13, color: ny.textDampad, marginTop: 2 },
  pickerEmpty: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  pickerEmptyText: { fontSize: 14, color: ny.textDampad, textAlign: 'center' },
  pickerEmptyBtn: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: ny.lime, borderRadius: 14 },
  pickerEmptyBtnText: { fontSize: 14, color: ny.skog, fontWeight: '600' },
  createListRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 8 },
  createListBtn: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: ny.lime, borderRadius: 14 },
  createListBtnText: { fontSize: 14, color: ny.skog, fontWeight: '600' },
  cleanupList: { gap: 8 },
  cleanupItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: c.background, borderWidth: 1, borderColor: c.borderLight },
  cleanupItemActive: { backgroundColor: c.primaryTint, borderColor: c.primary },
  cleanupListName: { fontSize: 15, fontWeight: '600', color: c.text },
  cleanupItemCount: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  cleanupActions: { flexDirection: 'row', gap: 12 },
  cleanupCancel: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: c.borderLight },
  cleanupCancelText: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
  cleanupConfirm: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', backgroundColor: c.danger },
  cleanupConfirmDisabled: { opacity: 0.4 },
  cleanupConfirmText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  pickerDivider: { height: 1, backgroundColor: c.borderLight, marginVertical: 12 },
  newListLabel: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginTop: 8, marginBottom: 8 },
  newListRow: { flexDirection: 'row', gap: 10 },
  newListSection: { paddingVertical: 24, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: c.surfaceSubtle, marginTop: 24 },
  newListBtn: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: c.primaryTint, borderRadius: 12, borderWidth: 1, borderColor: c.primary200 },
  newListBtnDisabled: { backgroundColor: c.surfaceSubtle, borderColor: c.borderLight },
  newListBtnText: { fontSize: 16, fontWeight: '600', color: c.primary },
  newListBtnTextDisabled: { color: c.textFaint },
  input: { color: ny.text, borderWidth: 1, borderColor: ny.kontur, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: ny.bakgrund },
  button: { backgroundColor: ny.lime, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minWidth: 44 },
  cancelBtn: { paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, color: ny.textDampad, fontWeight: '500' },
  buttonText: { color: ny.skog, fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.4 },
  // Edit mode
  sectionHovered: { backgroundColor: c.primaryTint, borderRadius: 12, borderWidth: 1, borderColor: c.primary },
  cardDragging: { opacity: 0.4 },
  cardPending: { opacity: 0.4, backgroundColor: c.dangerTint },
  cardTitlePending: { textDecorationLine: 'line-through', color: c.textFaint },
  cardDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: c.surface, borderRadius: 11 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', paddingHorizontal: 32, paddingVertical: 14, backgroundColor: c.text, borderRadius: 24, zIndex: 20 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  ghostCard: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, elevation: 10, zIndex: 100 },
  ghostCardIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: c.primaryTint, alignItems: 'center', justifyContent: 'center' },
  ghostCardText: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1 },
});
