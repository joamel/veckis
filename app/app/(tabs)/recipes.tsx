import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useTheme } from '../../src/context/ThemeContext';
import type { Palette } from '../../src/lib/theme';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import * as SecureStore from '../../src/lib/secureStorage';
import { useApiClient, type RecipeWithIngredients, type WeekMenuItemWithRecipe } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useHouseholdSocket } from '../../src/hooks/useHouseholdSocket';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useDiscardDraft } from '../../src/hooks/useDiscardDraft';
import { EmptyState } from '../../src/components/EmptyState';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { getISOWeek, addWeeks, getISOWeekMonday } from '../../src/lib/week';
import type { WeekDay } from '@veckis/shared';
import { recipes as str, common, gettingStarted } from '../../src/lib/svenska';
import { useSpotlightTip } from '../../src/context/SpotlightTipContext';
import { consumeSpotlight } from '../../src/lib/spotlightRequest';
import { dayItemsSummary } from '../../src/lib/menuDaySummary';
import { useTablet } from '../../src/hooks/useTablet';

// Labels hämtas från de centraliserade veckodagarna (mån-först) så inget
// dagnamn är hårdkodat i komponenten — då räcker det att översätta svenska.ts.
const MENU_DAYS: { key: WeekDay; label: string }[] =
  (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as WeekDay[])
    .map((key, i) => ({ key, label: common.weekdays.long[i] }));

export default function RecipesScreen() {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const params = useLocalSearchParams<{ create?: string; forMenuDay?: string; replaceMenuItemId?: string; replaceTitle?: string; forMenuWeek?: string; chooseDay?: string }>();
  const createTriggeredRef = useRef(false);
  const fabRef = useRef<View>(null);
  const showTip = useSpotlightTip();
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { getToken } = useAuth();
  const { showToast, showError } = useToast();
  const confirm = useConfirm();
  const tryCloseCreate = useDiscardDraft(confirm);
  const discardCreate = () => { setShowModal(false); setTitle(''); setUrl(''); setPasteText(''); setMode('manual'); };
  const closeCreate = () => tryCloseCreate(title.trim() !== '' || url.trim() !== '' || pasteText.trim() !== '', discardCreate);
  const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Fäll ihop sök+taggar när man scrollar ner i listan (frigör skärmyta); fäll ut
  // igen via pilen eller när man scrollar tillbaka till toppen.
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sortMode, setSortMode] = useState<'name' | 'used' | 'recent'>('name');
  const [showSort, setShowSort] = useState(false);
  const { fs, sp } = useTablet();
  useEffect(() => {
    SecureStore.getItemAsync('recipeSort').then(v => {
      if (v === 'name' || v === 'used' || v === 'recent') setSortMode(v);
    }).catch(() => {});
  }, []);
  function chooseSort(m: 'name' | 'used' | 'recent') {
    setSortMode(m);
    setShowSort(false);
    SecureStore.setItemAsync('recipeSort', m).catch(() => {});
  }
  // Quick "add to menu" from the recipe list.
  const [addToMenuFor, setAddToMenuFor] = useState<RecipeWithIngredients | null>(null);
  const [addToMenuWeekStr, setAddToMenuWeekStr] = useState('');
  const [addToMenuWeekItems, setAddToMenuWeekItems] = useState<WeekMenuItemWithRecipe[]>([]);
  const [weekMenu, setWeekMenu] = useState<WeekMenuItemWithRecipe[]>([]);

  useEffect(() => {
    if (!addToMenuWeekStr || !householdId || !addToMenuFor) {
      setAddToMenuWeekItems([]);
      return;
    }
    let stale = false;
    const [y, w] = addToMenuWeekStr.split('-').map(Number);
    client.getWeekMenu(householdId, y, w)
      .then(items => { if (!stale) setAddToMenuWeekItems(items); })
      .catch(() => { if (!stale) setAddToMenuWeekItems([]); });
    return () => { stale = true; };
  }, [addToMenuWeekStr, addToMenuFor, householdId]);

  useHouseholdSocket(householdId, getToken, (msg) => {
    if (msg.type !== 'menu_updated') return;
    if (!addToMenuFor || !addToMenuWeekStr) return;
    const [y, w] = addToMenuWeekStr.split('-').map(Number);
    if (msg.data.weekYear === y && msg.data.weekNumber === w) {
      client.getWeekMenu(householdId!, y, w).then(setAddToMenuWeekItems).catch(() => {});
    }
  });

  function addRecipeToMenu(recipe: RecipeWithIngredients, day: WeekDay | null) {
    setAddToMenuFor(null);
    if (!householdId) return;
    // Flera rätter per dag är avsiktligt (måltidstyp sätts på menykortet) — en
    // mjuk varning om dagen redan har en rätt, men "lägg till ändå".
    if (day && addToMenuWeekItems.some(m => m.day === day)) {
      const label = MENU_DAYS.find(d => d.key === day)?.label;
      confirm({
        title: str.menu.dayOccupied.title,
        message: str.menu.dayOccupied.message(label ?? ''),
        buttons: [
          { label: str.menu.dayOccupied.confirm, onPress: () => addRecipeToMenuStep2(recipe, day) },
          { label: common.actions.cancel, style: 'cancel' },
        ],
      });
      return;
    }
    addRecipeToMenuStep2(recipe, day);
  }

  // … och separat om SAMMA rätt redan ligger någonstans i veckan.
  function addRecipeToMenuStep2(recipe: RecipeWithIngredients, day: WeekDay | null) {
    if (addToMenuWeekItems.some(m => m.recipeId === recipe.id)) {
      confirm({
        title: str.menu.recipeOccupied.title,
        message: str.menu.recipeOccupied.message(recipe.title),
        buttons: [
          { label: str.menu.recipeOccupied.confirm, onPress: () => doAddToMenu(recipe, day) },
          { label: common.actions.cancel, style: 'cancel' },
        ],
      });
      return;
    }
    doAddToMenu(recipe, day);
  }

  async function doAddToMenu(recipe: RecipeWithIngredients, day: WeekDay | null) {
    if (!householdId) return;
    const [weekYear, weekNumber] = addToMenuWeekStr
      ? addToMenuWeekStr.split('-').map(Number)
      : [getISOWeek(new Date()).weekYear, getISOWeek(new Date()).weekNumber];
    try {
      const item = await client.addToWeekMenu({ householdId, recipeId: recipe.id, day, weekYear, weekNumber });
      setWeekMenu(prev => [...prev, item]);
      setAddToMenuWeekItems(prev => [...prev, item]);
      const dayLabel = day ? MENU_DAYS.find(d => d.key === day)?.label.toLowerCase() : null;
      const todayW = getISOWeek(new Date());
      const weekLabel = weekYear === todayW.weekYear && weekNumber === todayW.weekNumber ? str.menu.thisWeek : str.menu.weekLabel(weekNumber);
      showToast(dayLabel ? str.menu.addedWithDay(recipe.title, dayLabel, weekLabel) : str.menu.addedNoDay(recipe.title, weekLabel), 'success');
      // Kom man hit via menyns "+ lägg till rätt" → tillbaka till menyn (som
      // uppdateras via menu_updated-socket), i stället för att bli kvar i väljaren.
      if (chooseMode && router.canGoBack()) router.back();
    } catch (e) {
      showError(e, str.menu.errorAdd);
    }
  }

  // Select mode — entered from the menu's "+" (pick a recipe for a day) or
  // "Byt ut" (replace a dish). Tapping a recipe routes back to the menu, which
  // applies it to the week it's showing.
  const replaceMode = params.replaceMenuItemId !== undefined;
  const selectionMode = params.forMenuDay !== undefined || replaceMode;
  // "Välj dag"-läge (botten-"+" i menyn): tapp på ett recept öppnar
  // "Lägg till i meny"-popupen där man väljer dag/vecka (inkl. utan dag).
  const chooseMode = params.chooseDay === '1';

  function openPlanFor(recipe: RecipeWithIngredients) {
    const seed = params.forMenuWeek || (() => {
      const { weekYear, weekNumber } = getISOWeek(new Date());
      return `${weekYear}-${String(weekNumber).padStart(2, '0')}`;
    })();
    setAddToMenuWeekStr(seed);
    setAddToMenuFor(recipe);
  }
  const selectionDayLabel = params.forMenuDay && params.forMenuDay !== 'none'
    ? MENU_DAYS.find(d => d.key === params.forMenuDay)?.label
    : common.noDay;

  // Carry the viewed week back so the dish lands there, not in the current week.
  const weekSuffix = params.forMenuWeek ? `&forMenuWeek=${params.forMenuWeek}` : '';

  function selectRecipeForMenu(recipe: RecipeWithIngredients) {
    if (replaceMode) {
      confirm({
        title: str.menu.replace.title,
        message: str.menu.replace.message(params.replaceTitle ?? str.fallbackDish, recipe.title),
        buttons: [
          { label: str.menu.replace.confirm, style: 'destructive', onPress: () => router.replace(`/(tabs)/menu?addRecipeId=${recipe.id}&replaceMenuItemId=${params.replaceMenuItemId}${weekSuffix}` as never) },
          { label: common.actions.cancel, style: 'cancel' },
        ],
      });
      return;
    }
    const day = params.forMenuDay === 'none' ? '' : (params.forMenuDay ?? '');
    router.replace(`/(tabs)/menu?addRecipeId=${recipe.id}&day=${day}${weekSuffix}` as never);
  }

  // Tagg-filter: alla taggar som förekommer i hushållets recept, vanligast först.
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'sv')).map(([t]) => t);
  }, [recipes]);
  const toggleTagFilter = (tag: string) => setActiveTags(prev => {
    const next = new Set(prev);
    if (next.has(tag)) next.delete(tag); else next.add(tag);
    return next;
  });

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let base = q
      ? recipes.filter(r =>
          r.title.toLowerCase().includes(q) ||
          r.ingredients.some(i => i.name.toLowerCase().includes(q)))
      : recipes;
    // AND-filter: receptet måste ha ALLA valda taggar (smalnar av urvalet).
    if (activeTags.size > 0) {
      base = base.filter(r => [...activeTags].every(t => (r.tags ?? []).includes(t)));
    }
    return [...base].sort((a, b) => {
      if (sortMode === 'used') return (b.timesUsed ?? 0) - (a.timesUsed ?? 0) || a.title.localeCompare(b.title);
      if (sortMode === 'recent') return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      return a.title.localeCompare(b.title);
    });
  }, [recipes, searchQuery, sortMode, activeTags]);

  const insets = useSafeAreaInsets();
  // New recipe form
  const [mode, setMode] = useState<'manual' | 'paste' | 'url'>('manual');
  // Håll koll på om tangentbordet är uppe just nu — vid flikbyte remountas
  // inputfältet, och vi vill att fokus "följer med" bara om tangentbordet
  // redan var uppe. Ref (inte state) så det läses synkront utan re-render.
  const keyboardUpRef = useRef(false);
  // Scroll-into-view-lyft (native): mät det fokuserade fältet när tangentbordet
  // visats (då finns rätt höjd) och lyft sheeten BARA så mycket att fältet syns
  // ovanför tangentbordet — inte hela höjden (då flyger höga modaler upp). Web:
  // browsern sköter viewporten, inget lyft. Nollställs rent vid keyboardDidHide.
  const { height: windowHeight } = useWindowDimensions();
  const focusedInputRef = useRef<TextInput | null>(null);
  const kbHeightRef = useRef(0);
  const [sheetLift, setSheetLift] = useState(0);
  // Mät fokuserat fält och lyft lagom. Körs både vid keyboardDidShow och vid
  // onFocus (så lyftet räknas om när man byter fält medan tangentbordet redan är
  // uppe, t.ex. manuellt → klistra in).
  const revealFocused = useCallback(() => {
    if (Platform.OS === 'web' || kbHeightRef.current === 0) return;
    const ref = focusedInputRef.current;
    if (!ref) return;
    const kbH = Math.min(kbHeightRef.current, windowHeight * 0.5);
    setTimeout(() => ref.measureInWindow((_x, y, _w, h) => {
      // y innehåller redan nuvarande lyft (prev) → naturlig botten = y + prev + h.
      // Räkna mål-lyftet absolut (idempotent), klampat.
      setSheetLift(prev => Math.max(0, Math.min((y + prev + h + 20) - (windowHeight - kbH), windowHeight * 0.5)));
    }), 60);
  }, [windowHeight]);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => { keyboardUpRef.current = true; kbHeightRef.current = e.endCoordinates?.height ?? 0; revealFocused(); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardUpRef.current = false; kbHeightRef.current = 0; setSheetLift(0); });
    return () => { show.remove(); hide.remove(); };
  }, [revealFocused]);
  // Fokus-överföring vid flikbyte. autoFocus på det remountade fältet är
  // opålitligt på Android (särskilt multiline paste-fältet visar inte
  // tangentbordet), och den async:a keyboardDidHide hinner ibland nolla
  // keyboardUpRef före mount. Därför: snapshot:a "ville fokusera" i själva
  // tabb-trycket (då är tangentbordet garanterat uppe) och fokusera aktivt
  // fält explicit via ref i en effekt efter att läget bytts.
  const manualRef = useRef<TextInput>(null);
  const pasteRef = useRef<TextInput>(null);
  const urlRef = useRef<TextInput>(null);
  const wantFocusRef = useRef(false);
  const switchMode = useCallback((next: 'manual' | 'paste' | 'url') => {
    wantFocusRef.current = keyboardUpRef.current;
    setMode(next);
  }, []);
  useEffect(() => {
    if (!wantFocusRef.current) return;
    const target = mode === 'manual' ? manualRef : mode === 'paste' ? pasteRef : urlRef;
    const id = requestAnimationFrame(() => target.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [mode]);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const { weekYear, weekNumber } = getISOWeek(new Date());
      const [recs, menu] = await Promise.all([
        client.getRecipes(householdId),
        client.getWeekMenu(householdId, weekYear, weekNumber).catch(() => [] as WeekMenuItemWithRecipe[]),
      ]);
      setRecipes(recs);
      setWeekMenu(menu);
    } catch {
      confirm({ title: str.errors.generic, message: str.errors.couldNotLoad, buttons: [{ label: common.actions.ok }] });
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); return () => setEditMode(false); }, [load]));

  // Kom igång-kortet: tänd spotlight på "+"-FAB:en om den bad om det (opt-in).
  // Väntar tills listan renderats (spinnern släppt) så targetRef är mätbar.
  useFocusEffect(useCallback(() => {
    if (loading) return;
    if (!consumeSpotlight('gs-recipe')) return;
    showTip({ title: gettingStarted.spotlight.recipe.title, message: gettingStarted.spotlight.recipe.message, targetRef: fabRef });
  }, [loading, showTip]));

  async function handleScrape() {
    if (!url.trim()) return;
    const normalizedUrl = url.trim().replace(/\/$/, '');
    const existing = recipes.find(r => r.sourceUrl?.replace(/\/$/, '') === normalizedUrl);
    if (existing) {
      confirm({
        title: str.errors.duplicate.title,
        message: str.errors.duplicate.message(existing.title),
        buttons: [
          { label: str.errors.duplicate.open, onPress: () => { setShowModal(false); router.push(`/recipes/${existing.id}` as never); } },
          { label: common.actions.cancel, style: 'cancel' },
        ],
      });
      return;
    }
    setScraping(true);
    try {
      const scraped = await client.scrapeRecipe(url.trim());
      if (!householdId) return;
      setCreating(true);
      const recipe = await client.createRecipe({
        householdId,
        title: scraped.title,
        description: scraped.description,
        instructions: scraped.instructions,
        sourceUrl: url.trim(),
        source: 'url_import',
        imageUrl: scraped.imageUrl,
        servings: scraped.servings,
        ingredients: scraped.ingredients.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
      });
      setRecipes(prev => [...prev, recipe].sort((a, b) => a.title.localeCompare(b.title)));
      setShowModal(false);
      setUrl('');
      // Recipe found but no ingredients parsed — drop the user straight into edit
      // mode to fill them in, instead of a confusing empty recipe.
      if (scraped.ingredients.length === 0) {
        confirm({ title: str.errors.noIngredients.title, message: str.errors.noIngredients.message, buttons: [{ label: common.actions.ok }] });
        router.push(`/recipes/${recipe.id}?edit=1` as never);
      } else {
        router.push(`/recipes/${recipe.id}` as never);
      }
    } catch (err) {
      // Scrape failed (no recipe data, fetch error, timeout…) — don't dead-end;
      // offer to add the recipe manually instead.
      confirm({
        title: str.errors.parseFailed.title,
        message: str.errors.parseFailed.message(err instanceof Error ? err.message : str.linkUnreadable),
        buttons: [
          { label: str.errors.parseFailed.manual, onPress: () => setMode('manual') },
          { label: common.actions.cancel, style: 'cancel' },
        ],
      });
    } finally {
      setScraping(false);
      setCreating(false);
    }
  }

  async function handleParseAndCreate() {
    if (!householdId) return;
    setParsing(true);
    try {
      const parsed = await client.parseRecipeText(pasteText.trim());
      const usedTitle = title.trim() || parsed.title;
      setCreating(true);
      const recipe = await client.createRecipe({
        householdId,
        title: usedTitle,
        description: parsed.description,
        instructions: parsed.instructions,
        source: 'ai_paste',
        servings: parsed.servings,
        ingredients: parsed.ingredients.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
      });
      setRecipes(prev => [...prev, recipe].sort((a, b) => a.title.localeCompare(b.title)));
      setShowModal(false);
      setTitle('');
      setPasteText('');
      setMode('manual');
      const forMenuDay = params.forMenuDay;
      const suffix = (forMenuDay !== undefined ? `&forMenuDay=${forMenuDay}` : '') + weekSuffix;
      router.push(`/recipes/${recipe.id}${parsed.ingredients.length === 0 ? '?edit=1' : ''}${suffix}` as never);
    } catch (err) {
      confirm({ title: str.errors.generic, message: err instanceof Error ? err.message : str.errors.couldNotParse, buttons: [{ label: common.actions.ok }] });
    } finally {
      setParsing(false);
      setCreating(false);
    }
  }

  async function handleCreateManual() {
    if (!householdId || !title.trim()) return;
    setCreating(true);
    try {
      const recipe = await client.createRecipe({ householdId, title: title.trim() });
      setRecipes(prev => [...prev, recipe].sort((a, b) => a.title.localeCompare(b.title)));
      setShowModal(false);
      setTitle('');
      const forMenuDay = params.forMenuDay;
      const suffix = (forMenuDay !== undefined ? `&forMenuDay=${forMenuDay}` : '') + weekSuffix;
      router.push(`/recipes/${recipe.id}?edit=1${suffix}` as never);
    } catch {
      confirm({ title: str.errors.generic, message: str.errors.couldNotCreate, buttons: [{ label: common.actions.ok }] });
    } finally {
      setCreating(false);
    }
  }

  // Auto-open create modal when navigated with ?create=1
  useEffect(() => {
    if (params.create === '1' && !createTriggeredRef.current) {
      createTriggeredRef.current = true;
      openModal();
      router.setParams({ create: undefined });
    }
    if (params.create !== '1') createTriggeredRef.current = false;
  }, [params.create]);

  function openModal() {
    wantFocusRef.current = false; // öppna lugnt — inget autofokus vid öppning
    setMode('manual');
    setTitle('');
    setUrl('');
    setPasteText('');
    setShowModal(true);
  }

  // Sheet-innehållet (delas ut för läsbarhet; renderas inuti KAV nedan).
  const createSheetInner = (
    <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
      <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>{str.createModal.title}</Text>

        <View style={s.modeTabs}>
          <Pressable style={[s.modeTab, mode === 'manual' && s.modeTabActive]} onPress={() => switchMode('manual')}>
            <Text style={[s.modeTabText, mode === 'manual' && s.modeTabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{str.createModal.tabManual}</Text>
          </Pressable>
          <Pressable style={[s.modeTab, mode === 'paste' && s.modeTabActive]} onPress={() => switchMode('paste')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="sparkles" size={13} color={mode === 'paste' ? c.primary : c.textMuted} />
              <Text style={[s.modeTabText, mode === 'paste' && s.modeTabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{str.createModal.tabPaste}</Text>
            </View>
          </Pressable>
          <Pressable style={[s.modeTab, mode === 'url' && s.modeTabActive]} onPress={() => switchMode('url')}>
            <Text style={[s.modeTabText, mode === 'url' && s.modeTabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{str.createModal.tabUrl}</Text>
          </Pressable>
        </View>

        <View style={s.modeBody}>
        {mode === 'manual' ? (
          <>
            <TextInput
              ref={manualRef}
              style={s.input}
              placeholder={str.createModal.namePlaceholder}
              placeholderTextColor={c.textFaint}
              value={title}
              onChangeText={setTitle}
              importantForAutofill="no"
              textContentType="none"
              returnKeyType="done"
              onFocus={() => { focusedInputRef.current = manualRef.current; revealFocused(); }}
              onSubmitEditing={handleCreateManual}
            />
            <Text style={s.createHint}>{str.createModal.createHint}</Text>
            <Pressable
              style={[s.button, s.modeBodyBtn, !title.trim() && s.buttonDisabled]}
              onPress={handleCreateManual}
              disabled={creating || !title.trim()}
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{str.createModal.createButton}</Text>}
            </Pressable>
          </>
        ) : mode === 'paste' ? (
          <>
            <Text style={s.pasteHint}>{str.createModal.pasteHint}</Text>
            <TextInput
              ref={pasteRef}
              style={[s.input, { height: 130, textAlignVertical: 'top', paddingTop: 10 }]}
              placeholder={str.createModal.pastePlaceholder}
              placeholderTextColor={c.textFaint}
              value={pasteText}
              onChangeText={setPasteText}
              multiline
              scrollEnabled
              importantForAutofill="no"
              onFocus={() => { focusedInputRef.current = pasteRef.current; revealFocused(); }}
            />
            <Pressable
              style={[s.button, s.modeBodyBtn, !pasteText.trim() && s.buttonDisabled]}
              onPress={handleParseAndCreate}
              disabled={parsing || creating || !pasteText.trim()}
            >
              {parsing || creating ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{str.createModal.parseButton}</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              ref={urlRef}
              style={s.input}
              placeholder={str.createModal.urlPlaceholder}
              placeholderTextColor={c.textFaint}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              keyboardType="url"
              importantForAutofill="no"
              textContentType="none"
              onFocus={() => { focusedInputRef.current = urlRef.current; revealFocused(); }}
              returnKeyType="done"
              onSubmitEditing={handleScrape}
            />
            <Text style={s.urlHint}>{str.createModal.urlHint}</Text>
            <Pressable
              style={[s.button, s.modeBodyBtn, !url.trim() && s.buttonDisabled]}
              onPress={handleScrape}
              disabled={scraping || creating || !url.trim()}
            >
              {scraping || creating
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.buttonText}>{str.createModal.fetchButton}</Text>}
            </Pressable>
          </>
        )}
        </View>
    </View>
  );

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>;
  }

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader
        title={str.title}
        onBack={selectionMode || chooseMode || params.create === '1' ? () => router.back() : undefined}
        actionNode={
          <Pressable onPress={() => setShowSort(true)} hitSlop={8} style={[s.sortBtn, { width: sp(36), height: sp(36), borderRadius: sp(18) }]} accessibilityLabel={str.sort.a11y}>
            <Ionicons name="swap-vertical" size={fs(18)} color={c.primary} />
          </Pressable>
        }
      />
      {filtersOpen ? (
      <View style={s.subHeader}>
        <View style={s.searchRow}>
          <Ionicons name="search" size={16} color={c.textFaint} style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            placeholder={str.search.placeholder}
            placeholderTextColor={c.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={common.actions.clearSearch}>
              <Ionicons name="close-circle" size={16} color={c.textFaint} />
            </Pressable>
          )}
          <Pressable onPress={() => setFiltersOpen(false)} hitSlop={8} style={{ marginLeft: 4 }} accessibilityRole="button">
            <Ionicons name="chevron-up" size={16} color={c.textFaint} />
          </Pressable>
        </View>
        {/* Tagg-filter — visas först när hushållet har taggat recept. AND-filter.
            Chipsen ligger på en rad man swipar; rensa-krysset är pinnat till
            höger UTANFÖR scrollen så det alltid syns utan sidoscroll. */}
        {allTags.length > 0 && (
          <View style={s.tagFilterBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={s.tagFilterScroll}
              contentContainerStyle={s.tagFilterRow}
            >
              {allTags.map(t => {
                const active = activeTags.has(t);
                return (
                  <Pressable key={t} style={[s.tagFilterChip, active && s.tagFilterChipActive]} onPress={() => toggleTagFilter(t)}>
                    <Text style={[s.tagFilterChipText, active && s.tagFilterChipTextActive]}>{t}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {activeTags.size > 0 && (
              <Pressable style={s.tagFilterClear} onPress={() => setActiveTags(new Set())} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={c.textFaint} />
              </Pressable>
            )}
          </View>
        )}
      </View>
      ) : (
        <Pressable style={s.filtersCollapsed} onPress={() => setFiltersOpen(true)} accessibilityRole="button" accessibilityLabel={str.search.placeholder}>
          <Ionicons name="search" size={16} color={c.textFaint} />
          {(searchQuery.length > 0 || activeTags.size > 0) && <View style={s.filtersActiveDot} />}
          <View style={{ flex: 1 }} />
          <Ionicons name="chevron-down" size={16} color={c.textFaint} />
        </Pressable>
      )}

      {(selectionMode || chooseMode) && (
        <View style={s.selectBanner}>
          <Ionicons name="restaurant-outline" size={16} color={c.primary} />
          <Text style={s.selectBannerText} numberOfLines={1}>
            {chooseMode ? str.selection.plan : replaceMode ? str.selection.replace(params.replaceTitle ?? '') : str.selection.pick(selectionDayLabel ?? common.noDay)}
          </Text>
        </View>
      )}

      <FlatList
        data={filteredRecipes}
        keyExtractor={r => r.id}
        contentContainerStyle={[s.list, filteredRecipes.length === 0 && s.listEmpty]}
        onRefresh={load}
        refreshing={loading}
        scrollEventThrottle={16}
        onScroll={e => {
          const y = e.nativeEvent.contentOffset.y;
          // Fäll ihop när man scrollat ner en bit, fäll ut nära toppen (hysteres).
          if (y > 80 && filtersOpen) setFiltersOpen(false);
          else if (y < 12 && !filtersOpen) setFiltersOpen(true);
        }}
        ListEmptyComponent={
          searchQuery || activeTags.size > 0 ? (
            <EmptyState
              icon="search-outline"
              title={str.emptyState.noResults}
              subtitle={searchQuery ? str.emptyState.noResultsFor(searchQuery) : str.emptyState.loosenFilter}
            />
          ) : (
            <EmptyState
              icon="book-outline"
              title={str.emptyState.title}
              subtitle={str.emptyState.subtitle}
              actionLabel={str.createModal.addButton}
              onAction={openModal}
            />
          )
        }
        renderItem={({ item }) => (
          <View style={s.cardWrap}>
            <Pressable
              style={s.card}
              onPress={() => {
                if (editMode) return;
                if (chooseMode) { openPlanFor(item); return; }
                if (selectionMode) { selectRecipeForMenu(item); return; }
                router.push(`/recipes/${item.id}` as never);
              }}
              onLongPress={() => { if (!selectionMode && !chooseMode) setEditMode(true); }}
            >
              <View style={s.cardIcon}>
                <Ionicons name="restaurant-outline" size={20} color={c.primary} />
              </View>
              <View style={s.cardContent}>
                <Text style={s.cardTitle}>{item.title}</Text>
                <Text style={s.cardMeta}>{str.card.meta(item.servings, item.ingredients.length)}</Text>
              </View>
              {selectionMode ? (
                <Ionicons name="add-circle" size={22} color={c.primary} />
              ) : chooseMode ? (
                // Hela kortet öppnar planerar-popupen — kalender-ikonen signalerar det.
                <Ionicons name="calendar-outline" size={20} color={c.primary} />
              ) : !editMode && (
                <Pressable style={s.addMenuBtn} onPress={() => {
                  const { weekYear, weekNumber } = getISOWeek(new Date());
                  setAddToMenuWeekStr(`${weekYear}-${String(weekNumber).padStart(2, '0')}`);
                  setAddToMenuFor(item);
                }} hitSlop={8} accessibilityLabel={str.createModal.addToMenu}>
                  <Ionicons name="calendar-outline" size={20} color={c.primary} />
                </Pressable>
              )}
              {!editMode && !selectionMode && !chooseMode && <Ionicons name="chevron-forward" size={18} color={c.border} />}
            </Pressable>
            {editMode && (
              <Pressable
                style={s.cardDeleteBtn}
                onPress={() =>
                  confirm({
                    title: str.delete.title,
                    message: str.delete.messageSimple(item.title),
                    buttons: [
                      { label: common.actions.delete, style: 'destructive', onPress: async () => {
                        try {
                          await client.deleteRecipe(item.id);
                          setRecipes(prev => prev.filter(r => r.id !== item.id));
                        } catch { confirm({ title: str.errors.generic, message: str.errors.couldNotDelete, buttons: [{ label: common.actions.ok }] }); }
                      }},
                      { label: common.actions.cancel, style: 'cancel' },
                    ],
                  })
                }
              >
                <Ionicons name="remove-circle" size={22} color={c.danger} />
              </Pressable>
            )}
          </View>
        )}
      />

      {editMode ? (
        <Pressable style={s.editDoneBtn} onPress={() => setEditMode(false)}>
          <Text style={s.editDoneBtnText}>{common.actions.done}</Text>
        </Pressable>
      ) : (
        <Pressable ref={fabRef} style={s.fab} onPress={openModal}>
          <Ionicons name="add" size={30} color="#fff" />
        </Pressable>
      )}

      {/* Samma mönster som "Ny butik"-modalen (fungerar på Android edge-to-edge +
          web): RN Modal + absolut heltäckande KAV + flex-end, och sheeten UTAN
          ScrollView (en ScrollView expanderar under behavior="height" → för hög). */}
      <Modal visible={showModal} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={closeCreate}>
        {/* overlayDim = dim-visual; overlay-Pressable (flex:1) = tryck-utanför-yta
            som fyller ovanför sheeten. Sheeten ligger i NORMALFLÖDE direkt efter
            (ingen absolut/KAV-wrapper som täcker overlayn → tryck-utanför funkar på
            web). Native-lyft via state-padding på sheet-behållaren (nollställs rent
            när tangentbordet stängs); web sköts av browserns viewport-resize. */}
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={closeCreate} />
        <View style={{ paddingBottom: sheetLift }}>
          {createSheetInner}
        </View>
      </Modal>

      {/* Quick add-to-menu week+day picker */}
      <Modal visible={!!addToMenuFor} transparent animationType="slide" onRequestClose={() => setAddToMenuFor(null)}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => setAddToMenuFor(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{str.menu.addToMenu}</Text>
          <Text style={s.daySheetSub} numberOfLines={1}>{addToMenuFor?.title}</Text>

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
                  const active = addToMenuWeekStr === weekKey;
                  const label = i === 0 ? str.menu.weekNow(weekNumber) : str.menu.weekLabel(weekNumber);
                  const sub = `${mon.getDate()}/${mon.getMonth() + 1}`;
                  return (
                    <Pressable key={weekKey} style={[s.weekChip, active && s.weekChipActive]} onPress={() => setAddToMenuWeekStr(weekKey)}>
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
              // Ingen grå-markering — visa middagen (annars första rätten) + "+N
              // rätter" om fler, så det får plats på en rad.
              const dayItems = addToMenuWeekItems.filter(m => m.day === d.key);
              return (
                <Pressable
                  key={d.key}
                  style={s.dayGridItem}
                  onPress={() => { if (addToMenuFor) addRecipeToMenu(addToMenuFor, d.key); }}
                >
                  <Text style={s.dayGridLabel}>{d.label}</Text>
                  {dayItems.length > 0 && (
                    <Text style={s.dayGridTakenHint} numberOfLines={1}>{dayItemsSummary(dayItems)}</Text>
                  )}
                </Pressable>
              );
            })}
            <Pressable
              style={[s.dayGridItem, s.dayGridItemNone]}
              onPress={() => { if (addToMenuFor) addRecipeToMenu(addToMenuFor, null); }}
            >
              <Ionicons name="calendar-clear-outline" size={18} color={c.primary} />
              <Text style={[s.dayGridLabel, s.dayGridLabelNone]}>{str.menu.noDay}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Sort options */}
      <Modal visible={showSort} transparent animationType="slide" onRequestClose={() => setShowSort(false)}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => setShowSort(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{str.sort.modalTitle}</Text>
          {([['name', str.sort.az], ['used', str.sort.popular], ['recent', str.sort.newest]] as const).map(([key, label]) => (
            <Pressable key={key} style={s.sortOption} onPress={() => chooseSort(key)}>
              <Ionicons name={sortMode === key ? 'radio-button-on' : 'radio-button-off'} size={22} color={sortMode === key ? c.primary : c.textFaint} />
              <Text style={s.sortOptionText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  subHeader: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle, gap: 12 },
  filtersCollapsed: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  filtersActiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.primary },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.inputBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  tagFilterBar: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  tagFilterScroll: { flexShrink: 1 },
  tagFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6 },
  tagFilterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: c.primaryTint, flexShrink: 0 },
  tagFilterChipActive: { backgroundColor: c.primary },
  tagFilterChipText: { fontSize: 12, fontWeight: '600', color: c.primary },
  tagFilterChipTextActive: { color: '#fff' },
  tagFilterClear: { paddingLeft: 8, paddingRight: 2 },
  sortBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.primaryTint, alignItems: 'center', justifyContent: 'center' },
  sortOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  sortOptionText: { fontSize: 16, color: c.text, fontWeight: '500' },
  searchIcon: { marginRight: 2 },
  searchInput: { flex: 1, fontSize: 15, color: c.text, padding: 0 },
  list: { padding: 16, gap: 2 },
  listEmpty: { flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#fde68a', padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.primaryTint, alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: c.text },
  cardMeta: { fontSize: 13, color: c.textMuted, marginTop: 2 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', shadowColor: c.primary, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  // Dim på eget absolut lager så det täcker bakom sheetens rundade hörn.
  overlay: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 0, gap: 14 },
  sheetScroll: { gap: 14, paddingBottom: 40 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.borderLight, alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: c.text },
  addMenuBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.primaryTint, alignItems: 'center', justifyContent: 'center' },
  selectBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.primaryTint, paddingHorizontal: 16, paddingVertical: 10 },
  selectBannerText: { fontSize: 14, fontWeight: '600', color: c.primary },
  daySheetSub: { fontSize: 13, color: c.textMuted, marginTop: -8 },
  dayGrid: { gap: 8, marginTop: 4 },
  dayGridItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: c.surfaceSubtle, borderRadius: 12 },
  dayGridItemTaken: { backgroundColor: c.background },
  dayGridItemNone: { backgroundColor: c.primaryTint, borderWidth: 1, borderColor: c.primary200, justifyContent: 'flex-start' },
  dayGridLabel: { fontSize: 15, fontWeight: '600', color: c.text },
  dayGridLabelTaken: { color: c.textFaint },
  dayGridTakenHint: { fontSize: 12, fontWeight: '600', color: c.textFaint, flexShrink: 1, marginLeft: 8, textAlign: 'right' },
  dayGridLabelNone: { color: c.primary },
  modeTabs: { flexDirection: 'row', backgroundColor: c.surfaceSubtle, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: c.border },
  modeTab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  modeTabActive: { backgroundColor: c.inputBg, borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  modeTabText: { fontSize: 14, fontWeight: '500', color: c.textMuted },
  modeTabTextActive: { color: c.text, fontWeight: '700' },
  modeBody: { minHeight: 246, gap: 14 },
  modeBodyBtn: { marginTop: 2 },
  input: { color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 14, fontSize: 16, backgroundColor: c.inputBg },
  createHint: { fontSize: 13, color: c.textFaint, marginTop: -4 },
  urlHint: { fontSize: 12, color: c.textFaint, marginTop: -6 },
  pasteHint: { fontSize: 13, color: c.textMuted, marginTop: -4, lineHeight: 18 },
  button: { backgroundColor: c.primary, borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cardWrap: { position: 'relative' },
  cardDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: c.surface, borderRadius: 11 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', backgroundColor: c.text, borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  weekChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.surfaceSubtle, borderWidth: 1, borderColor: c.borderLight, alignItems: 'center' },
  weekChipActive: { backgroundColor: c.primaryTint, borderColor: c.primary },
  weekChipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
  weekChipTextActive: { color: c.primary },
  weekChipSub: { fontSize: 11, color: c.textFaint, marginTop: 2 },
  weekChipSubActive: { color: c.primary400 },
});
