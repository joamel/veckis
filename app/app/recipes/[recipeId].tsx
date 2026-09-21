import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useTheme } from '../../src/context/ThemeContext';
import { useDesign } from '../../src/context/DesignContext';
import { nyFont, type NyPalett } from '../../src/lib/nyDesign';
import type { Palette } from '../../src/lib/theme';
import {
  ActivityIndicator,
  Animated,
  AppState,
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
  useWindowDimensions,
} from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import { hittaMinuter, formateraNedräkning, formateraTidsetikett } from '../../src/lib/cookTimer';
import { kvarvarandePåSteg } from '../../src/lib/cookIngredients';

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
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useApiClient, type RecipeWithIngredients, type ShoppingListWithItems, type WeekMenuItemWithRecipe } from '../../src/api/client';
import { normalizeQtyInput, skalaQty } from '../../src/lib/qty';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useDiscardDraft } from '../../src/hooks/useDiscardDraft';
import { ReceptBild, type Fokus } from '../../src/components/ReceptBild';
import { DraggableBottomSheet } from '../../src/components/DraggableBottomSheet';
import type { RecipeIngredient, WeekDay } from '@veckis/shared';
import { convertToMetric, isConvertibleUnit, formateraKöksmått } from '@veckis/shared';
import { useWebLeaveGuard } from '../../src/hooks/useWebLeaveGuard';
import { sparaUtkast, hamtaUtkast, slangUtkast } from '../../src/lib/recipeDrafts';

const UNITS = ['st', 'dl', 'ml', 'l', 'g', 'kg', 'msk', 'tsk', 'krm', 'paket', 'påse', 'burk', 'flaska'];

// "Laga nu"-ingredienslistans höjd — ~7 ingredienser synliga (lineHeight 28 + pad).
const COOK_INGRED_MAX_H = 210;

// Labels från centraliserade veckodagar (mån-först) — inga hårdkodade dagnamn.
const MENU_DAYS: { key: WeekDay; label: string }[] =
  (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as WeekDay[])
    .map((key, i) => ({ key, label: common.weekdays.long[i] }));

// Tomt utkast för "nytt recept". Receptet finns INTE på servern förrän man
// trycker Spara — draften ligger bara i state, så ett avbrutet försök lämnar
// inga skräprecept i hushållet.
function makeDraftRecipe(householdId: string): RecipeWithIngredients {
  const now = new Date().toISOString();
  return {
    id: '', householdId, title: '', description: null, instructions: null,
    sourceUrl: null, imageUrl: null, imagePublicId: null, imageFocusX: null, imageFocusY: null, servings: 4,
    timesUsed: 0, tags: [], createdBy: '', createdAt: now, updatedAt: now,
    ingredients: [],
  };
}

// Samma mönster som butikens kategori-drag (stores/[storeId].tsx): egen
// komponent så gesten byggs via useMemo, keyad på stabila props, i stället
// för att byggas om vid varje omrendering.
function IngredientDragHandle({ idx, onDragStart, onDragMove, onDragEnd }: {
  idx: number;
  onDragStart: (idx: number, absoluteY: number) => void;
  onDragMove: (absoluteY: number) => void;
  onDragEnd: () => void;
}) {
  const { colors: c, ny } = useTheme();
  const gesture = useMemo(() => Gesture.Pan()
    .hitSlop(6)
    // Ingredienslistan är TÄTARE packad än butikens kategorilista (fler
    // handtag på en skärmyta man ofta scrollar), så ett snabbt scroll-svep
    // som råkar starta exakt på handtaget kapades annars som ett drag i
    // stället för att fortsätta som scroll (touchAction="none" gör att
    // webbläsaren/OS:et aldrig hinner tolka det som scroll om Pan-gesten
    // triggar direkt). Kräver ett kort håll innan draget "arm:as" — en snabb
    // genomgående rörelse hinner då lämnas kvar åt scrollen, medan ett
    // medvetet tryck-och-håll på handtaget fortfarande ger ett drag.
    .activateAfterLongPress(150)
    .onStart(e => { runOnJS(onDragStart)(idx, e.absoluteY); })
    .onUpdate(e => { runOnJS(onDragMove)(e.absoluteY); })
    .onFinalize(() => { runOnJS(onDragEnd)(); }),
    [idx, onDragStart, onDragMove, onDragEnd]);
  return (
    <GestureDetector gesture={gesture} touchAction="none">
      <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="reorder-two" size={22} color={c.textFaint} />
      </View>
    </GestureDetector>
  );
}

export function RecipeDetail({ recipeId, transfer, edit: editParam, forMenuDay, forMenuWeek, from, cook, onClose }: { recipeId: string; transfer?: string; edit?: string; forMenuDay?: string; forMenuWeek?: string; from?: string; cook?: string; onClose?: () => void }) {
  const edit = editParam;
  // Sentinel-id från /recipes/new. Riktiga id:n är cuid, så ingen krock.
  const isNew = recipeId === 'new';
  const newDraftInitedRef = useRef(false);
  // Sätts precis innan vi navigerar bort efter ett LYCKAT sparande, så
  // beforeRemove-vakten inte hinner fråga "släng utkastet?" på vägen ut.
  const savingNavRef = useRef(false);
  // Mäts av ConfirmDialog så "+"-popupen hamnar rätt ovanför knappen.
  const fabRef = useRef<View>(null);
  const { colors: c, ny } = useTheme();
  const { nyDesign } = useDesign();
  const s = useMemo(() => makeStyles(c, nyDesign, ny), [c, nyDesign, ny]);
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

  // Sant när redigeringsläget fylldes från ett återställt utkast.
  const [visarUtkast, setVisarUtkast] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [titleFocused, setTitleFocused] = useState(false);
  const [editDesc, setEditDesc] = useState('');
  const [editInstr, setEditInstr] = useState('');
  const [editImage, setEditImage] = useState('');
  // Bildens utsnitt. Sparas direkt när man släpper draget, precis som en ny
  // bild sparas direkt — bilden hör inte till formulärets spara-knapp.
  const [editFokus, setEditFokus] = useState<Fokus>({ x: null, y: null });
  const [editTags, setEditTags] = useState<string[]>([]);
  // Alla taggar som redan används i hushållets recept — visas som återanvändbara
  // förslags-chips i edit-läget så man slipper skriva om en custom-tagg.
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [editServings, setEditServings] = useState(4);
  const [customTag, setCustomTag] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Cooking mode
  const [cookMode, setCookMode] = useState(false);
  // Landskap = telefonen står på sidan vid spisen. Då ryms ingredienser och
  // steg bredvid varandra, vilket är hela poängen: man slipper skrolla mellan
  // dem mitt i tillagningen. app.json har redan orientation: "default", så
  // rotationen finns — det som saknades var layouten.
  const { width: cookW, height: cookH } = useWindowDimensions();
  const cookLandskap = cookW > cookH;
  // cook=1 öppnar laga-läget direkt. Veckomenyns kort går hit i stället för att
  // först visa receptet — avsikten därifrån är oftast att laga. Laga-läget
  // ligger ovanpå receptsidan, så ett bakåt lämnar användaren på receptet.
  const cookRequested = cook === '1';
  const [cookStep, setCookStep] = useState(0);
  // Avbockade ingredienser i laga-läget: ingrediens-id → steget den bockades
  // av på. Lever bara i sessionen — den som lagar vill veta vad som redan
  // hällts i NU, inte nästa gång rätten lagas. Nollställs när läget stängs.
  //
  // Steget sparas, inte bara att den är avbockad, för att listan ska kunna
  // krympa allt eftersom: en ingrediens visas så länge den är obockad ELLER
  // bockades av på det steg man står på. Då ser man sin egen bock som
  // bekräftelse, och nästa steg visar bara det som återstår.
  const [cookChecked, setCookChecked] = useState<Map<string, number>>(new Map());
  // Nedräkning för steget man står på. slutTid är en absolut tidpunkt, inte en
  // räknare som tickar ned: en räknare som minskar med 1 per sekund driver isär
  // när appen bakgrundas eller JS-tråden hackar. Notisen är den som faktiskt
  // väcker användaren — nedräkningen i rutan är bara en avläsning.
  const [timerSlut, setTimerSlut] = useState<number | null>(null);
  const [timerKvar, setTimerKvar] = useState(0);
  const timerNotisId = useRef<string | null>(null);
  const [heroLoading, setHeroLoading] = useState(false);
  const [heroError, setHeroError] = useState(false);

  // Ingredient editing
  const [editMode, setEditMode] = useState(false);
  // originalName följer med genom redigeringen utan att kunna ändras: rättar man
  // ett översatt namn för hand är källans rad fortfarande sann, och ↔-knappen
  // ska inte tappa den bara för att raden rörts.
  const [editIngredients, setEditIngredients] = useState<Array<{ name: string; quantity: string; unit: string; originalName: string | null }>>([]);
  const [saving, setSaving] = useState(false);
  const [activeUnitIdx, setActiveUnitIdx] = useState<number | null>(null);
  const [activeNameIdx, setActiveNameIdx] = useState<number | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<{ name: string; category: string }[]>([]);
  const [unitByName, setUnitByName] = useState<Record<string, string>>({});
  const [defaultUnit, setDefaultUnit] = useState('');
  // Visningsval, inte sparat: EN knapp för hela receptet (inte en per rad —
  // kändes stökigt) som växlar hela receptet mellan svenska och källans
  // original — både enhet ("cup" ↔ "dl") och namn ("cilantro" ↔ "koriander").
  //
  // Svenska är default, tvärtom mot tidigare. Förut visades källans enheter
  // först och knappen räknade om till svenska; nu översätts importen redan
  // vid hämtningen, och då vore det bakvänt att visa "1 cup" bredvid ett
  // svenskt namn. Källans råa mängd och namn rörs ALDRIG i databasen — bara
  // vad som RENDERAS växlar. Svenska recept påverkas inte: convertToMetric
  // returnerar null för dl/msk/g, och originalName är null.
  const [visaOriginal, setVisaOriginal] = useState(false);
  type RowRef = { qty: TextInput | null; unit: TextInput | null; name: TextInput | null };
  const rowRefs = useRef<RowRef[]>([]);
  // Dra-för-att-ordna ingredienser i redigeringsläget — samma teknik som
  // butikens kategori-drag (stores/[storeId].tsx): mäter varje rads
  // skärm-absoluta position, jämför mot fingrets Y under draget, och räknar
  // ut släpp-positionen EN gång från senast kända Y i stället för att lita på
  // en löpande "hover"-ref (bevisat instabilt i det tidigare fallet).
  type IngDragState = { startIndex: number; y: number };
  const [ingDragState, setIngDragState] = useState<IngDragState | null>(null);
  const [ingHoverIndex, setIngHoverIndex] = useState<number | null>(null);
  const ingRowRefs = useRef<Record<number, View | null>>({});
  const ingRowLayouts = useRef<Record<number, { y: number; height: number }>>({});
  const measureIngRow = useCallback((idx: number, ref: View | null) => {
    if (ref) ingRowRefs.current[idx] = ref;
    const target = ingRowRefs.current[idx];
    target?.measure((_x, _y, _w, h, _px, py) => { ingRowLayouts.current[idx] = { y: py, height: h }; });
  }, []);
  const ingIndexAtY = useCallback((absoluteY: number): number | null => {
    for (const [idxStr, layout] of Object.entries(ingRowLayouts.current)) {
      if (absoluteY >= layout.y && absoluteY <= layout.y + layout.height) return Number(idxStr);
    }
    return null;
  }, []);
  const onIngDragStart = useCallback((idx: number, absoluteY: number) => {
    setIngDragState({ startIndex: idx, y: absoluteY });
    setIngHoverIndex(idx);
  }, []);
  const onIngDragMove = useCallback((absoluteY: number) => {
    setIngDragState(prev => prev ? { ...prev, y: absoluteY } : null);
    setIngHoverIndex(ingIndexAtY(absoluteY));
  }, [ingIndexAtY]);
  const onIngDragEnd = useCallback(() => {
    setIngDragState(prev => {
      if (prev) {
        const target = ingIndexAtY(prev.y);
        if (target !== null && target !== prev.startIndex) moveEditRow(prev.startIndex, target);
      }
      return null;
    });
    setIngHoverIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingIndexAtY]);
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
      setCookChecked(new Map());
      setTimerSlut(null);
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
  // Samma värde som state också: refen räcker för uträkningarna ovan, men
  // bottenutrymmet nedan måste orsaka en omrendering för att ge effekt.
  const [tangentbordH, setTangentbordH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => { keyboardH.current = e.endCoordinates.height; setTangentbordH(e.endCoordinates.height); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardH.current = 0; setTangentbordH(0); });
    // keyboardDidHide avfyras inte tillförlitligt när appen bakgrundas med
    // tangentbordet uppe → lyftet låg kvar och modalen stod lyft vid återkomst.
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      keyboardH.current = 0;
      setTangentbordH(0);
    });
    return () => { show.remove(); hide.remove(); app.remove(); };
  }, []);

  // When the unit field is focused, the unit-chip row appears below it. Only
  // scroll if that row would be hidden under the keyboard — and just enough to
  // reveal it, so it doesn't accumulate / push the input off the top.
  useEffect(() => {
    if (activeUnitIdx === null) return;
    const input = rowRefs.current[activeUnitIdx]?.unit;
    if (!input) return;
    // Sista raden: "Lägg till rad"-knappen kommer direkt efter chip-raden med
    // inget emellan, och den ska också gå att nå utan att skrolla manuellt.
    const isLastRow = activeUnitIdx === editIngredients.length - 1;
    const t = setTimeout(() => {
      input.measureInWindow((_x, y, _w, h) => {
        const screenH = Dimensions.get('window').height;
        const kbTop = screenH - (keyboardH.current || 340);
        const chipRowH = 64; // unit-chip suggestion row + gap below the field
        const addRowBtnH = isLastRow ? 44 : 0;
        const margin = 24;   // breathing room above the keyboard
        const hidden = (y + h + chipRowH + addRowBtnH + margin) - kbTop;
        if (hidden > 0) {
          mainScrollRef.current?.scrollTo({ y: scrollOffsetY.current + hidden, animated: true });
        }
      });
    }, 200);
    return () => clearTimeout(t);
  }, [activeUnitIdx, editIngredients.length]);

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
        // Sista raden har "Lägg till rad"-knappen direkt under sig, precis som
        // i enhets-effekten ovan. Saknades här, så en nyss tillagd rad — som
        // alltid är sist — lyftes för lite även när det fanns utrymme.
        const addRowBtnH = activeNameIdx === editIngredients.length - 1 ? 44 : 0;
        const margin = 24;
        const hidden = (y + h + chipRowH + addRowBtnH + margin) - kbTop;
        if (hidden > 0) {
          mainScrollRef.current?.scrollTo({ y: scrollOffsetY.current + hidden, animated: true });
        }
      });
    }, 200);
    return () => clearTimeout(t);
  }, [activeNameIdx, editIngredients.length]);

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

  // Load ingredient suggestions once for autocomplete in edit mode. Hushållets
  // egna varor (getStaples, ingen tröskel) slås ihop med den globala poolen —
  // en vara du precis skrev in själv ska föreslås direkt, inte vänta på att bli
  // vanlig nog globalt (den globala poolen har dessutom sin egen, separata
  // tröskel — se MIN_HOUSEHOLDS_FOR_GLOBAL_SUGGESTION i staples.ts).
  useEffect(() => {
    if (!householdId) return;
    Promise.all([
      client.getIngredientSuggestions(householdId).catch(() => [] as { name: string; category: string }[]),
      client.getStaples(householdId).catch(() => []),
    ]).then(([global, staples]) => {
      const own = staples.map(st => ({ name: st.name, category: st.category }));
      const ownNames = new Set(own.map(o => o.name.toLowerCase()));
      const merged = [...own, ...global.filter(g => !ownNames.has(g.name.toLowerCase()))];
      setNameSuggestions(merged);

      // Staples ger dessutom varje ingrediens vanliga enhet + hushållets
      // mest använda enhet, för att förifylla/hinta enhetsfältet.
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
    });
  }, [householdId]);

  const load = useCallback(async () => {
    // Nytt recept: inget att hämta. Sätt upp utkastet EN gång (ref-vakt, inte
    // recipe-state — load körs om vid varje fokus och skulle annars nollställa
    // det man skrivit) och gå direkt in i redigeringsläget.
    if (isNew) {
      if (!newDraftInitedRef.current) {
        newDraftInitedRef.current = true;
        setRecipe(makeDraftRecipe(householdId ?? ''));
        setEditTitle('');
        setEditDesc('');
        setEditInstr('');
        setEditImage('');
        setEditFokus({ x: null, y: null });
        setEditTags([]);
        setEditServings(4);
        setEditIngredients([{ name: '', quantity: '', unit: '', originalName: null }]);
        setEditMode(true);
        if (householdId) {
          client.getRecipes(householdId).then(rs => {
            const tags = new Set<string>();
            for (const r of rs) for (const t of r.tags ?? []) tags.add(t);
            setKnownTags([...tags]);
          }).catch(() => {});
        }
      }
      setLoading(false);
      return;
    }
    if (!recipeId) return;
    try {
      const r = await client.getRecipe(recipeId);
      setRecipe(r);
      setScaledServings(null);
      if (transfer === '1') openTransfer(r);
      // Öppnas först när receptet finns: laga-läget renderar stegen, och utan
      // data hade det visat ett tomt skal en kort stund.
      if (cookRequested && (r.instructions ?? '').trim()) {
        setCookStep(0);
        setCookMode(true);
        if (!onClose) router.setParams({ cook: undefined });
      }
      if (edit === '1' && r.ingredients.length === 0) {
        setEditTitle(r.title);
        setEditDesc(r.description ?? '');
        setEditInstr(r.instructions ?? '');
        setEditImage(r.imageUrl ?? '');
        setEditFokus({ x: r.imageFocusX, y: r.imageFocusY });
        setEditIngredients([{ name: '', quantity: '', unit: '', originalName: null }]);
        setEditMode(true);
        if (!onClose) router.setParams({ edit: undefined });
        setTimeout(() => getRowRef(0).name?.focus(), 250);
      }
    } catch {
      confirm({ title: str.errors.generic, message: str.errors.couldNotLoad, buttons: [{ label: common.actions.ok }] });
    } finally {
      setLoading(false);
    }
  }, [recipeId, transfer, edit, isNew, householdId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const displayServings = scaledServings ?? recipe?.servings ?? 1;
  const scaleRatio = recipe ? displayServings / recipe.servings : 1;
  // Lässtegen i receptvyn; samma uppdelning som Laga nu-läget.
  const readSteps = recipe?.instructions ? parseSteps(recipe.instructions) : [];

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
      menuAnchorRef: fabRef,
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

  // Telefoner är låsta till stående i _layout.tsx; bara surfplattor får rotera.
  // Låset är rent JS (AndroidManifest står på "unspecified"), så laga-läget kan
  // släppa det medan det är öppet och ta tillbaka det när det stängs.
  //
  // Telefon-bedömningen görs på den KORTA sidan, inte på bredden som
  // useTablet gör: en telefon i liggande läge är bredare än 600 och skulle
  // annars se ut som en surfplatta i just det ögonblick vi behöver veta bäst.
  // Den ligger i en ref så att en rotation inte river effekten och låser om
  // mitt i tillagningen.
  const ärTelefonRef = useRef(true);
  ärTelefonRef.current = Math.min(cookW, cookH) < 600;
  useEffect(() => {
    if (!cookMode) return;
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      if (ärTelefonRef.current) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    };
  }, [cookMode]);

  // Skärmen får inte slockna mitt i ett steg när man står med kladdiga händer.
  // expo-keep-awake är en beroende av expo självt och alltså redan länkad in i
  // den publicerade binären — det här går att skicka som OTA.
  useEffect(() => {
    if (!cookMode) return;
    let aktiv = true;
    activateKeepAwakeAsync('laga').catch(() => {});
    return () => {
      if (!aktiv) return;
      aktiv = false;
      try { deactivateKeepAwake('laga'); } catch { /* redan släppt */ }
    };
  }, [cookMode]);

  // Nedräkningens avläsning. Räknar mot en absolut sluttid, så en bakgrundad
  // app eller en hackig frame inte får timern att glida.
  useEffect(() => {
    if (timerSlut === null) { setTimerKvar(0); return; }
    const uppdatera = () => setTimerKvar(Math.max(0, (timerSlut - Date.now()) / 1000));
    uppdatera();
    const id = setInterval(uppdatera, 500);
    return () => clearInterval(id);
  }, [timerSlut]);

  /** Startar nedräkning på steget och schemalägger notisen som faktiskt larmar.
   *  Utan notis vore timern bara en siffra man måste stå och titta på. */
  const startaTimer = useCallback(async (minuter: number) => {
    setTimerSlut(Date.now() + minuter * 60_000);
    try {
      const { status } = await Notifications.getPermissionsAsync();
      // Be aldrig om notis-tillstånd här: den som just tryckt på en timer står
      // vid spisen och ska inte mötas av en systemdialog. Saknas tillståndet
      // får man nedräkningen på skärmen, vilket fortfarande är användbart.
      if (status !== 'granted') return;
      timerNotisId.current = await Notifications.scheduleNotificationAsync({
        content: {
          title: str.detail.cookTimerNotisTitel,
          body: str.detail.cookTimerNotisText(recipe?.title ?? ''),
          sound: true,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: minuter * 60 },
      });
    } catch { /* notisen är en bonus, nedräkningen fungerar ändå */ }
  }, [recipe?.title]);

  const stoppaTimer = useCallback(() => {
    setTimerSlut(null);
    const id = timerNotisId.current;
    timerNotisId.current = null;
    if (id) Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }, []);

  // Byte av steg (eller stängt laga-läge) avbryter en pågående nedräkning:
  // timern hör till steget man står på, och en notis för ett steg man lämnat
  // är bara förvirrande.
  useEffect(() => { stoppaTimer(); }, [cookStep, cookMode, stoppaTimer]);

  // Edit everything (name, image, description, ingredients, instructions) inline
  // in the detail view.
  function startEdit() {
    if (!recipe) return;
    rowRefs.current = [];
    setActiveUnitIdx(null);

    // Fanns osparade ändringar sedan förra gången skärmen lämnades? Återställ
    // dem i stället för receptets sparade värden. Ingen fråga här — utkastet ÄR
    // det användaren senast skrev, och en dialog vid varje ingång vore i vägen.
    // Banderollen i redigeringsläget säger att det hände och erbjuder att slänga.
    const draft = hamtaUtkast(recipe.id);
    if (draft) {
      setEditTitle(draft.title);
      setEditDesc(draft.description);
      setEditInstr(draft.instructions);
      setEditImage(draft.imageUrl);
      setEditFokus({ x: recipe?.imageFocusX ?? null, y: recipe?.imageFocusY ?? null });
      setEditTags(draft.tags);
      setEditServings(draft.servings ?? recipe.servings);
      setEditIngredients(draft.ingredients.map(i => ({ ...i, originalName: i.originalName ?? null })));
      setCustomTag('');
      setScaledServings(null);
      setVisarUtkast(true);
      setEditMode(true);
      return;
    }

    setVisarUtkast(false);
    setEditTitle(recipe.title);
    setEditDesc(recipe.description ?? '');
    setEditInstr(recipe.instructions ?? '');
    setEditImage(recipe.imageUrl ?? '');
    setEditFokus({ x: recipe.imageFocusX, y: recipe.imageFocusY });
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
      originalName: i.originalName ?? null,
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
      originalName: i.originalName ?? null,
    }));
    return JSON.stringify(editIngredients) !== JSON.stringify(origIngs);
  }


  // Osparade ändringar sparas som utkast i stället för att vägen ut blockeras.
  //
  // Blockeringen fanns här i tre versioner — beforeRemove, egen historikpost med
  // popstate, och usePreventRemove — och ingen var pålitlig i PWA:n. expo-router
  // äger historiken, så en avbruten navigering hann rendera nästa skärm innan
  // den ångrades, och ibland gick den igenom ändå. Tre försök, tre beteenden.
  //
  // Nu hindras ingenting. Lämnar man skärmen mitt i en redigering ligger
  // ändringarna kvar när man kommer tillbaka, oavsett HUR man lämnade. Det
  // fungerar likadant på native och web eftersom det inte rör navigeringen alls.
  const dirty = editMode && isEditDirty();
  useEffect(() => {
    if (!recipe || !dirty || savingNavRef.current) return;
    sparaUtkast(recipe.id, {
      title: editTitle,
      description: editDesc,
      instructions: editInstr,
      imageUrl: editImage,
      servings: editServings,
      tags: editTags,
      ingredients: editIngredients,
    });
  }, [dirty, recipe, editTitle, editDesc, editInstr, editImage, editServings, editTags, editIngredients]);

  // Kvar men bantad: varnar bara vid omladdning och stängd flik, där utkastet
  // (som bara lever i minnet) faktiskt skulle gå förlorat.
  useWebLeaveGuard(dirty);

  function addEditRow() {
    setEditIngredients(prev => [...prev, { name: '', quantity: '', unit: '', originalName: null }]);
  }

  function updateEditRow(idx: number, field: 'name' | 'quantity' | 'unit', val: string) {
    setEditIngredients(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }

  function removeEditRow(idx: number) {
    setEditIngredients(prev => prev.filter((_, i) => i !== idx));
  }

  function moveEditRow(from: number, to: number) {
    setEditIngredients(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
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
          originalName: r.originalName ?? null,
        }));
      // Nytt recept skapas FÖRST här — fram till nu har det bara funnits i state.
      if (isNew) {
        if (!householdId) return;
        const created = await client.createRecipe({
          householdId,
          title: t,
          description: editDesc.trim() || null,
          instructions: editInstr.trim() || null,
          imageUrl: img || null,
          servings: editServings,
          ingredients,
          tags: editTags,
          source: 'manual',
        });
        setEditMode(false);
        slangUtkast(recipe.id);
        savingNavRef.current = true;
        // replace, inte push: bakåt ska leda till receptlistan, inte tillbaka
        // in i ett tomt utkast.
        router.replace(`/recipes/${created.id}` as never);
        return;
      }
      const updated = await client.updateRecipe(recipe.id, {
        title: t,
        description: editDesc.trim() || null,
        instructions: editInstr.trim() || null,
        imageUrl: img || null,
        servings: editServings,
        ingredients,
        tags: editTags,
      });
      // Sparat = utkastet har tjänat ut.
      slangUtkast(recipe.id);
      setRecipe(updated);
      setScaledServings(null); // visa nya bas-portionerna, inte gammal skalning
      setEditMode(false);
      if (forMenuDay !== undefined) {
        const weekSuffix = forMenuWeek ? `&forMenuWeek=${forMenuWeek}` : '';
        const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        router.replace(`/(tabs)/menu?addRecipeId=${recipe.id}&day=${forMenuDay}&reqId=${reqId}${weekSuffix}` as never);
      }
    } catch {
      confirm({ title: str.errors.generic, message: str.errors.couldNotSave, buttons: [{ label: common.actions.ok }] });
    } finally {
      setSaving(false);
    }
  }

  // Pick a photo (camera or library), resize+compress locally to keep upload
  // small, then send to backend → Cloudinary → recipe.imageUrl is updated.
  // Nytt utsnitt valt genom att dra i bilden.
  //
  // Skrivs optimistiskt: draget ska kännas direkt, och värdet är redan synligt
  // på skärmen. Misslyckas sparningen läggs det tillbaka till vad receptet
  // hade, så det man ser stämmer med det som faktiskt är sparat.
  async function sparaBildfokus(fokus: Fokus) {
    if (!recipe || isNew) return;
    const förra = { x: recipe.imageFocusX, y: recipe.imageFocusY };
    setEditFokus(fokus);
    try {
      const uppdaterad = await client.updateRecipe(recipe.id, { imageFocusX: fokus.x, imageFocusY: fokus.y });
      setRecipe(uppdaterad);
    } catch (e) {
      setEditFokus(förra);
      showError(e, str.errors.couldNotSave);
    }
  }

  async function pickAndUploadImage(source: 'library' | 'camera') {
    // Uppladdningen adresserar receptet via id, så den kräver ett sparat recept.
    if (!recipe || isNew) return;
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showError(new Error('permission_denied'), source === 'camera' ? str.permissions.camera : str.permissions.photos);
        return;
      }
      // Ingen beskärning här: hela bilden laddas upp, och vilket utsnitt som
      // visas justeras efteråt genom att dra i bilden (imageFocusX/Y). Då
      // bevaras originalet, justeringen går att ändra om, och samma sätt
      // fungerar för URL-importerade bilder som vi inte kan beskära.
      const val = { mediaTypes: 'images' as const, quality: 0.9 };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(val)
        : await ImagePicker.launchImageLibraryAsync(val);
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
      setEditFokus({ x: updated.imageFocusX, y: updated.imageFocusY });
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
        style={{ backgroundColor: c.primaryBtn, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{common.actions.back}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => {
          if (editMode) {
            tryCloseEdit(isEditDirty(), () => {
              if (recipe) slangUtkast(recipe.id);
              setVisarUtkast(false);
              setEditMode(false);
              // Ett nytt recept har inget sparat läge att falla tillbaka på —
              // att slänga utkastet betyder att lämna skärmen. savingNavRef
              // stänger av beforeRemove-vakten så man inte får frågan två gånger
              // (setEditMode hinner inte slå igenom före navigeringen).
              if (isNew) { savingNavRef.current = true; if (onClose) onClose(); else router.back(); }
            });
            return;
          }
          if (onClose) onClose(); else router.back();
        }} style={s.backBtn} accessibilityRole="button" accessibilityLabel={common.actions.back}>
          <Ionicons name="arrow-back" size={24} color={nyDesign ? ny.rubrikLjus : c.text} />
        </Pressable>
        {editMode ? (
          <View style={[s.headerTitleInput, { flex: 1, position: 'relative' }]}>
            <TextInput
              style={[
                s.headerTitle,
                s.headerTitleField,
                // Samma fix som ingrediens-namnen: döljer HELA fältet (inte bara
                // textfärgen) när det inte är fokuserat och har text att ersätta
                // med overlayn — annars visar RN kvar slutet av titeln i stället
                // för början efter man skrivit klart.
                !titleFocused && editTitle.length > 0 && { opacity: 0 },
              ]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder={str.detail.nameLabel}
              placeholderTextColor={nyDesign ? ny.underrubrik : c.textFaint}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => setTitleFocused(false)}
            />
            {!titleFocused && editTitle.length > 0 && (
              <Text pointerEvents="none" numberOfLines={1} style={s.headerTitleOverlay}>{editTitle}</Text>
            )}
          </View>
        ) : (
          <Text style={s.headerTitle} numberOfLines={1}>{recipe.title}</Text>
        )}
        {/* Actions-menyn (radera, överför, planera …) rör ett sparat recept —
            tom platshållare för nya så rubriken inte hoppar i sidled. */}
        {isNew ? <View style={s.transferBtn} /> : (
          <Pressable onPress={openRecipeActions} style={s.transferBtn} accessibilityLabel={common.actions.more}>
            <Ionicons name="ellipsis-vertical" size={20} color={nyDesign ? ny.rubrikLjus : c.text} />
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView behavior={kavBehavior} style={{ flex: 1 }}>
      <ScrollView
        ref={mainScrollRef}
        contentContainerStyle={[
          s.scroll,
          // Utan extra botten går den SISTA raden inte att lyfta: scrollTo
          // klampas mot innehållets slut, så det finns helt enkelt inget att
          // skrolla till. Rader mitt i listan har resten av formuläret under
          // sig och lyfts därför hela vägen — vilket är precis varför en nyss
          // tillagd rad (som alltid är sist) bara flyttade sig en aning.
          //
          // Bara medan ett fält är fokuserat, annars vore det en tom lucka
          // under formuläret.
          editMode && tangentbordH > 0 && (activeNameIdx !== null || activeUnitIdx !== null) && { paddingBottom: tangentbordH + 80 },
        ]}
        keyboardShouldPersistTaps="always"
        scrollEventThrottle={16}
        onScroll={e => { scrollOffsetY.current = e.nativeEvent.contentOffset.y; }}
      >
        {editMode ? (
          <View style={{ gap: 8 }}>
            {/* Syns bara när fälten fylldes från ett återställt utkast. Utan den
                skulle användaren inte förstå varför ändringar hen trodde var
                borta plötsligt är tillbaka. */}
            {visarUtkast && (
              <View style={s.draftBanner}>
                <Ionicons name="time-outline" size={16} color={c.primary} />
                <Text style={s.draftBannerText}>{common.discardDraft.restored}</Text>
                <Pressable
                  onPress={() => {
                    if (recipe) slangUtkast(recipe.id);
                    setVisarUtkast(false);
                    startEdit();
                  }}
                  hitSlop={8}
                >
                  <Text style={s.draftBannerAction}>{common.discardDraft.discardShort}</Text>
                </Pressable>
              </View>
            )}
            <Text style={s.editLabel}>{str.detail.imageLabel}</Text>
            {editImage.trim() ? (
              <>
                <ReceptBild
                  uri={editImage.trim()}
                  fokusX={editFokus.x}
                  fokusY={editFokus.y}
                  justerbar={!isNew}
                  onJusterad={sparaBildfokus}
                  style={s.heroImage}
                />
                {!isNew ? <Text style={s.imgAfterSaveHint}>{str.detail.imageDragHint}</Text> : null}
              </>
            ) : (
              <View style={[s.heroImage, s.heroPlaceholder]}>
                <Ionicons name="image-outline" size={32} color={c.textFaint} />
              </View>
            )}
            {isNew ? (
              <Text style={s.imgAfterSaveHint}>{str.detail.imageAfterSave}</Text>
            ) : (
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
            )}
            {uploadingImage ? <ActivityIndicator color={c.primary} /> : null}
          </View>
        ) : recipe.imageUrl ? (
          <View style={s.heroImage}>
            <ReceptBild
              uri={heroSource?.uri ?? ''}
              fokusX={recipe.imageFocusX}
              fokusY={recipe.imageFocusY}
              style={StyleSheet.absoluteFill}
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
            <Text style={s.sectionTitle}>
              {str.detail.ingredientsLabel}
              {!editMode && recipe.ingredients.length > 0 ? (
                <Text style={s.sectionCount}>{str.detail.sectionCount(recipe.ingredients.length)}</Text>
              ) : null}
            </Text>
            {!editMode && recipe.ingredients.some(i => isConvertibleUnit(i.unit) || i.originalName) && (
              <Pressable
                style={s.ingConvertBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={visaOriginal ? str.detail.showSwedishA11y : str.detail.showSourceA11y}
                onPress={() => setVisaOriginal(v => !v)}
              >
                <Ionicons name="swap-horizontal" size={18} color={visaOriginal ? ny.padYta : ny.underrubrik} />
              </Pressable>
            )}
          </View>

          {editMode ? (
            <View style={s.editList} {...({ importantForAutofill: 'noExcludeDescendants' } as object)}>
              {editIngredients.map((row, idx) => (
                <View
                  key={idx}
                  ref={ref => measureIngRow(idx, ref)}
                  onLayout={() => measureIngRow(idx, null)}
                  style={[
                    ingDragState?.startIndex === idx && s.ingEditRowDragging,
                    ingHoverIndex === idx && ingDragState?.startIndex !== idx && s.ingEditRowDropTarget,
                  ]}
                >
                  <View style={s.editRow}>
                    <View style={[s.editInput, s.editInputName, { position: 'relative' }]}>
                      <TextInput
                        ref={el => { getRowRef(idx).name = el; }}
                        style={[
                          s.editInputNameField,
                          // Döljer TextInputen HELT (inte bara textfärgen — på vissa
                          // enheter/plattformar rensar `color: transparent` inte
                          // textrenderingen fullt ut, vilket gav dubbelexponerad,
                          // suddig text ovanpå overlayn) när fältet inte är
                          // fokuserat OCH har ett värde att visa via overlayn i
                          // stället. RN scrollar annars TextInputen kvar till
                          // markörens position (slutet, efter man skrivit klart)
                          // och visar "…kockshjärtan" i stället för "kronärtskock…".
                          // Tom (placeholder syns) lämnas orörd — annars försvinner
                          // placeholdern med.
                          activeNameIdx !== idx && row.name.length > 0 && { opacity: 0 },
                        ]}
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
                      {activeNameIdx !== idx && row.name.length > 0 && (
                        <Text pointerEvents="none" numberOfLines={1} style={s.editInputNameOverlay}>{row.name}</Text>
                      )}
                    </View>
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
                      // Alltid "nästa": på sista raden skapar submit en ny rad i
                      // stället för att bara stänga tangentbordet, så man slipper
                      // trycka "Lägg till rad" manuellt mellan varje ingrediens.
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onFocus={() => setActiveUnitIdx(idx)}
                      // Inget onPressIn här: den utlöses så fort fingret rör fältet,
                      // alltså även mitt i en scrollrörelse — då fälldes enhetsraden ut
                      // och layouten hoppade så man tappade scrollen. onFocus räcker;
                      // fokus sätts ändå när fingret släpps.
                      onBlur={() => setTimeout(() => setActiveUnitIdx(a => a === idx ? null : a), 120)}
                      onSubmitEditing={() => {
                        setActiveUnitIdx(null);
                        if (idx < editIngredients.length - 1) {
                          getRowRef(idx + 1).name?.focus();
                        } else {
                          const newIdx = editIngredients.length;
                          addEditRow();
                          setTimeout(() => getRowRef(newIdx).name?.focus(), 50);
                        }
                      }}
                    />
                    <Pressable onPress={() => removeEditRow(idx)} style={s.editRemove} accessibilityRole="button" accessibilityLabel={common.actions.delete}>
                      <Ionicons name="close-circle" size={20} color={c.border} />
                    </Pressable>
                    {editIngredients.length > 1 && (
                      <IngredientDragHandle
                        idx={idx}
                        onDragStart={onIngDragStart}
                        onDragMove={onIngDragMove}
                        onDragEnd={onIngDragEnd}
                      />
                    )}
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
                                  // Flytta fokus till nästa rads namnfält — på sista raden
                                  // skapas en ny rad i stället för att bara stanna kvar.
                                  if (idx < editIngredients.length - 1) {
                                    setTimeout(() => getRowRef(idx + 1).name?.focus(), 50);
                                  } else {
                                    const newIdx = editIngredients.length;
                                    addEditRow();
                                    setTimeout(() => getRowRef(newIdx).name?.focus(), 50);
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
            <>
              {/* Som en inköpslapp: mängden i en fast kolumn till vänster, så
                  man kan läsa "300 g" mot "nötfärs" uppifrån och ned. */}
              <View style={s.ingCard}>
                {recipe.ingredients.map((ing, i) => (
                  <View key={ing.id} style={[s.ingRow, i > 0 && s.ingRowBorder]}>
                    <Text style={s.ingQty}>{formatQty(ing, scaleRatio, visaOriginal)}</Text>
                    <Text style={s.ingName}>{visaOriginal && ing.originalName ? ing.originalName : ing.name}</Text>
                  </View>
                ))}
              </View>
              {/* Sidans huvudhandling, därför full bredd och lime. */}
              <Pressable style={s.wideBtnLime} onPress={() => openTransfer()} accessibilityLabel={str.detail.transferA11y}>
                <Ionicons name="cart-outline" size={20} color={ny.skog} />
                <Text style={s.wideBtnLimeText}>{str.detail.addToList}</Text>
              </Pressable>
            </>
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
              <Text style={s.sectionTitle}>
                {str.detail.instructionsLabel}
                {readSteps.length > 1 ? <Text style={s.sectionCount}>{str.detail.sectionCount(readSteps.length)}</Text> : null}
              </Text>
            </View>
            {/* Samma uppdelning som Laga nu-läget. Ett enda textblock utan
                radbrytningar visas som det är — en ensam 1:a vore missvisande. */}
            {readSteps.length > 1 ? (
              <View style={s.stepList}>
                {readSteps.map((step, i) => (
                  <View key={i} style={s.stepRow}>
                    <View style={s.stepNum}>
                      <Text style={s.stepNumText}>{i + 1}</Text>
                    </View>
                    <Text style={s.stepText}>{step}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={s.instructionsText}>{recipe.instructions}</Text>
            )}
            <Pressable style={s.wideBtnSkog} onPress={() => { setCookStep(0); setCookMode(true); }} accessibilityLabel={str.detail.cookA11y}>
              <Ionicons name="restaurant-outline" size={20} color={ny.lime} />
              <Text style={s.wideBtnSkogText}>{str.detail.cookNow}</Text>
            </Pressable>
          </View>
        ) : null}

      </ScrollView>

      {/* Fast spara-rad längst ner i edit-läget — kräver ingen nedskroll för
          att hitta spara/avbryt, till skillnad från när knapparna låg sist
          i scroll-innehållet. */}
      {editMode && (
        <View style={s.editActionsBar}>
          <Pressable style={s.cancelBtn} onPress={() => tryCloseEdit(isEditDirty(), () => {
            setEditMode(false);
            if (isNew) { savingNavRef.current = true; if (onClose) onClose(); else router.back(); }
          })}>
            <Text style={s.cancelBtnText}>{common.actions.cancel}</Text>
          </Pressable>
          <Pressable style={[s.saveBtn, saving && s.saveBtnDisabled]} onPress={saveRecipe} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>{common.actions.save}</Text>}
          </Pressable>
        </View>
      )}
      </KeyboardAvoidingView>

      {/* Transfer modal */}
      <DraggableBottomSheet
        visible={showTransfer}
        onRequestClose={() => setShowTransfer(false)}
        sheetStyle={s.sheet}
        title={str.transfer.title}
        subtitle={`${scaleRatio !== 1 ? str.transfer.scaledPrefix(displayServings) : ''}${str.transfer.needToBuy}`}
      >

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
      </DraggableBottomSheet>

      {/* Plan in menu modal — identisk look med bibliotekets kalenderikon-dialog:
          veckochips + dag-grid som lägger till direkt (toast), ingen extra knapp. */}
      <DraggableBottomSheet visible={showPlanModal} onRequestClose={() => setShowPlanModal(false)} sheetStyle={s.sheet} title={str.menu.addToMenu} subtitle={recipe?.title}>

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
          </View>
      </DraggableBottomSheet>

      {/* "+"-FAB — väljare: lägg till receptet i veckomeny eller inköpslista.
          (Laga nu-läget nås från instruktions-sektionens "Laga nu"-knapp.) */}
      {!editMode && recipe && (
        <Pressable ref={fabRef} style={s.fab} onPress={openAddChooser} accessibilityLabel={str.actions.addTitle}>
          <Ionicons name="add" size={30} color={ny.skog} />
        </Pressable>
      )}

      {/* Cooking mode */}
      {recipe.instructions ? (() => {
        const steps = parseSteps(recipe.instructions!);
        const step = steps[cookStep] ?? '';
        const stegMinuter = hittaMinuter(step);
        // Listan krymper allt eftersom: det som bockades av på ett TIDIGARE
        // steg är redan i grytan och tar bara plats. Det som bockades av på
        // det här steget ligger kvar överstruket — dels som kvitto på att
        // trycket gick fram, dels så att en felaktig bock går att ångra innan
        // man går vidare. Backar man till steget där en ingrediens bockades av
        // dyker den upp igen, vilket också är vägen tillbaka om man bockat fel
        // och redan bläddrat.
        const kvarvarandeIngredienser = kvarvarandePåSteg(recipe.ingredients, cookChecked, cookStep);
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
              {/* Ingredienser och steg ligger i VAR SIN yta, inte i samma
                  flödande scroll. Förut ankrades hela kroppen nedåt för att
                  steget skulle sitta tumnära, men då trycktes ingredienserna
                  med och allt tomrum samlades överst. Nu sitter ingredienserna
                  kvar i överkant och bara steget ankras mot botten.
                  I landskap blir samma två ytor kolumner i stället. */}
              <View style={cookLandskap ? s.cookSplitRad : s.cookSplitKolumn}>
                {kvarvarandeIngredienser.length > 0 && (
                  <ScrollView
                    ref={cookIngredScrollRef}
                    style={cookLandskap ? s.cookIngredKolumn : s.cookIngredWrap}
                    contentContainerStyle={s.cookIngredInnehall}
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
                    {kvarvarandeIngredienser.map(ing => {
                      const avbockad = cookChecked.has(ing.id);
                      return (
                        <Pressable
                          key={ing.id}
                          onPress={() => setCookChecked(prev => {
                            const nästa = new Map(prev);
                            if (nästa.has(ing.id)) nästa.delete(ing.id); else nästa.set(ing.id, cookStep);
                            return nästa;
                          })}
                          style={s.cookIngredRad}
                          hitSlop={4}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: avbockad }}
                          accessibilityLabel={str.detail.cookIngredA11y(formatIngredient(ing, 1), avbockad)}
                        >
                          <Ionicons
                            name={avbockad ? 'checkmark-circle' : 'ellipse-outline'}
                            size={20}
                            color={avbockad ? c.primary : c.borderLight}
                          />
                          <Text style={[s.cookIngredItem, avbockad && s.cookIngredItemAvbockad]}>
                            {formatIngredient(ing, 1)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
                <ScrollView
                  style={cookLandskap ? s.cookStegKolumn : undefined}
                  contentContainerStyle={s.cookBody}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={s.cookStepLabel}>{str.detail.cookStep(cookStep + 1, steps.length)}</Text>
                  <Text style={s.cookStepText}>{step}</Text>
                  {stegMinuter !== null && (
                    <Pressable
                      style={[s.cookTimer, timerSlut !== null && s.cookTimerAktiv]}
                      onPress={() => (timerSlut === null ? startaTimer(stegMinuter) : stoppaTimer())}
                      accessibilityRole="button"
                      accessibilityLabel={timerSlut === null
                        ? str.detail.cookTimerStart(formateraTidsetikett(stegMinuter))
                        : str.detail.cookTimerStopp}
                    >
                      <Ionicons
                        name={timerSlut === null ? 'timer-outline' : 'stop-circle-outline'}
                        size={20}
                        color={timerSlut === null ? c.primary : '#fff'}
                      />
                      <Text style={[s.cookTimerText, timerSlut !== null && s.cookTimerTextAktiv]}>
                        {timerSlut === null
                          ? formateraTidsetikett(stegMinuter)
                          : timerKvar <= 0
                            ? str.detail.cookTimerKlar
                            : formateraNedräkning(timerKvar)}
                      </Text>
                    </Pressable>
                  )}
                </ScrollView>
              </View>
              <View style={[s.cookNav, cookLandskap && s.cookNavLandskap]}>
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
    quantity: ing.quantity != null ? skalaQty(ing.quantity, scaleRatio) : null,
  }));
}


/** Bara mängd + enhet ("300 g"), för receptvyns mängdkolumn. Tom sträng om
 *  ingrediensen saknar mängd ("salt"). visaOriginal=false (default) räknar om
 *  amerikanska enheter till svenska; true visar källans mängd orörd. */
function formatQty(ing: { quantity: number | null; unit: string | null }, scaleRatio = 1, visaOriginal = false): string {
  let quantity = ing.quantity != null ? skalaQty(ing.quantity, scaleRatio) : null;
  let unit = ing.unit;
  if (!visaOriginal && quantity != null && unit) {
    const converted = convertToMetric(quantity, unit);
    if (converted) { quantity = converted.quantity; unit = converted.unit; }
  }
  const parts: string[] = [];
  if (quantity != null) {
    // Bråk i stället för decimaler för mått man mäter upp: "4,7 dl" finns inte
    // i en måttsats, "4⅔ dl" gör det — och skillnaden är tre milliliter.
    // Vikt lämnas som decimaltal; det är vad vågen visar.
    parts.push(formateraKöksmått(quantity, unit));
  }
  if (unit) parts.push(unit);
  return parts.join(' ');
}

function formatIngredient(ing: { quantity: number | null; unit: string | null; name: string }, scaleRatio = 1): string {
  const parts: string[] = [];
  if (ing.quantity != null) {
    const scaled = skalaQty(ing.quantity, scaleRatio);
    parts.push(String(scaled % 1 === 0 ? scaled : scaled.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')));
  }
  if (ing.unit) parts.push(ing.unit);
  parts.push(ing.name);
  return parts.join(' ');
}

// nyD: den nya designen (beta) skriver over de stilar som skiljer.
const makeStyles = (c: Palette, nyD: boolean, ny: NyPalett) => StyleSheet.create({
  container: { flex: 1, backgroundColor: nyD ? ny.bakgrund : c.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // Morkgront band som ovriga vyers NyHeader. Hogre an 48 for att rubriken ska
  // fa samma luft som pa andra skarmar.
  header: nyD
    ? { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 8, backgroundColor: ny.skog, gap: 12 }
    : { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle, gap: 12 },
  backBtn: { padding: 8 },
  // Outfit bar vikten i typsnittet — fontWeight till ger reservtypsnitt.
  headerTitle: nyD
    ? { flex: 1, fontFamily: nyFont.fet, fontWeight: 'normal', fontSize: 18, letterSpacing: -0.3, color: ny.rubrikLjus }
    : { flex: 1, fontSize: 17, fontWeight: '700', color: c.text },
  // Redigeringsfaltet ligger PA det morka bandet: glasyta med ljus text, annars
  // blir det en vit lapp mitt i headern.
  headerTitleInput: nyD
    ? { color: ny.rubrikLjus, borderWidth: 0, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: ny.glas }
    : { color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: c.inputBg },
  headerTitleField: { padding: 0, borderWidth: 0, backgroundColor: 'transparent' },
  headerTitleOverlay: nyD
    ? { position: 'absolute', left: 12, right: 12, top: 8, bottom: 8, fontFamily: nyFont.fet, fontWeight: 'normal', fontSize: 18, letterSpacing: -0.3, color: ny.rubrikLjus }
    : { position: 'absolute', left: 10, right: 10, top: 6, bottom: 6, fontSize: 17, fontWeight: '700', color: c.text },
  transferBtn: { padding: 8 },
  scroll: { padding: 20, gap: 16 },
  heroImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: c.surfaceSubtle },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  heroImageOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(241,239,236,0.6)' },
  imgBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: c.primaryTint },
  imgBtnText: { color: c.primary, fontWeight: '600', fontSize: 14 },
  imgBtnDisabled: { opacity: 0.5 },
  imgAfterSaveHint: { fontSize: 13, color: c.textFaint, textAlign: 'center', paddingVertical: 8 },
  imgRemoveBtn: { width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.dangerTint },
  editImagePreview: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: c.surfaceSubtle, marginTop: 8 },
  metaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metaChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: nyD ? ny.kort : c.surfaceSubtle, flexShrink: 0 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: nyD ? ny.kort : c.primaryTint, flexShrink: 0 },
  tagChipActive: { backgroundColor: nyD ? ny.skog : c.primary },
  tagChipText: { fontSize: 12, fontWeight: '600', color: nyD ? ny.chipText : c.primary },
  tagChipTextActive: { color: nyD ? ny.lime : '#fff' },
  tagAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  tagAddBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: nyD ? ny.skog : c.primary, alignItems: 'center', justifyContent: 'center' },
  servingChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: nyD ? ny.kort : c.surfaceSubtle, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 20 },
  servingBtn: { padding: 2 },
  metaText: { fontSize: 13, color: nyD ? ny.textDampad : c.textMuted },
  description: { fontSize: 14, color: nyD ? ny.text : c.textSecondary, lineHeight: 22 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: nyD
    ? { fontFamily: nyFont.fet, fontWeight: 'normal', fontSize: 18, letterSpacing: -0.3, color: ny.padYta }
    : { fontSize: 17, fontWeight: '700', color: c.text },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editBtnText: { fontSize: 14, color: nyD ? ny.padYta : c.primary, fontWeight: '500' },
  sectionCount: { fontFamily: nyFont.halvfet, color: ny.textDampad },
  // Ingredienserna som en inköpslapp på ett ljusgrönt kort.
  ingCard: { backgroundColor: ny.kort, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4 },
  ingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11 },
  ingRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ny.kontur },
  // Fast bredd: kolumnen linjerar, och Android klipper inte sista glyfen.
  ingQty: { width: 76, fontFamily: nyFont.halvfet, fontSize: 15, color: ny.padYta },
  ingName: { flex: 1, fontSize: 15, lineHeight: 21, color: ny.text },
  ingConvertBtn: { padding: 4 },
  wideBtnLime: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 26, backgroundColor: ny.lime, marginTop: 4 },
  wideBtnLimeText: { fontFamily: nyFont.halvfet, fontSize: 16, color: ny.skog },
  wideBtnSkog: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 26, backgroundColor: ny.skog, marginTop: 4 },
  wideBtnSkogText: { fontFamily: nyFont.halvfet, fontSize: 16, color: ny.rubrikLjus },
  // Numrerade steg: mörkgrön rund siffra med lime text.
  stepList: { gap: 14 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: ny.skog, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { width: 24, textAlign: 'center', fontFamily: nyFont.halvfet, fontSize: 13, color: ny.lime },
  stepText: { flex: 1, fontSize: 15, lineHeight: 23, color: ny.text },
  noIngredients: { paddingVertical: 16, alignItems: 'center' },
  noIngredientsText: { fontSize: 14, color: c.textFaint },
  editList: { gap: 8 },
  editRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  editInput: { color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, backgroundColor: c.inputBg },
  editInputQty: { width: 54, textAlign: 'left' },
  editInputUnit: { width: 52, textAlign: 'left' },
  editInputName: { flex: 1 },
  // color MÅSTE stå här. s.editInput sitter på wrappern, som är en View, och
  // RN ärver inte textfärg genom en View — fältet föll därför tillbaka på
  // plattformens svarta standardfärg. I ljust läge såg det rätt ut av en
  // slump; i mörkt läge blev texten svart på mörk bakgrund så fort fältet
  // fokuserades (overlayn, som har rätt färg, döljs då).
  editInputNameField: { flex: 1, padding: 0, fontSize: 14, textAlign: 'left', color: c.text },
  editInputNameOverlay: { position: 'absolute', left: 10, right: 10, top: 8, bottom: 8, fontSize: 14, color: c.text },
  editRemove: { padding: 2 },
  ingEditRowDragging: { opacity: 0.4 },
  ingEditRowDropTarget: { borderTopWidth: 2, borderTopColor: nyD ? ny.skog : c.primary },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  addRowBtnText: { fontSize: 14, color: c.primary, fontWeight: '500' },
  unitChipScroll: { marginBottom: 4 },
  unitChipRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  unitChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: nyD ? ny.kort : c.surfaceSubtle, borderWidth: 1, borderColor: nyD ? ny.kontur : c.borderLight },
  unitChipActive: { backgroundColor: nyD ? ny.skog : c.primaryTint, borderColor: nyD ? ny.skog : c.primary },
  unitChipText: { fontSize: 13, color: nyD ? ny.chipText : c.textSecondary, fontWeight: '500' },
  unitChipTextActive: { color: nyD ? ny.lime : c.primary, fontWeight: '600' },
  editActionsBar: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: nyD ? ny.ljus : c.surface, borderTopWidth: 1, borderTopColor: nyD ? ny.kontur : c.surfaceSubtle },
  cancelBtn: { flex: 1, padding: 12, borderRadius: nyD ? 14 : 10, borderWidth: 1, borderColor: nyD ? ny.kontur : c.borderLight, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: nyD ? ny.textDampad : c.textMuted, fontWeight: '500' },
  // Lime ar designens "tryck har": morkgron text pa lime, inte vit.
  saveBtn: { flex: 1, padding: 12, borderRadius: nyD ? 14 : 10, backgroundColor: nyD ? ny.lime : c.primary, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, color: nyD ? ny.skog : '#fff', fontWeight: '600' },
  // Bakgrund, rundning, rubrik och padding kommer från DraggableBottomSheet.
  sheet: { maxHeight: '85%' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: nyD ? ny.lime : c.primary, alignItems: 'center', justifyContent: 'center', shadowColor: nyD ? ny.skog : c.primary, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  renameTitle: nyD
    ? { fontFamily: nyFont.fet, fontWeight: 'normal', fontSize: 19, letterSpacing: -0.3, color: ny.padYta, marginBottom: 16 }
    : { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 16 },
  renameInput: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: c.inputBg, color: c.text },
  draftBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.primaryTint, borderWidth: 1, borderColor: c.primary200 },
  draftBannerText: { flex: 1, fontSize: 13, color: c.text },
  draftBannerAction: { fontSize: 13, fontWeight: '700', color: c.primary },
  editLabel: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 6, marginTop: 14 },
  editMultiline: { minHeight: 70, textAlignVertical: 'top' },
  editMultilineTall: { minHeight: 140, textAlignVertical: 'top' },
  instructionsText: { fontSize: 15, color: ny.text, lineHeight: 23 },
  renameSave: { marginTop: 16, backgroundColor: ny.lime, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  renameSaveText: { color: ny.skog, fontSize: 16, fontWeight: '600' },
  // "Laga nu" använder appens ljusa/varma tema (inte mörkt) för konsekvens.
  cookContainer: { flex: 1, backgroundColor: c.background },
  cookHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  cookRecipeTitle: { flex: 1, fontSize: 19, color: c.text, fontWeight: '700' },
  cookClose: { padding: 8 },
  cookProgress: { flexDirection: 'row', gap: 5, paddingHorizontal: 20, marginBottom: 8, flexWrap: 'wrap' },
  cookDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.borderLight },
  cookDotActive: { backgroundColor: c.primaryBtn, width: 20 },
  // Ankra steget (+ ingredienser) mot BOTTEN så det poppar upp så långt underifrån
  // som möjligt — nära nav-knapparna, alltid synligt utan att behöva skrolla. Långt
  // innehåll fyller uppåt och blir skrollbart.
  // flex-end ligger kvar, men nu bara på STEGETS yta. Det var när den satt på
  // en gemensam kropp med ingredienserna som allt tomrum samlades överst.
  cookBody: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 32, paddingVertical: 32, gap: 20 },
  cookSplitKolumn: { flex: 1 },
  cookSplitRad: { flex: 1, flexDirection: 'row' },
  cookIngredWrap: { maxHeight: COOK_INGRED_MAX_H, paddingHorizontal: 32, paddingTop: 8 },
  // I landskap är ingredienserna en egen kolumn med full höjd i stället för en
  // låg ruta — då är listan läsbar utan att skrollas, vilket är poängen.
  cookIngredKolumn: { flex: 1, paddingLeft: 32, paddingRight: 16, paddingTop: 8 },
  cookStegKolumn: { flex: 1.2 },
  cookIngredInnehall: { paddingBottom: 8 },
  cookIngredRad: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  cookIngredItem: { flex: 1, fontSize: 18, color: c.textMuted, lineHeight: 28, paddingVertical: 1 },
  cookIngredItemAvbockad: { textDecorationLine: 'line-through', opacity: 0.45 },
  cookTimer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, backgroundColor: c.surfaceSubtle, borderWidth: 1, borderColor: c.borderLight },
  cookTimerAktiv: { backgroundColor: c.primaryBtn, borderColor: c.primaryBtn },
  cookTimerText: { fontSize: 16, fontWeight: '700', color: c.primary },
  cookTimerTextAktiv: { color: '#fff' },
  cookStepLabel: { fontSize: 17, fontWeight: '700', color: c.primary },
  cookStepText: { fontSize: 22, color: c.text, lineHeight: 34, fontWeight: '400' },
  cookNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  // I landskap ligger stegkolumnen till höger, så navigeringen ska ligga under
  // DEN och inte sträcka sig över ingredienskolumnen — annars blir knapparna
  // långt från tummen som just bläddrat.
  cookNavLandskap: { alignSelf: 'flex-end', width: '54%', paddingRight: 32 },
  cookNavBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, backgroundColor: c.surfaceSubtle, borderWidth: 1, borderColor: c.borderLight },
  cookNavBtnDisabled: { opacity: 0.35 },
  cookNavText: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
  cookNavBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: c.primaryBtn },
  cookNavTextPrimary: { fontSize: 15, fontWeight: '700', color: '#fff' },
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
  dayGrid: { gap: 8, marginTop: 4 },
  dayGridItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: nyD ? ny.kort : c.surfaceSubtle, borderRadius: nyD ? 16 : 12 },
  dayGridItemTaken: { backgroundColor: nyD ? ny.bricka : c.background },
  dayGridLabel: nyD
    ? { fontFamily: nyFont.halvfet, fontWeight: 'normal', fontSize: 15, color: ny.text }
    : { fontSize: 15, fontWeight: '600', color: c.text },
  dayGridLabelTaken: { color: nyD ? ny.textDampad : c.textFaint },
  dayGridTakenHint: { fontSize: 12, fontWeight: '600', color: nyD ? ny.textDampad : c.textFaint, flexShrink: 1, marginLeft: 8, textAlign: 'right' },
  weekChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: nyD ? ny.kort : c.surfaceSubtle, borderWidth: 1, borderColor: nyD ? ny.kontur : c.borderLight, alignItems: 'center' },
  weekChipActive: { backgroundColor: nyD ? ny.skog : c.primaryTint, borderColor: nyD ? ny.skog : c.primary },
  weekChipText: { fontSize: 13, fontWeight: '600', color: nyD ? ny.chipText : c.textSecondary },
  weekChipTextActive: { color: nyD ? ny.lime : c.primary },
  weekChipSub: { fontSize: 11, color: c.textFaint, marginTop: 2 },
  weekChipSubActive: { color: c.primary400 },
});

export default function RecipeDetailScreen() {
  const { recipeId, transfer, edit, forMenuDay, forMenuWeek, from, cook } = useLocalSearchParams<{ recipeId: string; transfer?: string; edit?: string; forMenuDay?: string; forMenuWeek?: string; from?: string; cook?: string }>();
  return <RecipeDetail recipeId={recipeId} transfer={transfer} edit={edit} forMenuDay={forMenuDay} forMenuWeek={forMenuWeek} from={from} cook={cook} />;
}
