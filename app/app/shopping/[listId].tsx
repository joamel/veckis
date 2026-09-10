import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { useTheme } from '../../src/context/ThemeContext';
import type { Palette } from '../../src/lib/theme';
import * as Haptics from 'expo-haptics';
import Fuse from 'fuse.js';
import { capitalize } from '../../src/lib/text';
import { useCheckHaptic } from '../../src/hooks/useCheckHaptic';
import { useSheetLift } from '../../src/hooks/useSheetLift';
import { normalizeQtyInput } from '../../src/lib/qty';
import { buildCategoryGroups, type CategoryGroup } from '../../src/lib/categoryGroups';
import { buildShoppingListRows, type ShoppingListRow } from '../../src/lib/shoppingListRows';
import { FlashList } from '@shopify/flash-list';
import { ConflictBanner } from '../../src/components/ConflictBanner';
import { ClearableInput } from '../../src/components/ClearableInput';
import { EmojiPicker } from '../../src/components/EmojiPicker';
import { DraggableBottomSheet } from '../../src/components/DraggableBottomSheet';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { emitShoppingChanged } from '../../src/lib/shoppingEvents';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  TouchableOpacity,
  View,
} from 'react-native';
import RNAnimated, {
  useSharedValue,
  useAnimatedKeyboard,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { pickStore } from '../../src/lib/storePicker';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { useApiClient, type ShoppingListWithItems, type ShoppingItemWithRecipe } from '../../src/api/client';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useSpotlightTip, useTipsReady } from '../../src/context/SpotlightTipContext';
import { useOnceFlag } from '../../src/hooks/useOnceFlag';
import { useHousehold } from '../../src/context/HouseholdContext';
import { usePendingRemoval } from '../../src/context/PendingRemovalContext';
import { useShoppingSocket } from '../../src/hooks/useShoppingSocket';
import { CATEGORY_LABELS, DEFAULT_CATEGORY_ORDER, SUB_TAXONOMY, subsForParent, type StoreCategory, type SubCategory, type StapleItem } from '@veckis/shared';
import { isIOSLike, isWeb } from '../../src/lib/platform';
import { shoppingList as str, common } from '../../src/lib/svenska';
import { enqueueToggle, getPendingToggles, clearPendingToggle, isNetworkError } from '../../src/lib/shoppingOfflineQueue';

const CATEGORY_EMOJIS: Record<StoreCategory, string> = {
  fruit_veg: '🥦', meat_fish: '🥩', deli_charcuterie: '🥓', cheese: '🧀', dairy_eggs: '🥛',
  bread_bakery: '🍞', frozen: '🧊', canned_dry: '🥫',
  snacks_sweets: '🍫', beverages: '🥤', special_diet: '🌱',
  cleaning: '🧹', personal_care: '🧴', baby_kids: '👶', other: '📦',
};

// Tak för hur många avbockade rader som renderas innan "visa alla". Listan
// virtualiserar inte, så utan tak monteras hela högen på en gång.
const CHECKED_RENDER_CAP = 50;

// Rad räknas som synlig så snart någon del syns — sticky-rubriken ska byta
// direkt när en ny kategori kommer in uppifrån.
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 0 };

// FlashList återvinner komponentinstanser i stället för att montera om, så den
// dyra reanimated-uppsättningen per rad (shared value + Pan-gest + animated
// style) sker en gång per synlig PLATS i stället för en gång per vara.
// Egen reanimated-wrapper: paketets AnimatedFlashList använder RN Animated, och
// scroll-handlern som driver rubrikanimationen är reanimated.
const AnimatedFlashList = RNAnimated.createAnimatedComponent(FlashList<ListRow>);

// FlashList v2 är byggd för New Architecture på native; webbstödet är sekundärt
// och trasigt för vårt bruk — någonstans i dess webbimplementation når en
// stil-ARRAY ett DOM-element, och React DOM kastar då
//   "Failed to set an indexed property [0] on CSSStyleDeclaration"
// vilket kraschade hela inköpslistan i PWA:n (bekräftat i den minifierade
// stacken: React DOMs setValueForStyles loopar över stilnycklar och får "0").
//
// Webben har inte problemet FlashList löser: listorna är korta och scrollas med
// mus på en snabb maskin. FlatList är RNW:s egen och beter sig som förväntat.
const AnimatedFlatList = RNAnimated.createAnimatedComponent(FlatList<ListRow>);
const ÄR_WEBB = Platform.OS === 'web';
const Lista = (ÄR_WEBB ? AnimatedFlatList : AnimatedFlashList) as typeof AnimatedFlashList;

// Ett stylesheet per PALETT, inte per rad. makeStyles bygger hela skärmens
// stilar; med useMemo inne i varje ItemRow gjordes det om vid varje mount, och
// vid långsam scroll monteras rader kontinuerligt. Cachen är modulglobal och
// byts bara när temat byts, alltså i praktiken en gång.
let itemRowPalette: Palette | null = null;
let itemRowStyles: ReturnType<typeof makeStyles> | null = null;
function getItemRowStyles(c: Palette) {
  if (itemRowPalette !== c || !itemRowStyles) {
    itemRowPalette = c;
    itemRowStyles = makeStyles(c);
  }
  return itemRowStyles;
}

// Rad-typen kommer från den testade byggaren i src/lib/shoppingListRows.
type ListRow = ShoppingListRow<ShoppingItemWithRecipe, CategoryGroup<ShoppingItemWithRecipe>>;
// Varurad-varianten, den enda ItemRow bryr sig om.
type RowListRow = Extract<ListRow, { kind: 'row' }>;

// Survives navigation within the session; resets on app restart
const dismissedDupesStore = new Map<string, Set<string>>();

// Signaturen innehåller varu-ID:na, inte bara namnet. Ignorerar man "gurka st +
// gurka kg" gäller det just DEN uppsättningen — läggs en ny gurka till senare
// ändras signaturen och förslaget dyker upp igen. Med enbart namnet som nyckel
// blev ignoreringen permanent för resten av sessionen, så knappen förblev dold
// medan merge-modalen (som inte läser listan) ändå fortsatte öppnas.
function dupeGroupSignature(items: { id: string; name: string }[]): string {
  return `${items[0].name.toLowerCase().trim()}|${items.map(i => i.id).sort().join(',')}`;
}

// Auto-sidoscroll till aktiv chip i en horisontell kategori/underkategori-rad.
// Chip-onLayout fyller på x-positioner en gång (körs bara om positionen
// FAKTISKT ändras, inte varje render) — det är därför den gamla varianten
// (onLayout bara på den AKTIVA chippen) inte funkade när man förifyllde
// kategori programmatiskt (t.ex. tryck på ett sökförslag) medan pickern redan
// legat monterad sen tidigare: layouten hade redan skett en gång för en ANNAN
// aktiv kategori, så inget nytt onLayout-anrop kom för att trigga scrollen.
// Genom att spara ALLA chippars x (oavsett aktiv) och skrolla i en effekt som
// körs varje gång `activeKey` ändras, funkar det oavsett vilken väg kategorin
// sattes på (tryck i pickern ELLER programmatiskt).
function useChipAutoScroll(scrollRef: { current: ScrollView | null }, activeKey: string | null) {
  const xById = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (activeKey == null) return;
    const x = xById.current.get(activeKey);
    if (x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [activeKey, scrollRef]);
  return useCallback((key: string, x: number) => { xById.current.set(key, x); }, []);
}

export function ShoppingListDetail({ listId, onClose }: { listId: string; onClose?: () => void }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const goBack = useCallback(() => {
    if (onClose) { onClose(); return; }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/shopping' as never);
  }, [router, onClose]);
  const client = useApiClient();
  const { triggerCheck: triggerCheckHaptic, triggerDelete: triggerDeleteHaptic } = useCheckHaptic();
  const { showToast: showGlobalToast, showError } = useToast();
  const confirm = useConfirm();
  const showTip = useSpotlightTip();
  const tipsReady = useTipsReady();
  const mergeTip = useOnceFlag('seen-merge-tip');
  const mergeTipShownRef = useRef(false);
  const dupeBadgeRef = useRef<View>(null);
  // Lägg-till-barens höjd — dubblettknappen svävar precis ovanför den.
  const [addBarH, setAddBarH] = useState(0);
  const shopperTip = useOnceFlag('seen-shopper-tip');
  const shopperTipShownRef = useRef(false);
  const { householdId } = useHousehold();
  const { pendingMenuItemRemovals } = usePendingRemoval();
  const { getToken } = useAuth();

  const [list, setList] = useState<ShoppingListWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);
  const [staples, setStaples] = useState<StapleItem[]>([]);
  const [ingredientSuggestions, setIngredientSuggestions] = useState<{ name: string; category: string }[]>([]);
  // Hushållsmedlemmar för "Jag handlar"-presence-indikatorn (vem är aktiv?).
  const { userId: clerkUserId } = useAuth();
  const [members, setMembers] = useState<Array<{ id: string; displayName: string; clerkUserId: string | null }>>([]);
  const myMember = members.find(m => m.clerkUserId === clerkUserId) ?? null;
  const activeShopper = list?.activeShopperMemberId ? members.find(m => m.id === list.activeShopperMemberId) ?? null : null;
  const iAmShopping = !!myMember && list?.activeShopperMemberId === myMember.id;
  const [togglingShopper, setTogglingShopper] = useState(false);

  // Quick-add quantity sheet (chip tap)
  const [qtySheet, setQtySheet] = useState<{ name: string; category?: StoreCategory } | null>(null);
  const [qtyCategory, setQtyCategory] = useState<StoreCategory>('other');
  const [qtySubCategory, setQtySubCategory] = useState<SubCategory | null>(null);
  const [qtyCustomCategory, setQtyCustomCategory] = useState<string | null>(null);
  const [qtyCustomSubCategory, setQtyCustomSubCategory] = useState<string | null>(null);
  const [qtyValue, setQtyValue] = useState('1');
  const [qtyUnit, setQtyUnit] = useState('');
  const [mergeSheet, setMergeSheet] = useState<{ name: string; category: StoreCategory; items: ShoppingItemWithRecipe[] } | null>(null);
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set());
  const [mergeQty, setMergeQty] = useState('1');
  const [mergeUnit, setMergeUnit] = useState('');
  const [mergeName, setMergeName] = useState('');
  const [mergeCategory, setMergeCategory] = useState<StoreCategory>('other');
  const [manualPickerOpen, setManualPickerOpen] = useState(false);
  const mergeScrollRef = useRef<ScrollView>(null);
  // Smart merge-förslag: AI/förpackningskunskap hämtas async och får bara
  // skriva över prefillen om användaren inte hunnit röra fälten (dirty-ref —
  // state vore stale i fetch-closuren). Seq-token skyddar mot att ett sent
  // svar för förra dupe-gruppen landar i nästa.
  const [mergeSuggestionApplied, setMergeSuggestionApplied] = useState(false);
  const mergeFieldsDirtyRef = useRef(false);
  const mergeSuggestionSeq = useRef(0);
  const [manualPickerSelected, setManualPickerSelected] = useState<Set<string>>(new Set());

  // Category browser modal
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserCategory, setBrowserCategory] = useState<StoreCategory | null>(null);

  // Item edit modal
  const [editingItem, setEditingItem] = useState<ShoppingItemWithRecipe | null>(null);
  const [editConflict, setEditConflict] = useState<{ msg: string; latest?: ShoppingItemWithRecipe } | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editCategory, setEditCategory] = useState<StoreCategory>('other');
  const [editCustomCategory, setEditCustomCategory] = useState<string | null>(null);
  const [editSubCategory, setEditSubCategory] = useState<SubCategory | null>(null);
  const [editCustomSubCategory, setEditCustomSubCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pure transform-only collapsing header (UI-thread, no layout = zero lag).
  // The title area (background + title) slides up under the navbar as you scroll;
  // the title text additionally scales/translates so it lands centered in the navbar.
  const insets = useSafeAreaInsets();
  const NAVBAR_HEIGHT = 48;
  const TITLE_AREA_HEIGHT = 44;
  const COLLAPSE_RANGE = TITLE_AREA_HEIGHT;
  const HEADER_TOP = insets.top;
  const TITLE_SCALE = 0.62;
  const TITLE_LEFT_PADDING = 20;
  const { width: screenW, height: windowHeight } = useWindowDimensions();
  const [titleWidth, setTitleWidth] = useState(0);
  const scrollY = useSharedValue(0);
  // Sticky kategori-rubrik: pinnas precis under navbaren och visar den kategori
  // vars rad just nu passerar navbar-linjen. Drivs från scroll-offset + per-grupp
  // onLayout-y (relativt scroll-innehållet).
  // Läses ur listans SYNLIGA rader, inte ur uppmätta y-positioner: med
  // virtualisering är rader utanför vyn omonterade och har inga positioner.
  // Varje rad bär sin catLabel, så översta synliga raden ger kategorin.
  const [visibleCat, setVisibleCat] = useState<string | null>(null);
  const [scrolledPastTitle, setScrolledPastTitle] = useState(false);
  const stickyCat = scrolledPastTitle ? visibleCat : null;
  // Måste vara stabil mellan renders — FlatList kastar annars
  // "Changing onViewableItemsChanged on the fly is not supported".
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item: ListRow }> }) => {
    const next = viewableItems[0]?.item?.catLabel ?? null;
    setVisibleCat(prev => (prev === next ? prev : next));
  }).current;
  const scrollHandler = useAnimatedScrollHandler(e => {
    scrollY.value = e.contentOffset.y;
  });
  // Tröskeln beräknas på UI-tråden och hoppar till JS BARA när booleanen vänder.
  // Tidigare kördes ett runOnJS per scroll-frame, alltså ~60 hopp i sekunden
  // till JS-tråden mitt under scrollen — bara för att jämföra ett värde som
  // ändras två gånger per svep.
  useAnimatedReaction(
    () => scrollY.value > TITLE_AREA_HEIGHT * 0.5,
    (past, prev) => { if (past !== prev) runOnJS(setScrolledPastTitle)(past); },
    [TITLE_AREA_HEIGHT],
  );
  // Whole title-area slides up so its background disappears under the navbar.
  const titleAreaAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [0, COLLAPSE_RANGE], [0, -TITLE_AREA_HEIGHT], Extrapolation.CLAMP) }],
  }));
  // Title text shrinks and slides diagonally from left-aligned (expanded) to
  // navbar-center (compact). translateX target computed from measured natural width
  // so it lands exactly centered regardless of title length.
  // Default transform-origin is the text's own center → scaling around center keeps
  // the natural center fixed at (LEFT_PADDING + titleWidth/2). To center the scaled
  // text on screen, translate so that new center = screenW/2.
  const targetTranslateX = titleWidth > 0
    ? screenW / 2 - (TITLE_LEFT_PADDING + titleWidth / 2)
    : 0;
  const titleTextAnimStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [0, COLLAPSE_RANGE], [0, 1], Extrapolation.CLAMP);
    // Titel-boxen (höjd TITLE_AREA_HEIGHT) glider upp till navbarens position.
    // Dess mitt hamnar TITLE_AREA_HEIGHT/2 under boxens topp; för att centrera
    // texten vertikalt i navbaren justerar vi med halva höjdskillnaden.
    const adjustY = (TITLE_AREA_HEIGHT - NAVBAR_HEIGHT) / 2;
    return {
      // Cast: reanimated 4's transform typing rejects the inferred union of
      // single-key objects; runtime is unaffected.
      transform: [
        { translateY: adjustY * t },
        { translateX: targetTranslateX * t },
        { scale: 1 - (1 - TITLE_SCALE) * t },
      ],
    } as never;
  });

  // "Jag handlar"-indikatorn: full text innan scroll, kollapsar till bara
  // gubbe-ikonen när rubriken fälls upp till mitten (annars krockar de). En
  // diskret puls var ~10:e sekund påminner om att läget är aktivt.
  const shopperPulse = useSharedValue(1);
  const shopperActive = !!list?.activeShopperMemberId && !!activeShopper;
  useEffect(() => {
    if (shopperActive) {
      shopperPulse.value = withRepeat(
        withSequence(
          withDelay(9000, withTiming(1.18, { duration: 250 })),
          withTiming(1, { duration: 250 }),
        ),
        -1,
        false,
      );
    } else {
      shopperPulse.value = withTiming(1, { duration: 150 });
    }
  }, [shopperActive, shopperPulse]);
  const shopperTextAnimStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [0, COLLAPSE_RANGE], [1, 0], Extrapolation.CLAMP);
    return { opacity: t, maxWidth: t * 80, marginRight: t * 6 };
  });
  const shopperIconAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: shopperPulse.value }] }));
  // Butiken ligger alltid i navbaren (vänster). Ikonen syns alltid; namnet
  // kollapsar (opacity + maxWidth) när rubriken fälls upp till mitten, så det
  // inte krockar med den centrerade rubriken.
  const storeNameAnimStyle = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [0, COLLAPSE_RANGE], [1, 0], Extrapolation.CLAMP);
    return { opacity: t, maxWidth: t * 80, marginLeft: t * 6 };
  });
  // Dubblett-pill: döljs när rubriken kollapsar (samma interpolation som storeName).
  // Collapsed categories — tap category header to fold/unfold its items.
  const [collapsedCategories, setCollapsedCategories] = useState<Set<StoreCategory | 'checked'>>(new Set(['checked']));
  // Hur många avbockade rader som renderas just nu. Höjs stegvis, aldrig till
  // "alla" — listan virtualiserar inte, så ett obegränsat läge skulle montera
  // hela högen på en gång och ge tillbaka precis den lagg vi byggde bort.
  const [checkedLimit, setCheckedLimit] = useState(CHECKED_RENDER_CAP);
  function toggleCategoryCollapsed(cat: StoreCategory | 'checked') {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  // Staple edit modal (long-press on suggestion chip)
  const [editingStaple, setEditingStaple] = useState<StapleItem | null>(null);
  const [stapleName, setStapleName] = useState('');
  const [stapleUnit, setStapleUnit] = useState('');
  const [stapleCategory, setStapleCategory] = useState<StoreCategory>('other');
  const [savingStaple, setSavingStaple] = useState(false);

  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameEmoji, setRenameEmoji] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);

  async function saveRename() {
    if (!listId) return;
    const newName = renameValue.trim();
    if (!newName) return;
    setRenaming(true);
    const prev = { name: list?.name, emoji: list?.emoji };
    setList(p => p ? { ...p, name: newName, emoji: renameEmoji } : p);
    setShowRenameModal(false);
    try {
      await client.updateShoppingList(listId, { name: newName, emoji: renameEmoji });
    } catch (e) {
      setList(p => p && prev.name !== undefined ? { ...p, name: prev.name!, emoji: prev.emoji ?? null } : p);
      showError(e, str.toasts.errorRename);
    } finally {
      setRenaming(false);
    }
  }
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // Tangentbordshöjd (från modalens eget fönster där keyboardDidShow.height funkar)
  // — används för att ge merge-listans innehåll utrymme att scrollas ovanför
  // tangentbordet, eftersom sheet-lyftet inte når fält djupt inne i en ScrollView.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardHeightRef = useRef(0);
  // Native tangentbordslyft för "lägg till vara"-baren. RN:s keyboardDidShow-höjd
  // är opålitlig på Android under SDK 54 edge-to-edge (OS:et resizar inte fönstret),
  // så vi läser höjden via reanimated (WindowInsets-baserat, funkar edge-to-edge) och
  // lyfter baren med paddingBottom. Web hanteras separat av KAV/browser-resize.
  const animKeyboard = useAnimatedKeyboard();
  // Grinda på keyboardVisible: när mängd-modalen (openQtySheet) öppnas tar dess
  // egna fönster över tangentbordet och reanimated-höjden här fryser på sitt
  // sista värde → baren fastnar lyft när modalen stängs. JS-lyssnaren
  // keyboardDidHide fyrar pålitligt ändå, så när tangentbordet är borta tvingar
  // vi lyftet till 0 oavsett den frusna höjden.
  const addBarLift = useAnimatedStyle(() => ({
    // isWeb() (importerad, icke-worklet-funktion) kraschade UI-tråden med "Object
    // is not a function" — Reanimated kan bara serialisera värden/worklets in i
    // useAnimatedStyle, inte anrop till vanliga JS-funktioner från andra moduler.
    // Platform.OS är ett vanligt värde och fångas säkert direkt i worklet-scopet.
    paddingBottom: (Platform.OS as any) === 'web' || !keyboardVisible ? 0 : animKeyboard.height.value,
  }));
  const inputRef = useRef<TextInput>(null);
  const editNameRef = useRef<TextInput>(null);
  const editQtyRef = useRef<TextInput>(null);
  const editUnitRef = useRef<TextInput>(null);
  // Auto-sidoscroll till vald kategori/underkategori (se useChipAutoScroll ovan).
  const editCatScrollRef = useRef<ScrollView>(null);
  const editSubScrollRef = useRef<ScrollView>(null);
  const recordEditCatChipLayout = useChipAutoScroll(editCatScrollRef, editCustomCategory ? `c:${editCustomCategory}` : editCategory);
  const recordEditSubChipLayout = useChipAutoScroll(editSubScrollRef, editCustomSubCategory ? `cs:${editCustomSubCategory}` : (editSubCategory ?? '__none__'));
  const stapleCatScrollRef = useRef<ScrollView>(null);
  const recordStapleCatChipLayout = useChipAutoScroll(stapleCatScrollRef, stapleCategory);
  // Mängd-sheeten (öppnas av openQtySheet — det HÄR är flödet ett tryck på ett
  // sökförslag faktiskt går via, till skillnad från redigera-vara/stapel-
  // redigeraren ovan som redan hade (eller fick) auto-scroll.
  const qtyCatScrollRef = useRef<ScrollView>(null);
  const qtySubScrollRef = useRef<ScrollView>(null);
  const recordQtyCatChipLayout = useChipAutoScroll(qtyCatScrollRef, qtyCustomCategory ? `c:${qtyCustomCategory}` : qtyCategory);
  const recordQtySubChipLayout = useChipAutoScroll(qtySubScrollRef, qtyCustomSubCategory ? `cs:${qtyCustomSubCategory}` : (qtySubCategory ?? '__none__'));
  const stapleNameRef = useRef<TextInput>(null);
  const stapleUnitRef = useRef<TextInput>(null);
  const qtyValueRef = useRef<TextInput>(null);
  const qtyUnitRef = useRef<TextInput>(null);
  const renameInputRef = useRef<TextInput>(null);
  const mergeNameRef = useRef<TextInput>(null);
  const mergeQtyRef = useRef<TextInput>(null);
  const mergeUnitRef = useRef<TextInput>(null);
  // Scroll-into-view-lyft för edit-modalerna (mät fokuserat fält, lyft lagom).
  const { sheetLift, onFocusInput } = useSheetLift();
  // Merge: fälten ligger djupt i listans ScrollView → sheet-lyftet når dem inte,
  // och RN auto-scrollar inte till fokuserad input på Android. Mät fältet och
  // scrolla listan PRECIS så mycket att fältet + chips-raden under (~150px) hamnar
  // ovanför tangentbordet — inte till slutet (som över-scrollade).
  const mergeScrollY = useRef(0);
  const onMergeFocus = useCallback((ref: React.RefObject<TextInput | null>) => () => {
    setTimeout(() => {
      const kb = keyboardHeightRef.current;
      if (!kb) return;
      ref.current?.measureInWindow((_x, y, _w, h) => {
        const overlap = (y + h + 150) - (windowHeight - kb);
        if (overlap > 4) mergeScrollRef.current?.scrollTo({ y: mergeScrollY.current + overlap, animated: true });
      });
    }, 350);
  }, [windowHeight]);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMessage, setToastMessage] = useState('');
  const dupeButtonScale = useRef(new Animated.Value(1)).current;
  const hasPulsedDupes = useRef(false);
  const pendingOpenNextDupe = useRef(false);

  function showToast(msg: string) {
    setToastMessage(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }

  useShoppingSocket(listId, getToken, (msg) => {
    if (msg.type === 'items_auto_merged') {
      showGlobalToast(str.toasts.merged(msg.data.count, capitalize(msg.data.name)), 'success');
      return;
    }
    // Aktiv handlare med appen öppen: toast direkt när någon ANNAN lägger till
    // en vara (varan dyker annars tyst upp i listan och kan missas). Pushen
    // täcker bakgrundsfallet; toasten förgrundfallet.
    if (msg.type === 'item_added' && iAmShopping) {
      const exists = list?.items.some(i => i.id === msg.data.id);
      const mine = !!msg.actor && myMember?.displayName === msg.actor;
      if (!exists && !mine) {
        showGlobalToast(str.toasts.shopperItemAdded(capitalize(msg.data.name), msg.actor ?? null), 'neutral');
      }
    }
    // Conflict warning: someone else changed/removed the item you have open for
    // editing. Last-write-wins still applies — this just makes the overwrite
    // visible instead of silent.
    if ((msg.type === 'item_updated' || msg.type === 'item_deleted') && editingItem && msg.data.id === editingItem.id) {
      const who = msg.actor ?? str.fallbackActor;
      if (msg.type === 'item_deleted') {
        // Modal closes → a root toast is visible again.
        showGlobalToast(str.conflict.deleted(who, capitalize(editingItem.name)), 'neutral');
        setEditingItem(null);
        setEditConflict(null);
      } else {
        // Modal stays open → show an inline banner (toast would be behind it).
        // Distinguish a check-toggle from a real content edit so the message and
        // the "Visa senaste" button (only useful when content changed) fit.
        const n = msg.data;
        const contentChanged =
          n.name !== editingItem.name ||
          n.quantity !== editingItem.quantity ||
          (n.unit ?? '') !== (editingItem.unit ?? '') ||
          n.category !== editingItem.category;
        const checkChanged = n.isChecked !== editingItem.isChecked;
        const conflictMsg = checkChanged && !contentChanged
          ? (n.isChecked ? str.conflict.checked(who, capitalize(editingItem.name)) : str.conflict.unchecked(who, capitalize(editingItem.name)))
          : str.conflict.changed(who, capitalize(editingItem.name));
        setEditConflict({ msg: conflictMsg, latest: contentChanged ? n : undefined });
      }
    }
    setList(prev => {
      if (!prev) return prev;
      switch (msg.type) {
        case 'item_added': {
          const exists = prev.items.some(i => i.id === msg.data.id);
          if (exists) return prev;
          return { ...prev, items: [...prev.items, { ...msg.data, recipe: null }] };
        }
        case 'item_updated':
          return {
            ...prev,
            items: prev.items.map(i =>
              i.id === msg.data.id ? { ...msg.data, recipe: i.recipe } : i,
            ),
          };
        case 'item_deleted':
          return { ...prev, items: prev.items.filter(i => i.id !== msg.data.id) };
        case 'list_cleared':
          return { ...prev, items: [] };
        case 'shopping_presence':
          return {
            ...prev,
            activeShopperMemberId: msg.data.memberId,
            activeShopperSince: msg.data.since,
          };
        default:
          return prev;
      }
    });
  });

  async function toggleIAmShopping() {
    if (!list || !myMember || togglingShopper) return;
    setTogglingShopper(true);
    const next = iAmShopping ? null : myMember.id;
    // Optimistisk uppdatering — backend broadcastar tillbaka när det landat.
    setList(prev => prev ? { ...prev, activeShopperMemberId: next, activeShopperSince: next ? new Date().toISOString() : null } : prev);
    try {
      await client.setListShopper(list.id, next);
    } catch (e) {
      // Rulla tillbaka
      setList(prev => prev ? { ...prev, activeShopperMemberId: list.activeShopperMemberId, activeShopperSince: list.activeShopperSince } : prev);
      showError(e, str.toasts.errorShopper);
    } finally {
      setTogglingShopper(false);
    }
  }

  const openMergeForDupes = useCallback((
    dupes: ShoppingItemWithRecipe[],
    lastItem?: { quantity?: number | null; unit?: string | null },
  ) => {
    if (dupes.length < 2) return;
    const totalQty = dupes.reduce((sum, d) => sum + (d.quantity ?? 1), 0);
    const bestUnit = lastItem?.unit
      || [...dupes].reverse().map(d => d.unit ?? '').find(Boolean)
      || '';
    setMergeSheet({ name: dupes[0].name.toLowerCase().trim(), category: dupes[0].category as StoreCategory, items: dupes });
    setMergeSelected(new Set(dupes.map(i => i.id)));
    setMergeQty(String(totalQty).replace('.', ','));
    setMergeUnit(bestUnit);
    setMergeName(capitalize(dupes[0].name));
    setMergeCategory(dupes[0].category as StoreCategory);
    setTimeout(() => mergeScrollRef.current?.scrollTo({ y: 0, animated: false }), 0);

    // Smart förslag (förpacknings-ekvivalenser): naiva prefillen ovan visas
    // direkt; om servern hittar något bättre uppdateras fälten — men bara om
    // användaren inte hunnit röra dem. Offline/fel → dagens beteende.
    setMergeSuggestionApplied(false);
    mergeFieldsDirtyRef.current = false;
    const seq = ++mergeSuggestionSeq.current;
    client.getMergeSuggestion({ itemIds: dupes.map(d => d.id) })
      .then(({ suggestion }) => {
        if (seq !== mergeSuggestionSeq.current || !suggestion) return;
        if (mergeFieldsDirtyRef.current) return;
        setMergeQty(String(suggestion.quantity).replace('.', ','));
        setMergeUnit(suggestion.unit);
        setMergeSuggestionApplied(true);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryOrder: StoreCategory[] = (list?.store?.categoryOrder as StoreCategory[]) ?? DEFAULT_CATEGORY_ORDER;

  const [dismissedDupeKeys, setDismissedDupeKeys] = useState<Set<string>>(
    () => dismissedDupesStore.get(listId ?? '') ?? new Set(),
  );

  const duplicateGroups = useMemo(() => {
    if (!list) return [];
    const nameMap = new Map<string, ShoppingItemWithRecipe[]>();
    for (const item of list.items.filter(i => !i.isChecked && !i.id.startsWith('optimistic-'))) {
      const key = item.name.toLowerCase().trim();
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key)!.push(item);
    }
    return [...nameMap.values()].filter(g => {
      if (g.length < 2 || dismissedDupeKeys.has(dupeGroupSignature(g))) return false;
      // Flagga bara om gruppen faktiskt ger ≥2 RADER efter samma aggregering som
      // listan och dubblett-arket använder. Tidigare var regeln "≥2 olika
      // enheter", en egen variant som kunde ge annat svar än aggregeringen — då
      // flaggades grupper som kollapsade till en enda rad, och arket visade ett
      // ensamt förslag med "Slå ihop 1 rad" utgråad. Samma regel överallt nu:
      // föreslå ihopslagning bara när listan visar mer än en rad för namnet.
      return isMergeableDupe(g);
    });
  }, [list, dismissedDupeKeys]);

  // Antal AGGREGERADE rader som är helt valda i dubblett-arket. Knappen och
  // dess disabled-villkor räknar rader, inte råvaror.
  const selectedMergeRows = mergeSheet
    ? aggregateByNameUnit(mergeSheet.items).filter(g => g.members.every(m => mergeSelected.has(m.id))).length
    : 0;

  function dismissDupeGroup(items: ShoppingItemWithRecipe[]) {
    if (items.length === 0) return;
    const next = new Set([...dismissedDupeKeys, dupeGroupSignature(items)]);
    dismissedDupesStore.set(listId ?? '', next);
    setDismissedDupeKeys(next);
  }

  useEffect(() => {
    if (duplicateGroups.length > 0 && !hasPulsedDupes.current) {
      hasPulsedDupes.current = true;
      Animated.sequence([
        Animated.timing(dupeButtonScale, { toValue: 1.2, duration: 220, useNativeDriver: true }),
        Animated.timing(dupeButtonScale, { toValue: 0.9, duration: 180, useNativeDriver: true }),
        Animated.timing(dupeButtonScale, { toValue: 1.15, duration: 180, useNativeDriver: true }),
        Animated.timing(dupeButtonScale, { toValue: 0.95, duration: 160, useNativeDriver: true }),
        Animated.timing(dupeButtonScale, { toValue: 1.1, duration: 160, useNativeDriver: true }),
        Animated.timing(dupeButtonScale, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
    if (duplicateGroups.length === 0) hasPulsedDupes.current = false;
  }, [duplicateGroups.length]);

  // Dubblett-tip: den pulsande badgen är gåtfull utan förklaring — fyra ett tip
  // ankrat vid badgen så fort den dyker upp. Väntar tills koncept-guiden är klar.
  useEffect(() => {
    if (!tipsReady) return;
    if (mergeTip.seen !== false || mergeTipShownRef.current) return;
    if (duplicateGroups.length === 0) return;
    const shown = showTip({
      title: str.tips.merge.title,
      message: str.tips.merge.message,
      targetRef: dupeBadgeRef,
    });
    if (shown) { mergeTipShownRef.current = true; mergeTip.markSeen(); }
  }, [tipsReady, duplicateGroups.length, mergeTip.seen, mergeTip.markSeen, showTip]);

  // "Jag handlar"-tip: passivt (knappen ligger gömd i ⋮-menyn) — förklarar
  // realtidsfunktionen när listan har varor. Sekvenseras efter dubblett-tipset
  // (vänta tills det är sett, eller om inga dubbletter finns) så inte två fyrar.
  useEffect(() => {
    if (!tipsReady) return;
    if (shopperTip.seen !== false || shopperTipShownRef.current) return;
    if (!list || list.items.length === 0) return;
    if (duplicateGroups.length > 0 && mergeTip.seen !== true) return;
    const shown = showTip({
      title: str.tips.shopper.title,
      message: str.tips.shopper.message,
    });
    if (shown) { shopperTipShownRef.current = true; shopperTip.markSeen(); }
  }, [tipsReady, list, duplicateGroups.length, mergeTip.seen, shopperTip.seen, shopperTip.markSeen, showTip]);

  useEffect(() => {
    if (pendingOpenNextDupe.current && !mergeSheet && duplicateGroups.length > 0) {
      pendingOpenNextDupe.current = false;
      openMergeForDupes(duplicateGroups[0]);
    }
  }, [mergeSheet, duplicateGroups, openMergeForDupes]);

  const searchList = useMemo(() => {
    // Only surface staples added more than once — a one-off (often a typo or a
    // mistakenly added item) shouldn't pollute search. Curated ingredient
    // suggestions still cover common names, so legit items remain searchable.
    const searchableStaples = staples.filter(s => s.usageCount >= 2);
    const stapleNames = new Set(searchableStaples.map(s => s.name.toLowerCase()));
    const extra = ingredientSuggestions
      .filter(s => !stapleNames.has(s.name.toLowerCase()))
      .map(s => ({ name: s.name, id: `suggestion:${s.name}`, category: s.category } as unknown as StapleItem));
    return [...searchableStaples, ...extra];
  }, [staples, ingredientSuggestions]);

  const fuse = useMemo(() => new Fuse(searchList, { keys: ['name'], threshold: 0.35, minMatchCharLength: 1 }), [searchList]);
  const suggestions = newItem.trim().length >= 1
    ? fuse.search(newItem).slice(0, 8).map(r => r.item)
    : [];

  // Most-added staples (getStaples returns them usageCount-desc) — shown as
  // quick-add chips when the add field is empty so återkommande inköp går snabbt.
  const topStaples = useMemo(() => staples.filter(s => s.usageCount > 0).slice(0, 8), [staples]);

  const load = useCallback(async () => {
    if (!listId || !householdId) return;
    try {
      const [data, stapleList, suggestions, household] = await Promise.all([
        client.getShoppingList(listId),
        client.getStaples(householdId),
        client.getIngredientSuggestions(householdId).catch(() => [] as { name: string; category: string }[]),
        client.getHousehold(householdId).catch(() => null),
      ]);

      // Applicera väntande offline-mutationer ovanpå server-datan så att
      // optimistiska bockar inte skrivs över vid nästa focus/reload.
      const pending = getPendingToggles(listId);
      if (pending.size > 0) {
        data.items = data.items.map(i => {
          const q = pending.get(i.id);
          return q !== undefined ? { ...i, isChecked: q } : i;
        });
      }
      setList(data);
      setStaples(stapleList);
      setIngredientSuggestions(suggestions);
      if (household) setMembers(household.members);

      // Nu är vi online — spela upp kön
      if (pending.size > 0) {
        for (const [itemId, checked] of pending) {
          client.checkShoppingItem(itemId, checked)
            .then(updated => {
              clearPendingToggle(listId, itemId);
              setList(prev => prev ? {
                ...prev,
                items: prev.items.map(i => i.id === updated.id ? { ...updated, recipe: i.recipe } : i),
              } : prev);
            })
            .catch(() => {}); // fortfarande offline — lämna kvar i kön
        }
      }
    } catch {
      confirm({ title: common.errorTitle, message: str.toasts.errorLoad, buttons: [{ label: common.actions.ok }] });
    } finally {
      setLoading(false);
    }
  }, [listId, householdId, openMergeForDupes]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardVisible(true);
      if (e.endCoordinates?.height) { setKeyboardHeight(e.endCoordinates.height); keyboardHeightRef.current = e.endCoordinates.height; }
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);


  async function addItem(name?: string, category?: StoreCategory, quantity?: number, unit?: string, subCategory?: SubCategory | null, customCategory?: string | null, customSubCategory?: string | null) {
    let itemName = (name ?? newItem).trim().toLowerCase();
    if (!listId || !itemName) return;

    const tempId = `optimistic-${Date.now()}`;
    const optimisticItem: ShoppingItemWithRecipe = {
      id: tempId,
      listId,
      name: itemName,
      quantity: quantity ?? 1,
      unit: unit ?? null,
      category: category ?? 'other',
      customCategory: customCategory ?? null,
      customSubCategory: customSubCategory ?? null,
      subCategory: subCategory ?? null,
      isChecked: false,
      checkedBy: null,
      addedBy: '',
      note: null,
      recipeId: null,
      menuItemId: null,
      recipe: null,
    };

    setList(prev => prev ? { ...prev, items: [...(prev.items ?? []), optimisticItem] } : prev);
    setNewItem('');
    Keyboard.dismiss();
    setAdding(true);

    try {
      const item = await client.addShoppingItem(listId, {
        name: itemName,
        ...(category ? { category } : {}),
        ...(subCategory ? { subCategory } : {}),
        ...(customCategory ? { customCategory } : {}),
        ...(customSubCategory ? { customSubCategory } : {}),
        ...(quantity && quantity !== 1 ? { quantity } : {}),
        ...(unit ? { unit } : {}),
      });
      setList(prev => {
        if (!prev) return prev;
        const itemExists = prev.items.some(i => i.id === item.id);
        if (itemExists) {
          // Server merged with an existing item — remove optimistic entry and update real one
          return {
            ...prev,
            items: prev.items
              .filter(i => i.id !== tempId)
              .map(i => i.id === item.id ? { ...item, recipe: i.recipe } : i),
          };
        }
        // Replace optimistic entry with real item
        return {
          ...prev,
          items: prev.items.map(i => i.id === tempId ? { ...item, recipe: null } : i),
        };
      });
      if (householdId) {
        client.upsertStaple({
          householdId,
          name: itemName,
          ...(category ? { category } : {}),
          ...(quantity && quantity !== 1 ? { defaultQuantity: quantity } : {}),
          ...(unit ? { unit } : {}),
        }).then(s => {
          setStaples(prev => {
            const exists = prev.find(p => p.id === s.id);
            return exists ? prev.map(p => p.id === s.id ? s : p) : [...prev, s].sort((a, b) => a.name.localeCompare(b.name));
          });
          showToast(str.toasts.added(capitalize(itemName)));
        }).catch(() => {});
      }
      setList(prev => {
        if (!prev) return prev;
        const currentItems = prev.items.filter(i => i.id !== tempId);
        const realItem = currentItems.find(i => i.id === item.id) ?? { ...item, recipe: null };
        const dupes = currentItems.filter(i => !i.isChecked && i.name.toLowerCase().trim() === itemName);
        if (isMergeableDupe(dupes)) openMergeForDupes(dupes, realItem);
        return prev;
      });
    } catch (err) {
      console.error('Failed to add item:', err);
      setList(prev => prev ? { ...prev, items: (prev.items ?? []).filter(i => i.id !== tempId) } : prev);
      showError(err, str.toasts.errorAddItem);
    } finally {
      setAdding(false);
    }
  }

  function openQtySheet(name: string, category?: StoreCategory) {
    const staple = staples.find(s => s.name.toLowerCase() === name.toLowerCase());
    setQtyValue(staple?.defaultQuantity ? String(staple.defaultQuantity).replace('.', ',') : '1');
    setQtyUnit(staple?.unit ?? '');
    setQtyCategory((category ?? staple?.category ?? 'other') as StoreCategory);
    setQtySubCategory(null);
    setQtyCustomCategory(null);
    setQtyCustomSubCategory(null);
    setQtySheet({ name, category });
    Keyboard.dismiss();
  }

  async function confirmQtySheet() {
    if (!qtySheet) return;
    const qty = parseFloat(qtyValue.replace(',', '.'));
    const unit = qtyUnit.trim() || undefined;
    await addItem(qtySheet.name, qtyCategory, isNaN(qty) ? 1 : qty, unit, qtySubCategory, qtyCustomCategory, qtyCustomSubCategory);
    setQtySheet(null);
  }

  // Tar en RAD (alla varor bakom den aggregerade raden), inte en enskild vara —
  // arket visar samma aggregering som listan.
  function toggleMergeRow(ids: string[], allSelected: boolean) {
    // Förslaget beräknades för hela gruppen — annat urval gör det ogiltigt.
    mergeFieldsDirtyRef.current = true;
    setMergeSuggestionApplied(false);
    setMergeSelected(prev => {
      const next = new Set(prev);
      for (const id of ids) { if (allSelected) next.delete(id); else next.add(id); }
      return next;
    });
  }

  async function confirmMerge() {
    if (!mergeSheet) return;
    const selected = mergeSheet.items.filter(i => mergeSelected.has(i.id));
    if (selected.length < 2) return;
    const qty = parseFloat(mergeQty.replace(',', '.'));
    const unit = mergeUnit.trim() || undefined;
    const name = (mergeName.trim() || selected[0].name).toLowerCase();
    const sourceIds = selected.map(i => i.id);
    const hideIds = new Set(sourceIds);
    setAdding(true);
    try {
      const container = await client.mergeShoppingItems({
        sourceIds,
        name,
        quantity: isNaN(qty) ? 1 : qty,
        unit: unit ?? null,
        category: mergeCategory,
      });
      // Build the post-merge list locally so we can find next dupes synchronously
      const baseItems = list?.items ?? [];
      const updatedItems: ShoppingItemWithRecipe[] = [
        ...baseItems.filter(i => !hideIds.has(i.id) && i.id !== container.id),
        { ...container, recipe: null } as ShoppingItemWithRecipe,
      ];
      setList(prev => prev ? { ...prev, items: updatedItems } : prev);
      Keyboard.dismiss(); // drop the keyboard when moving on / closing the sheet

      // Compute next auto-dupe group from the new items
      const nameMap = new Map<string, ShoppingItemWithRecipe[]>();
      for (const it of updatedItems.filter(i => !i.isChecked && !i.id.startsWith('optimistic-'))) {
        const key = it.name.toLowerCase().trim();
        if (!nameMap.has(key)) nameMap.set(key, []);
        nameMap.get(key)!.push(it);
      }
      const justMergedKey = name.toLowerCase().trim();
      const nextGroup = [...nameMap.entries()]
        .filter(([k]) => k !== justMergedKey) // skip the group we just dealt with
        .map(([, g]) => g)
        .find(g => g.length >= 2 && !dismissedDupeKeys.has(g[0].name.toLowerCase().trim()));
      if (nextGroup) openMergeForDupes(nextGroup);
      else setMergeSheet(null);
      // Undo = delete the container, which fully unmerges (restores the sources).
      showGlobalToast(str.toasts.merged(selected.length, capitalize(name)), 'success', {
        label: common.actions.undo,
        onPress: async () => {
          try { await client.deleteShoppingItem(container.id); load(); }
          catch (e) { showError(e, str.toasts.errorUndo); }
        },
      });
    } catch (e) {
      showError(e, str.toasts.errorMerge);
    } finally {
      setAdding(false);
    }
  }

  function goToBulkTransfer() {
    router.push(`/(tabs)/menu?bulkTransfer=1&originListId=${listId}` as never);
  }

  function checkAllUnchecked() {
    if (!list) return;
    const targets = list.items.filter(i => !i.isChecked && !i.id.startsWith('optimistic-'));
    if (targets.length === 0) return;
    // Bekräfta först (kan påverka många varor) …
    confirm({
      title: str.checkAllDialog.title,
      message: str.checkAllDialog.message(targets.length),
      buttons: [
        { label: str.checkAllDialog.confirm, onPress: () => doCheckAll(targets) },
        { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }

  function doCheckAll(targets: ShoppingItemWithRecipe[]) {
    const ids = targets.map(i => i.id);
    setList(prev => prev ? { ...prev, items: prev.items.map(i => ids.includes(i.id) ? { ...i, isChecked: true } : i) } : prev);
    // … och en ångra-toast (som delete): committa efter 5s, ångra avbryter.
    let cancelled = false;
    showGlobalToast(str.toasts.allChecked(ids.length), 'neutral', {
      label: common.actions.undo,
      onPress: () => {
        cancelled = true;
        setList(prev => prev ? { ...prev, items: prev.items.map(i => ids.includes(i.id) ? { ...i, isChecked: false } : i) } : prev);
      },
    });
    setTimeout(async () => {
      if (cancelled) return;
      try {
        await Promise.all(ids.map(id => client.checkShoppingItem(id, true)));
        emitShoppingChanged();
      } catch (e) {
        setList(prev => prev ? { ...prev, items: prev.items.map(i => ids.includes(i.id) ? { ...i, isChecked: false } : i) } : prev);
        showError(e, str.toasts.errorCheckAll);
      }
    }, 5000);
  }

  async function toggleItem(item: ShoppingItemWithRecipe) {
    const newChecked = !item.isChecked;
    if (newChecked) triggerCheckHaptic();
    setList(prev =>
      prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, isChecked: newChecked } : i) } : prev
    );
    try {
      const updated = await client.checkShoppingItem(item.id, newChecked);
      clearPendingToggle(listId!, item.id);
      setList(prev => prev ? { ...prev, items: prev.items.map(i => i.id === updated.id ? { ...updated, recipe: item.recipe } : i) } : prev);
    } catch (e) {
      if (isNetworkError(e)) {
        // Offline — behåll optimistisk bockning och köa för replay vid reconnect
        enqueueToggle(listId!, item.id, newChecked);
      } else {
        // Serverfel — rulla tillbaka och visa fel
        setList(prev =>
          prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? item : i) } : prev
        );
        showError(e, str.toasts.errorCheck);
      }
    }
  }

  async function markAllInCategory(items: ShoppingItemWithRecipe[]) {
    const unchecked = items.filter(i => !i.isChecked);
    if (unchecked.length === 0) return;
    triggerCheckHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setList(prev =>
      prev ? { ...prev, items: prev.items.map(i => unchecked.some(u => u.id === i.id) ? { ...i, isChecked: true } : i) } : prev
    );
    await Promise.all(unchecked.map(async item => {
      try {
        const updated = await client.checkShoppingItem(item.id, true);
        clearPendingToggle(listId!, item.id);
        setList(prev => prev ? { ...prev, items: prev.items.map(i => i.id === updated.id ? { ...updated, recipe: item.recipe } : i) } : prev);
      } catch (e) {
        if (isNetworkError(e)) {
          enqueueToggle(listId!, item.id, true);
        } else {
          setList(prev => prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? item : i) } : prev);
        }
      }
    }));
    // Ångra-toast: bocka ur samma varor igen (samma mönster som rensa/merge).
    const ids = unchecked.map(i => i.id);
    showGlobalToast(str.toasts.categoryChecked(ids.length), 'success', {
      label: common.actions.undo,
      onPress: async () => {
        setList(prev => prev ? { ...prev, items: prev.items.map(i => ids.includes(i.id) ? { ...i, isChecked: false } : i) } : prev);
        try {
          await Promise.all(ids.map(id => client.checkShoppingItem(id, false)));
        } catch (e) {
          showError(e, str.toasts.errorUncheck);
          load();
        }
      },
    });
  }

  function fillEditForm(item: ShoppingItemWithRecipe) {
    setEditName(capitalize(item.name));
    setEditQty(item.quantity !== 1 || item.unit ? String(item.quantity).replace('.', ',') : '');
    setEditUnit(item.unit ?? '');
    setEditCategory(item.category as StoreCategory);
    setEditCustomCategory((item as { customCategory?: string | null }).customCategory ?? null);
    setEditSubCategory(((item as { subCategory?: string | null }).subCategory as SubCategory | null) ?? null);
    setEditCustomSubCategory((item as { customSubCategory?: string | null }).customSubCategory ?? null);
  }

  function openEditItem(item: ShoppingItemWithRecipe) {
    setEditingItem(item);
    setEditConflict(null);
    fillEditForm(item);
  }

  // "Visa senaste": pull the concurrent edit's values into the form on demand.
  function applyLatestEdit() {
    if (!editConflict?.latest) return;
    fillEditForm(editConflict.latest);
    setEditConflict(null);
  }

  async function saveEditItem() {
    if (!editingItem) return;
    setSaving(true);
    const qty = parseFloat(editQty.replace(',', '.')) || 1;
    const unit = editUnit.trim() || null;
    const name = (editName.trim() || editingItem.name).toLowerCase();
    const snapshot = editingItem;
    // Optimistic: update list + close modal before awaiting backend
    const optimisticItems = (list?.items ?? []).map(i =>
      i.id === editingItem.id ? { ...i, name, quantity: qty, unit, category: editCategory, customCategory: editCustomCategory, subCategory: editSubCategory, customSubCategory: editCustomSubCategory } : i
    );
    setList(prev => prev ? { ...prev, items: optimisticItems } : prev);
    setEditingItem(null);
    try {
      const updated = await client.updateShoppingItem(snapshot.id, {
        name,
        quantity: qty,
        unit,
        category: editCategory,
        customCategory: editCustomCategory,
        subCategory: editSubCategory,
        customSubCategory: editCustomSubCategory,
      });
      const savedRecipe = snapshot.recipe;
      const finalItems = optimisticItems.map(i =>
        i.id === updated.id ? { ...updated, recipe: savedRecipe } : i
      );
      setList(prev => prev ? { ...prev, items: finalItems } : prev);
      if (householdId) {
        const categoryChanged = editCategory !== snapshot.category;
        const unitChanged = unit !== snapshot.unit;
        if (categoryChanged || unitChanged) {
          client.upsertStaple({ householdId, name, category: editCategory, unit }).catch(() => {});
        }
      }
      const dupes = finalItems.filter(i => !i.isChecked && i.name.toLowerCase().trim() === name);
      if (dupes.length >= 2) {
        // Auto-merge silently if all dupes share the same unit (normalized)
        const norm = (u: string | null | undefined) => (u ?? '').trim().toLowerCase();
        const sameUnit = dupes.every(d => norm(d.unit) === norm(unit));
        if (sameUnit) {
          autoMergeDupes(dupes, name, editCategory, unit);
        } else {
          if (isMergeableDupe(dupes)) openMergeForDupes(dupes, updated);
        }
      }
    } catch (e) {
      // Rollback optimistic
      setList(prev => prev ? { ...prev, items: prev.items.map(i => i.id === snapshot.id ? snapshot : i) } : prev);
      showError(e, str.toasts.errorSave);
    } finally {
      setSaving(false);
    }
  }

  async function autoMergeDupes(
    dupes: ShoppingItemWithRecipe[],
    name: string,
    category: StoreCategory,
    unit: string | null,
  ) {
    const totalQty = dupes.reduce((sum, d) => sum + (d.quantity ?? 1), 0);
    const sourceIds = dupes.map(d => d.id);
    const hideIds = new Set(sourceIds);
    try {
      const container = await client.mergeShoppingItems({
        sourceIds, name, quantity: totalQty, unit, category,
      });
      setList(prev => prev ? {
        ...prev,
        items: [
          ...prev.items.filter(i => !hideIds.has(i.id) && i.id !== container.id),
          { ...container, recipe: null } as ShoppingItemWithRecipe,
        ],
      } : prev);
      showGlobalToast(str.toasts.merged(dupes.length, capitalize(name)), 'success', {
        label: common.actions.undo,
        onPress: async () => {
          try { await client.deleteShoppingItem(container.id); load(); }
          catch (e) { showError(e, str.toasts.errorUndo); }
        },
      });
    } catch {
      // Silent — user can still merge manually via dupe button
    }
  }

  async function deleteItem(itemId: string) {
    setList(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== itemId) } : prev);
    try {
      await client.deleteShoppingItem(itemId);
      emitShoppingChanged(); // keep menu's "I inköpslistan"-tag + filters in sync
    } catch (e) {
      showError(e, str.toasts.errorDeleteItem);
      load();
    }
  }

  function deleteItemWithUndo(item: ShoppingItemWithRecipe) {
    triggerDeleteHaptic();
    setList(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== item.id) } : prev);
    let cancelled = false;
    showGlobalToast(str.toasts.itemDeleted(capitalize(item.name)), 'neutral', {
      label: common.actions.undo,
      onPress: () => {
        cancelled = true;
        setList(prev => prev ? { ...prev, items: [...prev.items, item] } : prev);
      },
    });
    setTimeout(async () => {
      if (cancelled) return;
      try {
        await client.deleteShoppingItem(item.id);
        emitShoppingChanged();
      } catch (e) {
        setList(prev => prev ? { ...prev, items: [...prev.items, item] } : prev);
        showError(e, str.toasts.errorDeleteItem);
      }
    }, 5000);
  }

  // Baka ihop (för visning) klarmarkerade varor med samma namn + enhet till en
  // rad med summerad mängd, så det inte ligger t.ex. 4× "1 st gurka" under
  // varandra. Olika enheter bakas inte ihop.
  // ENDA stället som avgör om en grupp är en föreslagsbar dubblett. Fanns
  // tidigare i tre varianter — detektorn, lägg-till-flödet och redigera-flödet
  // — som gav olika svar, så arket kunde öppnas med rader som aggregerade till
  // EN och knappen "Slå ihop 1 rad" stod utgråad.
  function isMergeableDupe(items: ShoppingItemWithRecipe[]) {
    return items.length >= 2 && aggregateByNameUnit(items).length >= 2;
  }

  function aggregateByNameUnit(items: ShoppingItemWithRecipe[]) {
    const map = new Map<string, { rep: ShoppingItemWithRecipe; quantity: number; members: ShoppingItemWithRecipe[] }>();
    for (const it of items) {
      const key = `${it.name.toLowerCase().trim()}|${(it.unit ?? '').toLowerCase()}`;
      const g = map.get(key);
      if (g) { g.quantity += it.quantity ?? 1; g.members.push(it); }
      else map.set(key, { rep: it, quantity: it.quantity ?? 1, members: [it] });
    }
    return [...map.values()];
  }

  async function uncheckGroup(members: ShoppingItemWithRecipe[]) {
    const ids = members.map(m => m.id);
    setList(prev => prev ? { ...prev, items: prev.items.map(i => ids.includes(i.id) ? { ...i, isChecked: false } : i) } : prev);
    try {
      await Promise.all(ids.map(id => client.checkShoppingItem(id, false)));
    } catch (e) {
      setList(prev => prev ? { ...prev, items: prev.items.map(i => ids.includes(i.id) ? { ...i, isChecked: true } : i) } : prev);
      showError(e, str.toasts.errorCheck);
    }
  }

  // Spegling av uncheckGroup: klarmarkera alla medlemmar i en ihopbakad rad på
  // en gång, så en aggregerad "2 st bananer" i aktiva listan flyttas som en enhet
  // till klart-högen (och inte splittras till separata rader).
  async function checkGroup(members: ShoppingItemWithRecipe[]) {
    const ids = members.map(m => m.id);
    triggerCheckHaptic();
    setList(prev => prev ? { ...prev, items: prev.items.map(i => ids.includes(i.id) ? { ...i, isChecked: true } : i) } : prev);
    try {
      await Promise.all(ids.map(id => client.checkShoppingItem(id, true)));
    } catch (e) {
      setList(prev => prev ? { ...prev, items: prev.items.map(i => ids.includes(i.id) ? { ...i, isChecked: false } : i) } : prev);
      showError(e, str.toasts.errorCheck);
    }
  }

  function deleteGroupWithUndo(members: ShoppingItemWithRecipe[]) {
    triggerDeleteHaptic();
    const ids = members.map(m => m.id);
    setList(prev => prev ? { ...prev, items: prev.items.filter(i => !ids.includes(i.id)) } : prev);
    let cancelled = false;
    showGlobalToast(str.toasts.itemDeleted(capitalize(members[0].name)), 'neutral', {
      label: common.actions.undo,
      onPress: () => { cancelled = true; setList(prev => prev ? { ...prev, items: [...prev.items, ...members] } : prev); },
    });
    setTimeout(async () => {
      if (cancelled) return;
      try {
        await Promise.all(ids.map(id => client.deleteShoppingItem(id)));
        emitShoppingChanged();
      } catch (e) {
        setList(prev => prev ? { ...prev, items: [...prev.items, ...members] } : prev);
        showError(e, str.toasts.errorDeleteItem);
      }
    }, 5000);
  }

  async function completeList() {
    if (!listId) return;
    confirm({
      title: str.clearDialog.title,
      message: str.clearDialog.message,
      buttons: [
      { label: str.clearDialog.confirm, style: 'destructive', onPress: () => {
        // Optimistic clear with undo: hide items from UI, defer backend call 5s
        const snapshot = list?.items ?? [];
        setList(prev => prev ? { ...prev, items: [] } : prev);
        let cancelled = false;
        showGlobalToast(str.toasts.cleared, 'neutral', {
          label: common.actions.undo,
          onPress: () => {
            cancelled = true;
            setList(prev => prev ? { ...prev, items: snapshot } : prev);
          },
        });
        setTimeout(async () => {
          if (cancelled) return;
          try {
            await client.clearShoppingList(listId);
            emitShoppingChanged(); // refresh the lists overview's count
          } catch (e) {
            setList(prev => prev ? { ...prev, items: snapshot } : prev);
            showError(e, str.toasts.errorClear);
          }
        }, 5000);
      }},
      { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }

  async function deleteEntireList() {
    if (!listId || !list) return;
    confirm({
      title: str.deleteListDialog.title,
      message: `Ta bort "${list.name}"? Listan och alla varor försvinner.`,
      buttons: [
        { label: str.deleteListDialog.confirm, style: 'destructive', onPress: async () => {
          try {
            await client.deleteShoppingList(listId);
            emitShoppingChanged();
            if (onClose) onClose(); else router.back();
          } catch (e) {
            showError(e, str.toasts.errorDeleteList);
          }
        }},
        { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }

  function openStapleEditor(suggestion: StapleItem) {
    // Suggestion chips include both real staples (DB row, has cuid id) and ingredient
    // suggestions (synthetic id "suggestion:<name>", no DB row yet). For the latter we
    // open the editor in "create" mode — saving creates the staple.
    setEditingStaple(suggestion);
    setStapleName(suggestion.name);
    setStapleUnit(suggestion.unit ?? '');
    setStapleCategory(suggestion.category as StoreCategory);
  }

  async function saveStapleEdit() {
    if (!editingStaple || !householdId) return;
    const newName = stapleName.trim().toLowerCase();
    if (!newName) return;
    setSavingStaple(true);
    const original = editingStaple;
    const isNew = original.id.startsWith('suggestion:');
    const optimistic: StapleItem = { ...original, name: newName, unit: stapleUnit.trim() || null, category: stapleCategory };
    if (!isNew) {
      setStaples(prev => prev.map(s2 => s2.id === original.id ? optimistic : s2));
    }
    setEditingStaple(null);
    try {
      // Rename of existing staple: delete old, create new (upsert keyed on householdId+name).
      if (!isNew && newName !== original.name) {
        await client.deleteStaple(original.id);
      }
      const saved = await client.upsertStaple({
        householdId,
        name: newName,
        category: stapleCategory,
        unit: stapleUnit.trim() || null,
      });
      setStaples(prev => {
        const without = prev.filter(s2 => s2.id !== original.id && s2.id !== saved.id);
        return [...without, saved];
      });
      showGlobalToast(isNew ? str.toasts.stapleSaved(capitalize(newName)) : str.toasts.stapleUpdated(capitalize(newName)), 'success');
    } catch (e) {
      if (!isNew) setStaples(prev => prev.map(s2 => s2.id === original.id ? original : s2));
      showError(e, str.toasts.errorSaveStaple);
    } finally {
      setSavingStaple(false);
    }
  }

  async function deleteStaple() {
    if (!editingStaple || !householdId) return;
    const target = editingStaple;
    const name = target.name.toLowerCase();
    // Chippen blandar riktiga basvaror (DB-rad) och syntetiska ingrediens-
    // förslag (id "suggestion:<namn>", global alias/common-lista). "Ta bort
    // förslag" döljer namnet per hushåll så det aldrig dyker upp igen — och
    // raderar basvaran om det var en sådan (så den även försvinner ur basvarorna).
    // Global IngredientAlias rörs aldrig; ångra-toasten återställer allt.
    const isReal = !target.id.startsWith('suggestion:');
    setEditingStaple(null);
    setStaples(prev => prev.filter(s2 => s2.id !== target.id));
    setIngredientSuggestions(prev => prev.filter(s2 => s2.name.toLowerCase() !== name));
    try {
      await client.hideSuggestion(householdId, name);
      if (isReal) await client.deleteStaple(target.id);
      showGlobalToast(str.toasts.suggestionHidden(capitalize(target.name)), 'neutral', {
        label: common.actions.undo,
        onPress: async () => {
          try {
            await client.unhideSuggestion(householdId, name);
            if (isReal) await client.upsertStaple({ householdId, name, category: target.category, unit: target.unit ?? null });
            await load();
          } catch (e) {
            showError(e, str.toasts.errorHideSuggestion);
          }
        },
      });
    } catch (e) {
      if (isReal) setStaples(prev => [...prev, target]);
      setIngredientSuggestions(prev => prev.some(s2 => s2.name.toLowerCase() === name)
        ? prev : [...prev, { name: target.name, category: target.category as string }]);
      showError(e, str.toasts.errorHideSuggestion);
    }
  }

  async function selectStore(storeId: string | null) {
    if (!listId) return;
    try {
      const updated = await client.updateShoppingList(listId, { storeId });
      setList(updated);
    } catch (e) {
      showError(e, str.toasts.errorChangeStore);
    }
  }

  // Öppna /stores i pick-läge och vänta på resultat. Skickar nuvarande
  // butik som ?current=... så pickern kan markera den + visa rensa-X.
  async function openStorePicker() {
    const promise = pickStore();
    const currentParam = list?.storeId ? `&current=${list.storeId}` : '';
    router.push(`/stores?pick=1${currentParam}` as never);
    const result = await promise;
    if (result === 'cancelled') return;
    await selectStore(result);
  }

  // OBS: inga early returns här. Allt härlett nedan matar en useMemo, och en
  // hook efter en villkorad return kraschar med "Rendered more hooks than
  // during the previous render". Returnerna ligger i stället precis före JSX:en.
  // Items tied to a meal that's pending removal stay visible but rendered
  // in a pending state (faded + strikethrough) until backend commits in 5s.
  const isPending = (item: ShoppingItemWithRecipe) => !!item.menuItemId && pendingMenuItemRemovals.has(item.menuItemId);
  // Allt härlett i EN memo. Låg tidigare som fristående const:ar, vilket gav
  // nya array-identiteter varje render — då bommade listRows-memon nedanför
  // varje gång och FlatList renderade om alla monterade rader under scroll.
  const derived = useMemo(() => {
    const items = list?.items ?? [];
    const unchecked = items.filter(i => !i.isChecked);
    const checked = items.filter(i => i.isChecked);
    const customCategories: string[] = (list?.store?.customCategories as string[] | undefined) ?? [];
    const expandedSubs: string[] = (list?.store?.expandedSubs as string[] | undefined) ?? [];
    const customSubs: Record<string, string[]> = (list?.store?.customSubs as Record<string, string[]> | undefined) ?? {};
    const parentOrder: string[] = (list?.store?.parentOrder as string[] | undefined) ?? [];
    const categoryMerge: Record<string, string> = (list?.store?.categoryMerge as Record<string, string> | undefined) ?? {};
    return {
      unchecked,
      checked,
      allItems: [...unchecked, ...checked],
      customCategories, expandedSubs, customSubs, parentOrder, categoryMerge,
      categoryGroups: buildCategoryGroups(unchecked, categoryOrder, customCategories, expandedSubs, customSubs, parentOrder, categoryMerge),
    };
  }, [list, categoryOrder]);
  const { unchecked, checked, allItems, customCategories, expandedSubs, customSubs, parentOrder, categoryMerge, categoryGroups } = derived;
  const groupLabel = (group: CategoryGroup<ShoppingItemWithRecipe>) => {
    if (group.isSub && group.isCustom) {
      const pk = group.parentKey ?? '';
      const emoji = pk.startsWith('c:') ? '🏷️' : (CATEGORY_EMOJIS[pk as StoreCategory] ?? '🏷️');
      return `${emoji} ${group.label ?? String(group.category)}`;
    }
    if (group.isCustom) return `🏷️ ${group.category}`;
    if (group.isSub) return `${CATEGORY_EMOJIS[SUB_TAXONOMY[group.category as SubCategory].defaultParent]} ${group.label ?? String(group.category)}`;
    return `${CATEGORY_EMOJIS[group.category as StoreCategory]} ${CATEGORY_LABELS[group.category as StoreCategory]}`;
  };
  const groupKey = (group: CategoryGroup<ShoppingItemWithRecipe>) =>
    group.isSub && group.isCustom ? `cs:${group.parentKey}:${group.category}`
      : group.isCustom ? `c:${group.category}`
      : group.isSub ? `s:${group.category}`
      : group.category as string;
  // Ordnad lista (= visuell ordning = stigande y) som sticky-beräkningen läser.
  // "Klart"-sektionen ligger sist (efter de obockade grupperna) och ska också
  // haka i toppen när man scrollar in på den.
  // Hela listan platt-packad till EN array som FlatList kan virtualisera.
  // Rubriker, varurader, klart-högens underrubriker och "visa fler" är alla
  // rader av olika sort. Logiken ligger i src/lib/shoppingListRows och är
  // enhetstestad — ordning, hopfällning och tak är där felen gömmer sig.
  // Memoiserad: utan stabil identitet renderar FlatList om alla monterade rader
  // vid varje förälder-render, och föräldern renderar om under scroll.
  const listRows = useMemo<ListRow[]>(() => buildShoppingListRows({
    activeGroups: categoryGroups,
    checked,
    checkedGroupsFor: items => buildCategoryGroups(items, categoryOrder, customCategories, expandedSubs, customSubs, parentOrder, categoryMerge),
    groupItems: g => g.items,
    groupKey,
    groupLabel,
    aggregate: aggregateByNameUnit,
    itemId: i => i.id,
    withQuantity: (rep, quantity) => ({ ...rep, quantity }),
    isCollapsed: key => collapsedCategories.has(key as StoreCategory | 'checked'),
    checkedLabel: str.checkedLabel,
    checkedLimit,
  }), [categoryGroups, collapsedCategories, checked, checkedLimit, categoryOrder, customCategories, expandedSubs, customSubs, parentOrder, categoryMerge]);

  // Stabila dispatchers till varuraderna. Handlarna nedan är vanliga funktioner
  // som får ny identitet varje render; en ref håller dem färska medan de
  // utåtvända funktionerna aldrig byter identitet. Utan det kan ItemRow inte
  // memoiseras meningsfullt — nya props varje render slår ut varje jämförelse.
  const rowFnsRef = useRef({ isPending, toggleItem, uncheckGroup, checkGroup, openEditItem, deleteItemWithUndo, deleteGroupWithUndo });
  rowFnsRef.current = { isPending, toggleItem, uncheckGroup, checkGroup, openEditItem, deleteItemWithUndo, deleteGroupWithUndo };
  const rowHandlers = useMemo(() => ({
    toggle: (row: RowListRow) => {
      const fns = rowFnsRef.current;
      if (row.members.length === 1) fns.toggleItem(row.item);
      else if (row.done) fns.uncheckGroup(row.members);
      else fns.checkGroup(row.members);
    },
    // aggregateByNameUnit sätter rep = members[0], så en ihopslagen rad
    // redigeras via sin första medlem.
    edit: (row: RowListRow) => rowFnsRef.current.openEditItem(row.members.length === 1 ? row.item : row.members[0]),
    remove: (row: RowListRow) => {
      const fns = rowFnsRef.current;
      if (row.members.length === 1) fns.deleteItemWithUndo(row.item);
      else fns.deleteGroupWithUndo(row.members);
    },
  }), []);

  const renderListRow = useCallback(({ item: row }: { item: ListRow }) => {
    switch (row.kind) {
      case 'catHeader': {
        const group = row.group;
        return (
          <Pressable
            style={[s.categoryHeader, group.isSub && s.categorySubHeader]}
            onPress={() => toggleCategoryCollapsed(groupKey(group) as StoreCategory | 'checked')}
            hitSlop={4}
          >
            <Text style={[s.categoryLabel, group.isSub && s.categorySubLabel]} numberOfLines={2}>
              {row.label}{row.collapsed ? ` (${group.items.length})` : ''}
            </Text>
            {group.items.some(i => !i.isChecked) && (
              <Pressable
                onPress={e => {
                  e.stopPropagation();
                  const n = group.items.filter(i => !i.isChecked).length;
                  confirm({
                    title: str.categoryDialog.title,
                    message: `${n} vara${n === 1 ? '' : 'r'} markeras som klar${n === 1 ? '' : 'a'}.`,
                    buttons: [
                      { label: str.categoryDialog.confirm, onPress: () => void markAllInCategory(group.items) },
                      { label: common.actions.cancel, style: 'cancel' },
                    ],
                  });
                }}
                hitSlop={8}
                accessibilityLabel={str.a11y.checkAllDone}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color={c.success} />
              </Pressable>
            )}
            <Ionicons name={row.collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={c.textFaint} />
          </Pressable>
        );
      }
      case 'checkedHeader':
        return (
          <Pressable style={s.categoryHeader} onPress={() => toggleCategoryCollapsed('checked')} hitSlop={4}>
            <Text style={[s.categoryLabel, { color: c.textFaint }]}>
              {str.checkedLabel}{row.collapsed ? ` (${row.count})` : ''}
            </Text>
            <Ionicons name={row.collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={c.border} />
          </Pressable>
        );
      case 'checkedSubLabel':
        return <Text style={s.checkedCatLabel} numberOfLines={1}>{row.label}</Text>;
      case 'showMore':
        return (
          <Pressable style={s.showAllChecked} onPress={() => setCheckedLimit(n => n + CHECKED_RENDER_CAP)}>
            <Text style={s.showAllCheckedText}>{str.showAllChecked(Math.min(row.remaining, CHECKED_RENDER_CAP))}</Text>
          </Pressable>
        );
      case 'row':
        // Raden får rad-OBJEKTET och stabila dispatchers, inte färska closures.
        // Med closures per rad blev varje ItemRow-prop ny vid varje render, och
        // då hjälper ingen memoisering — raden renderades om ändå.
        return (
          <ItemRow
            row={row}
            pending={row.members.length === 1 ? isPending(row.item) : undefined}
            onToggle={rowHandlers.toggle}
            onEdit={rowHandlers.edit}
            onDelete={rowHandlers.remove}
          />
        );
    }
  }, [confirm, markAllInCategory, toggleCategoryCollapsed, isPending, toggleItem, uncheckGroup, checkGroup, openEditItem, deleteItemWithUndo, deleteGroupWithUndo, s, c]);

  // Early returns FÖRST här, efter alla hooks — inte uppe bland de härledda
  // värdena, där de gjorde listRows-memon villkorad och kraschade skärmen.
  // MÅSTE vara ett objekt, inte en array. ScrollView (som listan använde före
  // FlashList) flatar arrayer själv på webben; FlashList v2 skickar stilen vidare
  // som den är, och react-native-web försöker då sätta style[0] på DOM-noden:
  //   "Failed to set an indexed property [0] on CSSStyleDeclaration"
  // — vilket kraschade hela inköpslistan i PWA:n. Native påverkades inte.
  const listContentStyle = useMemo(
    () => StyleSheet.flatten([
      s.list,
      allItems.length === 0 && s.listEmpty,
      { paddingTop: HEADER_TOP + NAVBAR_HEIGHT + TITLE_AREA_HEIGHT + 8 },
    ]),
    [s, allItems.length],
  );

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>;
  if (!list) return null;

  return (
    <View style={s.container}>
      <Lista
        style={{ flex: 1 }}
        data={listRows}
        keyExtractor={(r: ListRow) => r.key}
        renderItem={renderListRow}
        contentContainerStyle={listContentStyle}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        keyboardShouldPersistTaps="handled"
        // FlashList v2 mäter rader själv — ingen estimatedItemSize behövs, och
        // FlatLists windowSize/batch-rattar finns inte. drawDistance styr hur
        // långt utanför vyn den förbereder.
        {...(ÄR_WEBB ? {} : { drawDistance: 250 })}
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Pressable onPress={goToBulkTransfer} style={s.emptyImportBtn} hitSlop={12}>
              <Ionicons name="add-circle" size={64} color={c.primary} />
            </Pressable>
            <Text style={s.emptyText}>{str.emptyState.title}</Text>
            <Text style={s.emptySubtext}>{str.emptyState.subtitle}</Text>
          </View>
        }
      />

      {/* Navbar background — pinned (incl. safe area top) */}
      <View style={[s.navbarBgAbs, { height: HEADER_TOP + NAVBAR_HEIGHT }]} pointerEvents="none" />

      {/* Title-area background — slides up so it visually scrolls away too */}
      <RNAnimated.View
        style={[s.titleAreaAbs, { top: HEADER_TOP + NAVBAR_HEIGHT, height: TITLE_AREA_HEIGHT }, titleAreaAnimStyle]}
        pointerEvents="none"
      />

      {/* Title text — absolutely positioned over the title-area, slides with it.
          Inner wrap uses alignSelf:flex-start so the text View shrinks to its
          natural width (needed for onLayout to give us the actual text width). */}
      <RNAnimated.View
        style={[s.titleTextWrap, { top: HEADER_TOP + NAVBAR_HEIGHT, height: TITLE_AREA_HEIGHT }, titleAreaAnimStyle]}
        pointerEvents="none"
      >
        <RNAnimated.View style={[{ alignSelf: 'flex-start' }, titleTextAnimStyle]}>
          <Text
            style={s.title}
            numberOfLines={1}
            onLayout={e => setTitleWidth(e.nativeEvent.layout.width)}
          >
            {list.name}
          </Text>
        </RNAnimated.View>
      </RNAnimated.View>

      {/* Sticky kategori-rubrik — pinnad precis under navbaren, visar kategorin
          vars rad just nu passerar navbar-linjen (uppdateras från scroll). */}
      {stickyCat && (
        <View style={[s.stickyCat, { top: HEADER_TOP + NAVBAR_HEIGHT }]} pointerEvents="none">
          <Text style={s.categoryLabel} numberOfLines={1}>{stickyCat}</Text>
        </View>
      )}

      {/* Progress bar — pinned under the navbar so it's always visible */}
      {checked.length > 0 && unchecked.length > 0 && (
        <View style={[s.progressBar, { position: 'absolute', top: HEADER_TOP + NAVBAR_HEIGHT, left: 0, right: 0, zIndex: 35 }]}>
          <View style={[s.progressFill, { width: `${(checked.length / allItems.length) * 100}%` as `${number}%` }]} />
        </View>
      )}

      {/* Navbar buttons — rendered last so they always sit on top. "Jag handlar"-
          presence: full text till höger innan scroll, kollapsar till bara den
          rosa gubbe-ikonen när rubriken fälls upp till mitten (annars krockar
          de). Ikonen pulserar var ~10:e sekund. Tryck → toast med vem som handlar. */}
      <View style={[s.navbarButtonsAbs, { top: HEADER_TOP, height: NAVBAR_HEIGHT }]}>
        <Pressable onPress={goBack} style={s.backBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={str.a11y.back}>
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </Pressable>
        <Pressable onPress={openStorePicker} hitSlop={8} style={s.navStoreBtn} accessibilityRole="button" accessibilityLabel={list.store ? str.a11y.store(list.store.name) : str.a11y.chooseStore}>
          <Ionicons name="storefront" size={18} color={c.primary} />
          <RNAnimated.View style={[s.navStoreNameWrap, storeNameAnimStyle]}>
            <Text style={s.navStoreName} numberOfLines={1}>{list.store?.name ?? str.a11y.chooseStore}</Text>
          </RNAnimated.View>
        </Pressable>
        <View style={{ flex: 1 }} />
        {list.activeShopperMemberId && activeShopper && (
          <Pressable
            style={s.shopperWrap}
            hitSlop={8}
            onPress={() => {
              if (iAmShopping) {
                confirm({
                  title: str.shopDialog.title,
                  message: str.shopDialog.message,
                  buttons: [
                    { label: str.shopDialog.confirm, style: 'destructive', onPress: () => { toggleIAmShopping(); } },
                    { label: common.actions.cancel, style: 'cancel' },
                  ],
                });
              } else {
                showGlobalToast(str.a11y.otherShopping(activeShopper.displayName));
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={iAmShopping ? str.a11y.iAmShopping : str.a11y.otherShopping(activeShopper.displayName)}
          >
            <RNAnimated.View style={[s.shopperTextWrap, shopperTextAnimStyle]}>
              <Text style={s.shopperText} numberOfLines={1}>
                {iAmShopping ? str.shopper.you : str.shopper.other(activeShopper.displayName)}
              </Text>
            </RNAnimated.View>
            <RNAnimated.View style={[s.shopperIconBtn, shopperIconAnimStyle]}>
              <Ionicons name="walk" size={20} color={c.pink} />
            </RNAnimated.View>
          </Pressable>
        )}
        <Pressable onPress={() => setShowActionsMenu(true)} style={s.doneBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={str.a11y.moreActions}>
          <Ionicons name="ellipsis-vertical" size={20} color={c.text} />
        </Pressable>
      </View>

      {/* Autocomplete chips + add bar.
          Android Chrome PWA: browser resizes viewport → bar floats up naturally.
          KAV would double-push (bar "jumps"). Disable on non-iOS web.
          iOS Safari PWA: viewport doesn't resize → KAV needed to clear keyboard. */}
      {/* Native (iOS OCH Android): lyft med reanimated-tangentbordshöjd (WindowInsets,
          funkar under SDK 54 edge-to-edge där OS:et varken resizar eller pannar och
          RN:s keyboardDidShow-höjd är 0 på Android). RNAnimated.View lägger
          paddingBottom = keyboardhöjd så baren dockar ovanför tangentbordet.
          Web: iOS Safari behöver KAV-push; Android Chrome resizar viewporten själv. */}
      {/* Svävar över listan strax ovanför lägg-till-baren, i stället för i den
          scroll-animerade headern. Där följde den med rubriken upp och tonades
          bort vid scroll — knappen försvann alltså när man scrollat ned, och
          onboarding-spotlighten ringade in tom yta eftersom den mäter refens
          position. Höjden på baren mäts (den varierar med förslags-chipsen och
          tangentbordslyftet) så knappen alltid hamnar precis ovanför den. */}
      {duplicateGroups.length > 0 && addBarH > 0 && !keyboardVisible && (
        <View style={[s.dupeFloatWrap, { bottom: addBarH + 12 }]} pointerEvents="box-none">
          <Animated.View ref={dupeBadgeRef} collapsable={false} style={{ transform: [{ scale: dupeButtonScale }] }}>
            <Pressable style={s.dupeFloatBtn} onPress={() => openMergeForDupes(duplicateGroups[0])} hitSlop={8}>
              <Ionicons name="git-merge-outline" size={14} color="#fff" />
              <Text style={s.dupeFloatText}>
                {duplicateGroups.length === 1 ? str.merge.floatOne : str.merge.floatMany(duplicateGroups.length)}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      )}

      <RNAnimated.View style={addBarLift}>
      {/* Mätningen sitter INNANFÖR lyftet: addBarLift:s paddingBottom kommer
          från ett reanimated-värde som animeras varje frame när tangentbordet
          öppnas, så en onLayout där uppe sköt en setState per frame och fick
          hela skärmen att hoppa. Här ändras höjden bara när förslags-chipsen
          dyker upp eller försvinner — och bara då skrivs state. */}
      <KeyboardAvoidingView
        onLayout={e => {
          const h = e.nativeEvent.layout.height;
          setAddBarH(prev => (Math.abs(prev - h) > 1 ? h : prev));
        }}
        behavior="padding"
        keyboardVerticalOffset={isIOSLike ? 90 : 0}
        enabled={keyboardVisible && isWeb() && isIOSLike}
      >
        {suggestions.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={s.chipScroll}
            contentContainerStyle={s.chipRow}
          >
            {suggestions.map(s2 => (
              <TouchableOpacity
                key={s2.id}
                style={s.chip}
                onPress={() => openQtySheet(s2.name, s2.category as StoreCategory)}
                onLongPress={() => openStapleEditor(s2)}
                delayLongPress={350}
              >
                <Text style={s.chipText}>{capitalize(s2.name)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : keyboardVisible && newItem.trim().length === 0 && topStaples.length > 0 ? (
          <View style={s.commonScroll}>
            <Text style={s.chipHint}>{str.staplesHeading}</Text>
            <View style={s.chipRowWrap}>
              {topStaples.map(s2 => (
                <TouchableOpacity
                  key={s2.id}
                  style={s.chip}
                  onPress={() => openQtySheet(s2.name, s2.category as StoreCategory)}
                  onLongPress={() => openStapleEditor(s2)}
                  delayLongPress={350}
                >
                  <Text style={s.chipText}>{capitalize(s2.name)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
        <View style={[s.addBar, { paddingBottom: keyboardVisible && !isWeb() ? 20 : Math.max(12, insets.bottom) }]}>
          <Pressable style={s.browseBtn} onPress={() => { setBrowserCategory(null); setShowBrowser(true); }}>
            <Ionicons name="grid-outline" size={22} color={c.primary} />
          </Pressable>
          <ClearableInput
            ref={inputRef}
            containerStyle={{ flex: 1 }}
            style={s.addInput}
            placeholder={str.placeholders.addItem}
            value={newItem}
            onChangeText={setNewItem}
            returnKeyType="done"
            onSubmitEditing={() => { const n = newItem.trim(); if (!n) return; setNewItem(''); openQtySheet(n); }}
            blurOnSubmit={false}
            autoCapitalize="none"
          />
          <Pressable
            style={[s.addBtn, (!newItem.trim() || adding) && s.addBtnDisabled]}
            onPress={() => { const n = newItem.trim(); if (!n) return; setNewItem(''); openQtySheet(n); }}
            disabled={adding || !newItem.trim()}
          >
            {adding ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add" size={22} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      </RNAnimated.View>

      {/* Butik-väljaren ligger nu på /stores-routen (full-screen) — caller:n
          använder pickStore()-helpern och navigerar dit i ?pick=1-läge. */}

      {/* Category browser modal */}
      <DraggableBottomSheet visible={showBrowser} onRequestClose={() => setShowBrowser(false)} sheetStyle={[s.sheet, s.browserSheet]}>
          {browserCategory === null ? (
            <>
              <Text style={s.sheetTitle}>{str.browserTitle}</Text>
              <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={[s.categoryGrid, { paddingBottom: 24 }]}>
                {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => (
                  <Pressable key={cat} style={s.categoryTile} onPress={() => setBrowserCategory(cat)}>
                    <Text style={s.categoryTileEmoji}>{CATEGORY_EMOJIS[cat]}</Text>
                    <Text style={s.categoryTileLabel}>{CATEGORY_LABELS[cat]}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={s.browserHeader}>
                <Pressable style={s.browserBack} onPress={() => setBrowserCategory(null)}>
                  <Ionicons name="chevron-back" size={20} color={c.primary} />
                  <Text style={s.browserBackText}>{common.actions.back}</Text>
                </Pressable>
                <Text style={s.browserTitle}>{CATEGORY_EMOJIS[browserCategory]} {CATEGORY_LABELS[browserCategory]}</Text>
              </View>
              <ScrollView style={s.browserList}>
                {searchList
                  .filter(s2 => s2.category === browserCategory)
                  // Mest använda överst, alfabetiskt som andrahandssortering.
                  .sort((a, b) => ((b.usageCount ?? 0) - (a.usageCount ?? 0)) || a.name.localeCompare(b.name, 'sv'))
                  .map(s2 => (
                    <Pressable
                      key={s2.name}
                      style={s.browserItem}
                      onPress={() => { setShowBrowser(false); openQtySheet(s2.name, browserCategory ?? undefined); }}
                    >
                      <Text style={s.browserItemText}>{capitalize(s2.name)}</Text>
                      <Ionicons name="add-circle-outline" size={20} color={c.primary} />
                    </Pressable>
                  ))
                }
              </ScrollView>
            </>
          )}
      </DraggableBottomSheet>

      {/* Item edit modal */}
      <DraggableBottomSheet
        visible={!!editingItem}
        onRequestClose={() => setEditingItem(null)}
        liftOffset={sheetLift}
        sheetStyle={[s.sheet, { maxHeight: windowHeight * 0.85, paddingBottom: insets.bottom + 20 }]}
      >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <ConflictBanner message={editConflict?.msg ?? null} onShowLatest={editConflict?.latest ? applyLatestEdit : undefined} />
          <Text style={s.editLabel}>{common.fields.name}</Text>
          <TextInput
            ref={editNameRef}
            style={s.editInput}
            value={editName}
            onChangeText={setEditName}
            placeholder={str.placeholders.itemName}
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            returnKeyType="next"
            onFocus={onFocusInput(editNameRef)}
            onSubmitEditing={() => editQtyRef.current?.focus()}
          />
          <View style={s.qtyStepper}>
            <Pressable
              style={s.qtyBtn}
              onPress={() => setEditQty(v => String(Math.max(0.5, (parseFloat(v.replace(',', '.')) || 1) - 1)).replace('.', ','))}
            >
              <Ionicons name="remove" size={22} color={c.primary} />
            </Pressable>
            <TextInput
              ref={editQtyRef}
              style={s.qtyInput}
              value={editQty}
              onChangeText={t => setEditQty(normalizeQtyInput(t))}
              keyboardType="decimal-pad"
              placeholder={str.placeholders.qty}
              placeholderTextColor={c.textFaint}
              selectTextOnFocus
              returnKeyType="next"
              blurOnSubmit={false}
              onFocus={onFocusInput(editQtyRef, 80)}
              onSubmitEditing={() => editUnitRef.current?.focus()}
            />
            <Pressable
              style={s.qtyBtn}
              onPress={() => setEditQty(v => String((parseFloat(v.replace(',', '.')) || 0) + 1).replace('.', ','))}
            >
              <Ionicons name="add" size={22} color={c.primary} />
            </Pressable>
            <TextInput
              ref={editUnitRef}
              style={s.qtyUnitInput}
              value={editUnit}
              onChangeText={v => setEditUnit(v.toLowerCase())}
              placeholder={str.placeholders.unit}
              placeholderTextColor={c.textFaint}
              autoCapitalize="none"
              onFocus={onFocusInput(editUnitRef, 80)}
              returnKeyType="done"
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.unitChipScroll}>
            <View style={s.unitChipRow}>
              {['st', 'dl', 'ml', 'l', 'g', 'kg', 'msk', 'tsk', 'krm', 'paket', 'påse', 'burk', 'flaska'].map(u => (
                <Pressable key={u} style={[s.unitChip, editUnit === u && s.unitChipActive]} onPress={() => setEditUnit(v => v === u ? '' : u)}>
                  <Text style={[s.unitChipText, editUnit === u && s.unitChipTextActive]}>{u}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <Text style={s.editLabel}>{common.fields.category}</Text>
          <ScrollView ref={editCatScrollRef} horizontal showsHorizontalScrollIndicator={false} style={s.catChipScroll}>
            <View style={s.catChipRow}>
              {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => {
                const active = !editCustomCategory && editCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    style={[s.catChip, active && s.catChipActive]}
                    onLayout={e => recordEditCatChipLayout(cat, e.nativeEvent.layout.x)}
                    onPress={() => { setEditCategory(cat); setEditCustomCategory(null); setEditSubCategory(null); setEditCustomSubCategory(null); }}
                  >
                    <Text style={[s.catChipText, active && s.catChipTextActive]} numberOfLines={1}>
                      {CATEGORY_EMOJIS[cat]} {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                );
              })}
              {/* Hushållets egna parent-kategorier (lokala). */}
              {customCategories.map(cat => {
                const active = editCustomCategory === cat;
                return (
                  <Pressable
                    key={`c:${cat}`}
                    style={[s.catChip, active && s.catChipActive]}
                    onLayout={e => recordEditCatChipLayout(`c:${cat}`, e.nativeEvent.layout.x)}
                    onPress={() => { setEditCustomCategory(cat); setEditSubCategory(null); setEditCustomSubCategory(null); }}
                  >
                    <Text style={[s.catChipText, active && s.catChipTextActive]} numberOfLines={1}>🏷️ {cat}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          {/* Underkategori (valfritt) — filtrerar mot subs vars defaultParent
              matchar valt parent. Användaren kan när som helst byta parent
              ovan och då uppdateras sub-listan. */}
          <Text style={s.editLabel}>{common.fields.subCategoryOptional}</Text>
          <ScrollView
            ref={editSubScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.catChipScroll}
            contentContainerStyle={{ paddingRight: 12 }}
          >
            <View style={s.catChipRow}>
              <Pressable
                style={[s.catChip, !editSubCategory && !editCustomSubCategory && s.catChipActive]}
                onLayout={e => recordEditSubChipLayout('__none__', e.nativeEvent.layout.x)}
                onPress={() => { setEditSubCategory(null); setEditCustomSubCategory(null); }}
              >
                <Text style={[s.catChipText, !editSubCategory && !editCustomSubCategory && s.catChipTextActive]}>
                  Ingen
                </Text>
              </Pressable>
              {/* Standard-subs (bara för standard-parents) */}
              {!editCustomCategory && subsForParent(editCategory).map(sub => {
                const active = editSubCategory === sub && !editCustomSubCategory;
                return (
                  <Pressable
                    key={sub}
                    style={[s.catChip, active && s.catChipActive]}
                    onLayout={e => recordEditSubChipLayout(sub, e.nativeEvent.layout.x)}
                    onPress={() => { setEditSubCategory(active ? null : sub); setEditCustomSubCategory(null); }}
                  >
                    <Text style={[s.catChipText, active && s.catChipTextActive]}>
                      {SUB_TAXONOMY[sub].label}
                    </Text>
                  </Pressable>
                );
              })}
              {/* Hushållets egna underkategorier under vald parent (lokala) */}
              {(customSubs[editCustomCategory ? `c:${editCustomCategory}` : editCategory] ?? []).map(label => {
                const active = editCustomSubCategory === label;
                return (
                  <Pressable
                    key={`cs:${label}`}
                    style={[s.catChip, active && s.catChipActive]}
                    onLayout={e => recordEditSubChipLayout(`cs:${label}`, e.nativeEvent.layout.x)}
                    onPress={() => { setEditCustomSubCategory(active ? null : label); setEditSubCategory(null); }}
                  >
                    <Text style={[s.catChipText, active && s.catChipTextActive]}>🏷️ {label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          </ScrollView>
          <View style={s.editActions}>
            <Pressable style={s.deleteBtn} onPress={() => { setEditingItem(null); if (editingItem) deleteItem(editingItem.id); }}>
              <Ionicons name="trash-outline" size={18} color={c.danger} />
              <Text style={s.deleteBtnText}>{common.actions.delete}</Text>
            </Pressable>
            <Pressable style={[s.saveBtn, saving && s.saveBtnDisabled, { flex: 1, marginTop: 0 }]} onPress={saveEditItem} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>{common.actions.save}</Text>}
            </Pressable>
          </View>
      </DraggableBottomSheet>

      {/* Staple edit modal (from long-press on suggestion chip) */}
      <DraggableBottomSheet
        visible={!!editingStaple}
        onRequestClose={() => setEditingStaple(null)}
        liftOffset={sheetLift}
        sheetStyle={[s.sheet, { maxHeight: windowHeight * 0.75, paddingBottom: insets.bottom + 20 }]}
      >
          <Text style={s.sheetTitle}>
            {editingStaple?.id.startsWith('suggestion:') ? str.stapleEditor.saveTitle : str.stapleEditor.editTitle}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={s.editLabel}>{common.fields.name}</Text>
          <TextInput
            ref={stapleNameRef}
            style={s.editInput}
            value={stapleName}
            onChangeText={setStapleName}
            placeholder={str.placeholders.itemName}
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            returnKeyType="done"
            onFocus={onFocusInput(stapleNameRef)}
          />
          <Text style={s.editLabel}>{common.fields.unitOptional}</Text>
          <TextInput
            ref={stapleUnitRef}
            style={s.editInput}
            value={stapleUnit}
            onChangeText={v => setStapleUnit(v.toLowerCase())}
            placeholder={str.unitPlaceholder}
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            returnKeyType="done"
            onFocus={onFocusInput(stapleUnitRef, 80)}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.unitChipScroll} keyboardShouldPersistTaps="handled">
            <View style={s.unitChipRow}>
              {['st', 'dl', 'ml', 'l', 'g', 'kg', 'msk', 'tsk', 'krm', 'paket', 'påse', 'burk', 'flaska'].map(u => (
                <Pressable key={u} style={[s.unitChip, stapleUnit === u && s.unitChipActive]} onPress={() => setStapleUnit(v => v === u ? '' : u)}>
                  <Text style={[s.unitChipText, stapleUnit === u && s.unitChipTextActive]}>{u}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <Text style={s.editLabel}>{common.fields.category}</Text>
          <ScrollView ref={stapleCatScrollRef} horizontal showsHorizontalScrollIndicator={false} style={s.catChipScroll} keyboardShouldPersistTaps="handled">
            <View style={s.catChipRow}>
              {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => (
                <Pressable
                  key={cat}
                  style={[s.catChip, stapleCategory === cat && s.catChipActive]}
                  onLayout={e => recordStapleCatChipLayout(cat, e.nativeEvent.layout.x)}
                  onPress={() => setStapleCategory(cat)}
                >
                  <Text style={[s.catChipText, stapleCategory === cat && s.catChipTextActive]} numberOfLines={1}>
                    {CATEGORY_EMOJIS[cat]} {CATEGORY_LABELS[cat]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          </ScrollView>
          <View style={s.editActions}>
            <Pressable style={s.deleteBtn} onPress={deleteStaple}>
              <Ionicons name="trash-outline" size={18} color={c.danger} />
              <Text style={s.deleteBtnText}>{str.stapleEditor.removeSuggestion}</Text>
            </Pressable>
            <Pressable
              style={[s.saveBtn, (savingStaple || !stapleName.trim()) && s.saveBtnDisabled, { flex: 1, marginTop: 0 }]}
              onPress={saveStapleEdit}
              disabled={savingStaple || !stapleName.trim()}
            >
              {savingStaple ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>{common.actions.save}</Text>}
            </Pressable>
          </View>
      </DraggableBottomSheet>

      {/* Tidigare in-list category-order editor + custom-kategorier är borttagen.
          All butiks-konfig sker på /stores/[storeId]-routen istället. */}
      {/* Quantity sheet */}
      <DraggableBottomSheet
        visible={!!qtySheet}
        onRequestClose={() => setQtySheet(null)}
        liftOffset={sheetLift}
        sheetStyle={[s.sheet, { maxHeight: windowHeight * 0.85, paddingBottom: insets.bottom + 20 }]}
      >
            <Text style={s.sheetTitle}>{capitalize(qtySheet?.name)}</Text>
            <View style={s.qtyStepper}>
              <Pressable
                style={s.qtyBtn}
                onPress={() => setQtyValue(v => String(Math.max(0.5, (parseFloat(v.replace(',', '.')) || 1) - 1)).replace('.', ','))}
              >
                <Ionicons name="remove" size={22} color={c.primary} />
              </Pressable>
              <TextInput
                ref={qtyValueRef}
                style={s.qtyInput}
                value={qtyValue}
                onChangeText={t => setQtyValue(normalizeQtyInput(t))}
                keyboardType="decimal-pad"
                selectTextOnFocus
                returnKeyType="next"
                blurOnSubmit={false}
                onFocus={onFocusInput(qtyValueRef, 80)}
                onSubmitEditing={() => qtyUnitRef.current?.focus()}
              />
              <Pressable
                style={s.qtyBtn}
                onPress={() => setQtyValue(v => String((parseFloat(v.replace(',', '.')) || 0) + 1).replace('.', ','))}
              >
                <Ionicons name="add" size={22} color={c.primary} />
              </Pressable>
              <TextInput
                ref={qtyUnitRef}
                style={s.qtyUnitInput}
                value={qtyUnit}
                onChangeText={v => setQtyUnit(v.toLowerCase())}
                placeholder={str.placeholders.unit}
                placeholderTextColor={c.textFaint}
                autoCapitalize="none"
                returnKeyType="done"
                onFocus={onFocusInput(qtyUnitRef, 80)}
                onSubmitEditing={confirmQtySheet}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.unitChipScroll}>
              <View style={s.unitChipRow}>
                {['st', 'dl', 'ml', 'l', 'g', 'kg', 'msk', 'tsk', 'krm', 'paket', 'påse', 'burk', 'flaska'].map(u => (
                  <Pressable key={u} style={[s.unitChip, qtyUnit === u && s.unitChipActive]} onPress={() => setQtyUnit(v => v === u ? '' : u)}>
                    <Text style={[s.unitChipText, qtyUnit === u && s.unitChipTextActive]}>{u}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Text style={s.editLabel}>{common.fields.category}</Text>
            <ScrollView ref={qtyCatScrollRef} horizontal showsHorizontalScrollIndicator={false} style={s.catChipScroll}>
              <View style={s.catChipRow}>
                {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => {
                  const active = !qtyCustomCategory && qtyCategory === cat;
                  return (
                  <Pressable
                    key={cat}
                    style={[s.catChip, active && s.catChipActive]}
                    onLayout={e => recordQtyCatChipLayout(cat, e.nativeEvent.layout.x)}
                    onPress={() => { setQtyCategory(cat); setQtyCustomCategory(null); setQtySubCategory(null); setQtyCustomSubCategory(null); }}
                  >
                    <Text style={[s.catChipText, active && s.catChipTextActive]} numberOfLines={1}>
                      {CATEGORY_EMOJIS[cat]} {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                  );
                })}
                {customCategories.map(cat => {
                  const active = qtyCustomCategory === cat;
                  return (
                    <Pressable key={`c:${cat}`} style={[s.catChip, active && s.catChipActive]} onLayout={e => recordQtyCatChipLayout(`c:${cat}`, e.nativeEvent.layout.x)} onPress={() => { setQtyCustomCategory(cat); setQtySubCategory(null); setQtyCustomSubCategory(null); }}>
                      <Text style={[s.catChipText, active && s.catChipTextActive]} numberOfLines={1}>🏷️ {cat}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            {((!qtyCustomCategory && subsForParent(qtyCategory).length > 0) || (customSubs[qtyCustomCategory ? `c:${qtyCustomCategory}` : qtyCategory] ?? []).length > 0) && (
              <>
                <Text style={s.editLabel}>{common.fields.subCategoryOptional}</Text>
                <ScrollView ref={qtySubScrollRef} horizontal showsHorizontalScrollIndicator={false} style={s.catChipScroll}>
                  <View style={s.catChipRow}>
                    <Pressable style={[s.catChip, !qtySubCategory && !qtyCustomSubCategory && s.catChipActive]} onLayout={e => recordQtySubChipLayout('__none__', e.nativeEvent.layout.x)} onPress={() => { setQtySubCategory(null); setQtyCustomSubCategory(null); }}>
                      <Text style={[s.catChipText, !qtySubCategory && !qtyCustomSubCategory && s.catChipTextActive]}>{common.fields.none}</Text>
                    </Pressable>
                    {!qtyCustomCategory && subsForParent(qtyCategory).map(sub => {
                      const active = qtySubCategory === sub && !qtyCustomSubCategory;
                      return (
                        <Pressable key={sub} style={[s.catChip, active && s.catChipActive]} onLayout={e => recordQtySubChipLayout(sub, e.nativeEvent.layout.x)} onPress={() => { setQtySubCategory(active ? null : sub); setQtyCustomSubCategory(null); }}>
                          <Text style={[s.catChipText, active && s.catChipTextActive]}>{SUB_TAXONOMY[sub].label}</Text>
                        </Pressable>
                      );
                    })}
                    {(customSubs[qtyCustomCategory ? `c:${qtyCustomCategory}` : qtyCategory] ?? []).map(label => {
                      const active = qtyCustomSubCategory === label;
                      return (
                        <Pressable key={`cs:${label}`} style={[s.catChip, active && s.catChipActive]} onLayout={e => recordQtySubChipLayout(`cs:${label}`, e.nativeEvent.layout.x)} onPress={() => { setQtyCustomSubCategory(active ? null : label); setQtySubCategory(null); }}>
                          <Text style={[s.catChipText, active && s.catChipTextActive]}>🏷️ {label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            )}
            <Pressable style={s.qtyConfirm} onPress={confirmQtySheet} disabled={adding}>
              {adding
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.qtyConfirmText}>{common.actions.add}</Text>}
            </Pressable>
      </DraggableBottomSheet>

      <Animated.View style={[s.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <Ionicons name="checkmark-circle" size={20} color="#fff" />
        <Text style={s.toastText}>{toastMessage}</Text>
      </Animated.View>

      {/* Merge duplicates sheet */}
      <DraggableBottomSheet
        visible={!!mergeSheet}
        onRequestClose={() => setMergeSheet(null)}
        sheetStyle={[s.sheet, { maxHeight: windowHeight * 0.85, paddingBottom: insets.bottom + 20 }]}
      >
            <View style={s.mergeHeaderRow}>
              <Text style={s.sheetTitle}>{str.merge.heading}</Text>
              {!manualPickerOpen && (
                <Pressable
                  style={s.dupeBadge}
                  onPress={() => { setManualPickerSelected(new Set()); setManualPickerOpen(true); }}
                  hitSlop={8}
                >
                  <Ionicons name="checkbox-outline" size={12} color={c.accent} />
                  <Text style={s.dupeBadgeText}>{str.merge.markManually}</Text>
                </Pressable>
              )}
            </View>
            <ScrollView ref={mergeScrollRef} style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 8, paddingBottom: keyboardVisible ? keyboardHeight + 24 : 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" onScroll={e => { mergeScrollY.current = e.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}>
              {mergeSheet && mergeSheet.items.length > 0 ? (
                <Text style={s.sheetSub}>{str.merge.instruction}</Text>
              ) : (
                <Text style={s.sheetSub}>{str.merge.noDupes}</Text>
              )}
              {/* Samma aggregering som listan (namn+enhet). Arket listade tidigare
                  RÅVARORNA, så två enhetslösa "Bröd" à 1 — som listan visar som en
                  rad "Bröd 2" — dök upp som två kryssrutor. Tre rader här mot två
                  i listan gick inte att få ihop. En kryssruta styr nu alla varor
                  bakom raden. */}
              {mergeSheet && aggregateByNameUnit(mergeSheet.items).map(g => {
                const ids = g.members.map(m => m.id);
                const allSelected = ids.every(id => mergeSelected.has(id));
                return (
                  <Pressable
                    key={g.rep.id}
                    style={s.mergeItem}
                    onPress={() => toggleMergeRow(ids, allSelected)}
                  >
                    <Ionicons
                      name={allSelected ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={allSelected ? c.primary : c.textFaint}
                    />
                    <Text style={s.mergeItemName} numberOfLines={1}>{capitalize(g.rep.name)}</Text>
                    {(g.quantity !== 1 || g.rep.unit) && (
                      <Text style={s.mergeItemQty}>{String(g.quantity).replace('.', ',')}{g.rep.unit ? ` ${g.rep.unit.toLowerCase()}` : ''}</Text>
                    )}
                  </Pressable>
                );
              })}
              {mergeSheet && mergeSheet.items.length > 0 && (<>
              <View style={s.mergeDivider} />
              {new Set(mergeSheet.items.map(i => i.name.toLowerCase().trim())).size > 1 && (<>
                <Text style={s.editLabel}>{common.fields.name}</Text>
                <TextInput
                  ref={mergeNameRef}
                  style={s.editInput}
                  value={mergeName}
                  onChangeText={setMergeName}
                  placeholder={str.placeholders.itemName}
                  placeholderTextColor={c.textFaint}
                  autoCapitalize="none"
                  onFocus={onMergeFocus(mergeNameRef)}
                />
              </>)}
              <Text style={s.editLabel}>{str.merge.newQtyUnit}</Text>
              <View style={[s.qtyStepper, { gap: 6, marginVertical: 4 }]}>
                <Pressable
                  style={[s.qtyBtn, { width: 36, height: 36, borderRadius: 18 }]}
                  onPress={() => { mergeFieldsDirtyRef.current = true; setMergeSuggestionApplied(false); setMergeQty(v => String(Math.max(0.5, (parseFloat(v.replace(',', '.')) || 1) - 1)).replace('.', ',')); }}
                >
                  <Ionicons name="remove" size={18} color={c.primary} />
                </Pressable>
                <TextInput
                  ref={mergeQtyRef}
                  style={s.qtyInput}
                  value={mergeQty}
                  onChangeText={t => { mergeFieldsDirtyRef.current = true; setMergeSuggestionApplied(false); setMergeQty(normalizeQtyInput(t)); }}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  onFocus={onMergeFocus(mergeQtyRef)}
                />
                <Pressable
                  style={[s.qtyBtn, { width: 36, height: 36, borderRadius: 18 }]}
                  onPress={() => { mergeFieldsDirtyRef.current = true; setMergeSuggestionApplied(false); setMergeQty(v => String((parseFloat(v.replace(',', '.')) || 0) + 1).replace('.', ',')); }}
                >
                  <Ionicons name="add" size={18} color={c.primary} />
                </Pressable>
                <TextInput
                  ref={mergeUnitRef}
                  style={s.qtyUnitInput}
                  value={mergeUnit}
                  onChangeText={v => { mergeFieldsDirtyRef.current = true; setMergeSuggestionApplied(false); setMergeUnit(v.toLowerCase()); }}
                  placeholder={str.placeholders.unit}
                  placeholderTextColor={c.textFaint}
                  autoCapitalize="none"
                  onFocus={onMergeFocus(mergeUnitRef)}
                />
              </View>
              {mergeSuggestionApplied && (
                <Text style={s.mergeSuggestionHint}>✨ AI-förslag: hela förpackningar</Text>
              )}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.unitChipScroll} keyboardShouldPersistTaps="handled">
                <View style={s.unitChipRow}>
                  {['st', 'dl', 'ml', 'l', 'g', 'kg', 'msk', 'tsk', 'krm', 'paket', 'påse', 'burk', 'flaska'].map(u => (
                    <Pressable key={u} style={[s.unitChip, mergeUnit === u && s.unitChipActive]} onPress={() => { mergeFieldsDirtyRef.current = true; setMergeSuggestionApplied(false); setMergeUnit(v => v === u ? '' : u); }}>
                      <Text style={[s.unitChipText, mergeUnit === u && s.unitChipTextActive]}>{u}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <Text style={s.editLabel}>{common.fields.category}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catChipScroll} keyboardShouldPersistTaps="handled">
                <View style={s.catChipRow}>
                  {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => (
                    <Pressable
                      key={cat}
                      style={[s.catChip, mergeCategory === cat && s.catChipActive]}
                      onPress={() => setMergeCategory(cat)}
                    >
                      <Text style={[s.catChipText, mergeCategory === cat && s.catChipTextActive]} numberOfLines={1}>
                        {CATEGORY_EMOJIS[cat]} {CATEGORY_LABELS[cat]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              {/* Bekräfta-/nästa-/ignorera-knapparna ligger INUTI listan så man kan
                  scrolla ner till dem även med tangentbordet uppe (paddingBottom ger
                  utrymme). Tidigare låg de utanför + göms vid tangentbord → oåtkomliga. */}
              {/* Räknas i RADER, inte råvaror: arket visar aggregerade rader, och
                  två varor bakom EN rad är inget att slå ihop — villkoret på
                  mergeSelected.size hade aktiverat knappen för en ensam rad med
                  två varor bakom sig. */}
              <Pressable
                style={[s.qtyConfirm, (selectedMergeRows < 2 || adding) && s.saveBtnDisabled]}
                onPress={confirmMerge}
                disabled={adding || selectedMergeRows < 2}
              >
                {adding
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.qtyConfirmText}>{str.merge.mergeRows(selectedMergeRows)}</Text>}
              </Pressable>
              {duplicateGroups.length > 1 && (
                <Pressable
                  style={s.mergeIgnoreBtn}
                  onPress={() => {
                    if (!mergeSheet) return;
                    const idx = duplicateGroups.findIndex(g => g[0].name.toLowerCase().trim() === mergeSheet.name);
                    const next = duplicateGroups[(idx + 1) % duplicateGroups.length];
                    if (next && next !== duplicateGroups[idx]) openMergeForDupes(next);
                  }}
                >
                  <Text style={[s.mergeIgnoreBtnText, { color: c.primary }]}>{str.merge.nextDupe}</Text>
                </Pressable>
              )}
              <Pressable
                style={s.mergeIgnoreBtn}
                onPress={() => {
                  if (mergeSheet) dismissDupeGroup(mergeSheet.items);
                  pendingOpenNextDupe.current = true;
                  setMergeSheet(null);
                }}
              >
                <Text style={s.mergeIgnoreBtnText}>{common.actions.ignore}</Text>
              </Pressable>
              </>)}
            </ScrollView>
      </DraggableBottomSheet>

      {/* Actions menu (3-dot) */}
      <Modal visible={showActionsMenu} transparent animationType="fade" onRequestClose={() => setShowActionsMenu(false)}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => setShowActionsMenu(false)} />
        {/* insets.top: modalen täcker HELA skärmen, så top:0 la menyn över
            statusfältet. Samma fälla som ConfirmDialog redan fixat — den här
            menyn är handrullad och missade den. */}
        <View style={[s.actionsMenu, { top: insets.top + 4 }]}>
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => { setShowActionsMenu(false); toggleIAmShopping(); }}
            disabled={togglingShopper || (!iAmShopping && !!list.activeShopperMemberId)}
          >
            <Ionicons name={iAmShopping ? 'pause-circle-outline' : 'walk-outline'} size={20} color={c.primary} />
            <Text style={s.actionsMenuText}>
              {iAmShopping
                ? str.shopperToggle.stop
                : list.activeShopperMemberId
                  ? `${activeShopper?.displayName ?? str.fallbackActor} handlar nu`
                  : str.shopperToggle.start}
            </Text>
          </Pressable>
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => { setShowActionsMenu(false); setRenameValue(list.name); setRenameEmoji(list.emoji ?? null); setShowRenameModal(true); }}
          >
            <Ionicons name="create-outline" size={20} color={c.primary} />
            <Text style={s.actionsMenuText}>{str.renameTitle}</Text>
          </Pressable>
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => { setShowActionsMenu(false); openStorePicker(); }}
          >
            <Ionicons name="storefront-outline" size={20} color={c.primary} />
            <Text style={s.actionsMenuText}>{list.store?.name ? str.a11y.store(list.store.name) : str.a11y.chooseStore}</Text>
          </Pressable>
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => { setShowActionsMenu(false); goToBulkTransfer(); }}
          >
            <Ionicons name="restaurant-outline" size={20} color={c.primary} />
            <Text style={s.actionsMenuText}>{str.actionsMenu.importMenu}</Text>
          </Pressable>
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => {
              setShowActionsMenu(false);
              if (duplicateGroups.length > 0) openMergeForDupes(duplicateGroups[0]);
              else setMergeSheet({ name: '', category: 'other' as StoreCategory, items: [] });
            }}
          >
            <Ionicons name="git-merge-outline" size={20} color={c.primary} />
            <Text style={s.actionsMenuText}>
              Hantera dubbletter{duplicateGroups.length > 0 ? ` (${duplicateGroups.length})` : ''}
            </Text>
          </Pressable>
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => { setShowActionsMenu(false); checkAllUnchecked(); }}
          >
            <Ionicons name="checkbox-outline" size={20} color={c.primary} />
            <Text style={s.actionsMenuText}>{str.actionsMenu.checkAll}</Text>
          </Pressable>
          <View style={s.actionsMenuDivider} />
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => { setShowActionsMenu(false); completeList(); }}
          >
            <Ionicons name="sparkles-outline" size={20} color={c.danger} />
            <Text style={[s.actionsMenuText, { color: c.danger }]}>{str.actionsMenu.clear}</Text>
          </Pressable>
          <Pressable
            style={s.actionsMenuItem}
            onPress={() => { setShowActionsMenu(false); deleteEntireList(); }}
          >
            <Ionicons name="trash-outline" size={20} color={c.danger} />
            <Text style={[s.actionsMenuText, { color: c.danger }]}>{str.deleteList}</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Rename list modal */}
      <DraggableBottomSheet
        visible={showRenameModal}
        onRequestClose={() => setShowRenameModal(false)}
        liftOffset={sheetLift}
        sheetStyle={[s.sheet, { maxHeight: windowHeight * 0.85, paddingBottom: insets.bottom + 20 }]}
      >
            <Text style={s.sheetTitle}>{str.renameTitle}</Text>
            <TextInput
              ref={renameInputRef}
              style={s.editInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder={str.placeholders.listName}
              placeholderTextColor={c.textFaint}
              returnKeyType="done"
              onFocus={onFocusInput(renameInputRef)}
              onSubmitEditing={saveRename}
            />
            <EmojiPicker value={renameEmoji} onChange={setRenameEmoji} />
            <Pressable
              style={[s.saveBtn, (!renameValue.trim() || renaming) && s.saveBtnDisabled]}
              onPress={saveRename}
              disabled={!renameValue.trim() || renaming}
            >
              {renaming ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{common.actions.save}</Text>}
            </Pressable>
      </DraggableBottomSheet>

      {/* Manual duplicate picker */}
      <DraggableBottomSheet visible={manualPickerOpen} onRequestClose={() => setManualPickerOpen(false)} sheetStyle={s.sheet}>
          <Text style={s.sheetTitle}>{str.merge.pickTitle}</Text>
          <Text style={s.sheetSub}>{str.merge.pickSubtitle}</Text>
          {/* Samma kategori-gruppering som den vanliga listan så det är lätt att
              hitta rätt varor (i st. f. en platt bokstavsordnad lista). */}
          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
            {buildCategoryGroups(
              (list?.items ?? []).filter(i => !i.isChecked && !i.id.startsWith('optimistic-')),
              categoryOrder, customCategories, expandedSubs, customSubs, parentOrder, categoryMerge,
            ).map(group => {
              const key = groupKey(group);
              const label = groupLabel(group);
              return (
                <View key={key} style={s.categoryGroup}>
                  <View style={[s.categoryHeader, group.isSub && s.categorySubHeader]}>
                    <Text style={[s.categoryLabel, group.isSub && s.categorySubLabel]} numberOfLines={2}>{label}</Text>
                  </View>
                  {group.items.map(item => {
                    const checked = manualPickerSelected.has(item.id);
                    return (
                      <Pressable
                        key={item.id}
                        style={s.mergeItem}
                        onPress={() => setManualPickerSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                          return next;
                        })}
                      >
                        <Ionicons
                          name={checked ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={checked ? c.primary : c.textFaint}
                        />
                        <Text style={s.mergeItemName} numberOfLines={1}>{capitalize(item.name)}</Text>
                        {(item.quantity !== 1 || item.unit) && (
                          <Text style={s.mergeItemQty}>{String(item.quantity ?? 1).replace('.', ',')}{item.unit ? ` ${item.unit.toLowerCase()}` : ''}</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
          <Pressable
            style={[s.qtyConfirm, manualPickerSelected.size < 2 && s.saveBtnDisabled]}
            disabled={manualPickerSelected.size < 2}
            onPress={() => {
              if (!list) return;
              const selected = list.items.filter(i => manualPickerSelected.has(i.id));
              if (selected.length < 2) return;
              setManualPickerOpen(false);
              openMergeForDupes(selected);
            }}
          >
            <Text style={s.qtyConfirmText}>Fortsätt med {manualPickerSelected.size} varor</Text>
          </Pressable>
      </DraggableBottomSheet>
    </View>
  );
}

// memo: FlatList renderar om monterade rader vid varje förälder-render. Med
// rad-objektet från den memoiserade listRows och stabila dispatchers som props
// blir jämförelsen sann, och raden hoppar över renderingen helt.
const ItemRow = memo(function ItemRow({ row, onToggle, onEdit, onDelete, pending }: {
  row: RowListRow;
  onToggle: (row: RowListRow) => void;
  onEdit: (row: RowListRow) => void;
  onDelete?: (row: RowListRow) => void;
  pending?: boolean;
}) {
  const item = row.item;
  const { colors: c } = useTheme();
  // Delad cache i stället för egen useMemo per rad: makeStyles bygger HELA
  // skärmens stylesheet (~150 entries), och med useMemo(…, [c]) gjorde varje
  // monterad rad det en gång var. Vid långsam scroll monteras rader i jämn
  // ström, så det blev ett stylesheet per rad — den dyraste posten i scrollen.
  const s = getItemRowStyles(c);
  const { width: windowWidth } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const THRESHOLD = windowWidth * 0.35;

  const doDelete = useCallback(() => { onDelete?.(row); }, [onDelete, row]);
  const doEdit = useCallback(() => { onEdit(row); }, [onEdit, row]);
  const canDelete = !!onDelete && !pending;

  // Memoiserad: Gesture.Pan() byggde annars om hela gest-objektet med sina
  // worklets vid varje render, inte bara vid mount.
  const panGesture = useMemo(() => Gesture.Pan()
    .enabled(!pending)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      // Vänster (om delete finns) = ta bort; höger = redigera.
      translateX.value = canDelete ? e.translationX : Math.max(0, e.translationX);
    })
    .onEnd((e) => {
      if (canDelete && (-translateX.value > THRESHOLD || e.velocityX < -800)) {
        translateX.value = withSpring(-windowWidth);
        runOnJS(doDelete)();
      } else if (translateX.value > THRESHOLD || e.velocityX > 800) {
        // Höger → redigera (fjädra tillbaka; edit öppnar en modal).
        translateX.value = withSpring(0);
        runOnJS(doEdit)();
      } else {
        translateX.value = withSpring(0);
      }
    }), [pending, canDelete, THRESHOLD, windowWidth, translateX, doDelete, doEdit]);

  const rowAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const bgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-translateX.value, [0, THRESHOLD * 0.5], [0, 1], Extrapolation.CLAMP),
  }));

  const editBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, THRESHOLD * 0.5], [0, 1], Extrapolation.CLAMP),
  }));

  const rowContent = (
    <>
      <Ionicons name={item.isChecked ? 'checkbox' : 'square-outline'} size={24} color={item.isChecked ? c.success : c.primary} />
      <View style={s.itemContent}>
        <View style={s.itemRow}>
          <Text style={[s.itemName, (item.isChecked || pending) && s.itemNameChecked]}>{capitalize(item.name)}</Text>
          {(item.quantity !== 1 || item.unit) && (
            <Text style={[s.itemQty, (item.isChecked || pending) && s.itemNameChecked]}>{String(item.quantity).replace('.', ',')}{item.unit ? ` ${item.unit}` : ''}</Text>
          )}
        </View>
      </View>
    </>
  );

  return (
    <View style={[s.swipeRowWrap, !item.isChecked && s.swipeRowWrapShadow]}>
      <RNAnimated.View style={[StyleSheet.absoluteFillObject, s.swipeDeleteBg, bgStyle]}>
        <Ionicons name="trash-outline" size={22} color="#fff" />
      </RNAnimated.View>
      <RNAnimated.View style={[StyleSheet.absoluteFillObject, s.swipeEditBg, editBgStyle]}>
        <Ionicons name="pencil" size={20} color="#fff" />
      </RNAnimated.View>
      {/* touchAction="pan-y" (web-only, ignoreras på native): webbläsaren
          behåller vertikal scroll själv medan horisontella drag går till
          swipe-gesten — utan den sätter RNGH touch-action:none och all
          scroll som börjar på en rad blockeras i PWA:n. */}
      <GestureDetector gesture={panGesture} touchAction="pan-y">
        <RNAnimated.View style={rowAnimStyle}>
          <Pressable
            style={[s.item, item.isChecked && s.itemChecked, pending && s.itemPending]}
            onPress={pending ? undefined : () => onToggle(row)}
            onLongPress={pending ? undefined : doEdit}
          >
            {rowContent}
          </Pressable>
        </RNAnimated.View>
      </GestureDetector>
    </View>
  );
});

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle, paddingBottom: 12 },
  headerNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  headerStack: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  titleSlide: { paddingHorizontal: 20, paddingBottom: 6 },
  scrollMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 20, paddingBottom: 8, paddingTop: 4, gap: 8 },
  titleAreaAbs: { position: 'absolute', left: 0, right: 0, backgroundColor: c.background, zIndex: 10 },
  navbarBgAbs: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: c.background, zIndex: 5 },
  navbarButtonsAbs: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, zIndex: 30 },
  titleTextWrap: { position: 'absolute', left: 20, right: 20, justifyContent: 'center', alignItems: 'flex-start', zIndex: 25 },
  headerNavPinned: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  headerTitleAbs: { position: 'absolute', left: 0, right: 0, zIndex: 10, paddingHorizontal: 20, backgroundColor: c.surface, overflow: 'hidden' },
  actionsMenu: { position: 'absolute', right: 0, backgroundColor: c.surface, borderRadius: 12, paddingVertical: 6, minWidth: 220, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 12 },
  actionsMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  actionsMenuText: { fontSize: 15, color: c.primary, fontWeight: '500' },
  actionsMenuDivider: { height: 1, backgroundColor: c.surfaceSubtle, marginVertical: 4 },
  headerTitle: { paddingHorizontal: 20, paddingTop: 5, paddingBottom: 5 },
  headerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  backBtn: { padding: 4 },
  doneBtn: { padding: 4 },
  title: { fontSize: 26, fontWeight: '700', color: c.text },
  titleCompact: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: c.text, paddingHorizontal: 8 },
  progressBar: { height: 3, backgroundColor: c.borderLight },
  stickyCat: { position: 'absolute', left: 0, right: 0, zIndex: 20, backgroundColor: c.background, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  navStoreBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 14, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: c.primary200, borderRadius: 999, backgroundColor: c.primaryTint, maxWidth: '35%', flexShrink: 1 },
  navStoreNameWrap: { overflow: 'hidden', justifyContent: 'center' },
  navStoreName: { fontSize: 15, color: c.primary, fontWeight: '600' },
  shopperWrap: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  shopperTextWrap: { overflow: 'hidden', justifyContent: 'center' },
  shopperText: { fontSize: 13, color: c.pink, fontWeight: '600' },
  shopperIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.pinkTint, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  progressFill: { height: 3, backgroundColor: c.success },
  list: { padding: 16, gap: 2, paddingBottom: 8 },
  listEmpty: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyImportBtn: { marginBottom: 4 },
  emptyText: { fontSize: 17, fontWeight: '600', color: c.textSecondary, marginTop: 12 },
  emptySubtext: { fontSize: 13, color: c.textFaint, marginTop: 4, textAlign: 'center', paddingHorizontal: 32 },
  dupeFloatWrap: { position: 'absolute', right: 16, zIndex: 5 },
  dupeFloatBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accent, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  dupeFloatText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  dupeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.accent100, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  dupeBadgeText: { fontSize: 12, fontWeight: '600', color: c.accent },
  mergeIgnoreBtn: { paddingVertical: 10 },
  mergeIgnoreBtnText: { fontSize: 14, color: c.textFaint, textAlign: 'center' },
  mergeHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryGroup: { gap: 2 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2, paddingVertical: 4, gap: 8 },
  categoryLabel: { fontSize: 12, fontWeight: '700', color: c.primary, textTransform: 'uppercase', letterSpacing: 0.6, flex: 1, flexShrink: 1 },
  // Sub-grupp-rubriker: inget uppercase + ingen letterSpacing (annars klipps
  // långa subnamn som "Toalett- & hushållspapper"); lite indenterad + dämpad
  // för att visuellt tillhöra sin parent.
  categorySubHeader: { paddingVertical: 4 },
  categorySubLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: c.primary },
  checkedCatLabel: { fontSize: 11, fontWeight: '600', color: c.textFaint, letterSpacing: 0.4, paddingHorizontal: 2, paddingTop: 8, paddingBottom: 1 },
  showAllChecked: { alignItems: 'center', paddingVertical: 12, marginTop: 2 },
  showAllCheckedText: { fontSize: 14, fontWeight: '600', color: c.primary },
  categoryCount: { fontSize: 11, color: c.textFaint, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 10, padding: 14, gap: 12 },
  itemChecked: { opacity: 0.55 },
  itemPending: { opacity: 0.4, backgroundColor: c.dangerTint },
  itemContent: { flex: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  itemName: { fontSize: 16, color: c.text, flex: 1 },
  itemNameChecked: { textDecorationLine: 'line-through', color: c.textFaint },
  itemQty: { fontSize: 14, color: c.textMuted, fontWeight: '500' },
  chipScroll: { backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.surfaceSubtle, maxHeight: 44 },
  commonScroll: { backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.surfaceSubtle, paddingTop: 6, paddingBottom: 2 },
  chipHint: { fontSize: 11, fontWeight: '700', color: c.textFaint, letterSpacing: 0.5, paddingHorizontal: 12 },
  chipRowWrap: { paddingHorizontal: 12, paddingVertical: 6, gap: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  chipRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexDirection: 'row', alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.primaryTint, borderRadius: 20 },
  chipText: { fontSize: 13, color: c.primary, fontWeight: '500' },
  addBar: { flexDirection: 'row', padding: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.surfaceSubtle, gap: 10, alignItems: 'center' },
  browseBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: c.primaryTint, alignItems: 'center', justifyContent: 'center' },
  // minWidth:0 så input:en får krympa under sin intrinsiska content-bredd på web
  // (annars trycks "+"-knappen ut utanför högerkanten — min-width:auto på <input>).
  addInput: { color: c.text, flex: 1, minWidth: 0, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, backgroundColor: c.inputBg },
  addBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
  addBtnDisabled: { opacity: 0.4 },
  // Dim ligger på ett eget absolut lager (overlayDim) så det täcker HELA skärmen
  // inkl. bakom sheetens rundade hörn; overlay-Pressablen är transparent och
  // sköter bara tap-to-dismiss + att putta ner sheeten (flex:1).
  overlay: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(41,37,36,0.55)' },
  // width:100% + maxWidth + alignSelf:center → full bredd på telefon (<480), men
  // capad och centrerad på bred/webb-viewport så sheeten inte blir "fullscreen".
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 12, maxHeight: '85%', width: '100%', maxWidth: 480, alignSelf: 'center' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: c.text },
  sheetSub: { fontSize: 13, color: c.textMuted, marginTop: -4 },
  storeOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 10, backgroundColor: c.background },
  storeOptionFlex: { flex: 1 },
  storeOptionActive: { backgroundColor: c.primaryTint },
  storeOptionText: { fontSize: 15, color: c.text, fontWeight: '500' },
  storeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  editStoreBtn: { padding: 12, backgroundColor: c.background, borderRadius: 10 },
  newStoreRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.background },
  catRowLabel: { flex: 1, fontSize: 15, color: c.textSecondary },
  catArrow: { padding: 6 },
  saveBtn: { backgroundColor: c.primary, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 4 },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  editRow: { flexDirection: 'row', gap: 12 },
  editLabel: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 6 },
  editInput: { color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, backgroundColor: c.inputBg },
  catChipScroll: { marginBottom: 4 },
  catChipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  catChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: c.surfaceSubtle, borderWidth: 1, borderColor: c.borderLight, flexShrink: 0 },
  catChipActive: { backgroundColor: c.primaryTint, borderColor: c.primary },
  catChipText: { fontSize: 13, color: c.textSecondary, fontWeight: '500' },
  catChipTextActive: { color: c.primary, fontWeight: '600' },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.dangerBorder, backgroundColor: c.dangerTint },
  deleteBtnText: { color: c.danger, fontWeight: '600', fontSize: 15 },
  // Skuggan ligger HÄR, inte på s.item: wrappern har overflow:'hidden' för att
  // klippa svep-bakgrunderna till hörnen, och det klipper barnens skuggor. En
  // vy klipper aldrig sin EGEN skugga, så den måste sitta på wrappern.
  swipeRowWrap: { borderRadius: 10, overflow: 'hidden', backgroundColor: c.surface },
  // Bara på AKTIVA rader. Listan renderas i en ScrollView med .map(), alltså
  // helt utan virtualisering — varje avklarad rad är monterad. Med elevation på
  // samtliga fick Android rita en skugga per rad och scrollen blev ryckig.
  // Avklarade rader ska dessutom ligga tillbaka visuellt.
  swipeRowWrapShadow: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  swipeDeleteBg: { backgroundColor: c.danger, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 20 },
  swipeEditBg: { backgroundColor: c.primary, justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 20 },
  browserSheet: { maxHeight: '90%', gap: 0 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  categoryTile: { width: '47%', backgroundColor: c.background, borderRadius: 12, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: c.borderLight },
  categoryTileEmoji: { fontSize: 28 },
  categoryTileLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, textAlign: 'center' },
  browserHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  browserBack: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  browserBackText: { fontSize: 14, color: c.primary, fontWeight: '500' },
  browserTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'right' },
  browserList: { marginTop: 12, maxHeight: 400 },
  browserItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  browserItemText: { flex: 1, fontSize: 16, color: c.text },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  qtyBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.primaryTint, alignItems: 'center', justifyContent: 'center' },
  // Litet antalsfält (inte flex) så enhet får plats på samma rad som i native-appen.
  qtyInput: { width: 70, textAlign: 'center', fontSize: 16, fontWeight: '600', color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 10, backgroundColor: c.inputBg },
  qtyUnitInput: { flex: 1, minWidth: 0, fontSize: 16, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: c.inputBg },
  qtyConfirm: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  qtyConfirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  toast: { position: 'absolute', bottom: 76, alignSelf: 'center', backgroundColor: c.successLight, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  mergeList: { maxHeight: 200, flexGrow: 0 },
  unitChipScroll: { marginVertical: 4 },
  unitChipRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  unitChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: c.surfaceSubtle, borderWidth: 1, borderColor: c.borderLight },
  unitChipActive: { backgroundColor: c.primaryTint, borderColor: c.primary },
  unitChipText: { fontSize: 13, color: c.textSecondary, fontWeight: '500' },
  unitChipTextActive: { color: c.primary, fontWeight: '600' },
  mergeItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  // Samma lineHeight på namn + mängd — olika fontSize ger annars olika
  // baslinjer i den centrerade raden. Fast bredd + textAlign right på mängden
  // så siffrorna bildar en rak högerkolumn oavsett rad (Androids textmätning
  // gav annars olika högerkant per rad).
  mergeItemName: { fontSize: 16, lineHeight: 22, color: c.textSecondary, flex: 1 },
  mergeItemQty: { fontSize: 15, lineHeight: 22, color: c.textMuted, width: 84, textAlign: 'right' },
  mergeSuggestionHint: { fontSize: 12, color: c.primary, marginTop: 2, marginBottom: 4 },
  mergeDivider: { height: 1, backgroundColor: c.borderLight, marginTop: 4 },
  // Resultat-fälten (namn/mängd/enhet/chips) ligger UTANFÖR dubblett-listans
  // ScrollView så de alltid syns, oavsett hur många dubbletter som listas.
  mergeResult: { gap: 8, paddingTop: 4 },
  itemWrap: { position: 'relative' },
  itemDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: c.surface, borderRadius: 11 },
  editDoneBtn: { backgroundColor: c.text, padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: c.borderLight },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default function ShoppingListScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  return <ShoppingListDetail listId={listId} />;
}
