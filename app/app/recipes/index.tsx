import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from '../../src/lib/secureStorage';
import { useApiClient, type RecipeWithIngredients, type WeekMenuItemWithRecipe } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useFirstActionTip } from '../../src/hooks/useFirstActionTip';
import { EmptyState } from '../../src/components/EmptyState';
import { getISOWeek, addWeeks, getISOWeekMonday } from '../../src/lib/week';
import type { WeekDay } from '@veckis/shared';
import { kavBehavior } from '../../src/lib/platform';

const MENU_DAYS: { key: WeekDay; label: string }[] = [
  { key: 'mon', label: 'Måndag' },
  { key: 'tue', label: 'Tisdag' },
  { key: 'wed', label: 'Onsdag' },
  { key: 'thu', label: 'Torsdag' },
  { key: 'fri', label: 'Fredag' },
  { key: 'sat', label: 'Lördag' },
  { key: 'sun', label: 'Söndag' },
];

export default function RecipesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ create?: string; forMenuDay?: string; replaceMenuItemId?: string; replaceTitle?: string; forMenuWeek?: string }>();
  const createTriggeredRef = useRef(false);
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { showToast, showError } = useToast();
  const confirm = useConfirm();
  // Sort-tipset togs bort (#11 backloggen) — det fyrade bara om recept fanns,
  // och då behövde användaren ändå inte just det tipset. Ersatt med ett
  // action-tip på "+"-knappen som förklarar hur man skapar recept första gången.
  const wrapAddRecipeTip = useFirstActionTip('seen-recipe-add-tip');
  const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'name' | 'used' | 'recent'>('name');
  const [showSort, setShowSort] = useState(false);
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
  const [weekMenu, setWeekMenu] = useState<WeekMenuItemWithRecipe[]>([]);

  function addRecipeToMenu(recipe: RecipeWithIngredients, day: WeekDay | null) {
    setAddToMenuFor(null);
    if (!householdId) return;
    const todayW = getISOWeek(new Date());
    const [selY, selW] = addToMenuWeekStr.split('-').map(Number);
    const isCurrentWeek = selY === todayW.weekYear && selW === todayW.weekNumber;
    if (day && isCurrentWeek && weekMenu.some(m => m.day === day)) {
      const label = MENU_DAYS.find(d => d.key === day)?.label;
      confirm({
        title: 'Dag redan planerad',
        message: `${label} har redan en rätt denna vecka. Lägg till ändå?`,
        buttons: [
          { label: 'Lägg till', onPress: () => doAddToMenu(recipe, day) },
          { label: 'Avbryt', style: 'cancel' },
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
      const dayLabel = day ? MENU_DAYS.find(d => d.key === day)?.label.toLowerCase() : null;
      const todayW = getISOWeek(new Date());
      const weekLabel = weekYear === todayW.weekYear && weekNumber === todayW.weekNumber ? 'denna vecka' : `v.${weekNumber}`;
      showToast(dayLabel ? `${recipe.title} tillagd på ${dayLabel} (${weekLabel})` : `${recipe.title} tillagd i menyn (${weekLabel})`, 'success');
    } catch (e) {
      showError(e, 'Kunde inte lägga till i menyn');
    }
  }

  // Select mode — entered from the menu's "+" (pick a recipe for a day) or
  // "Byt ut" (replace a dish). Tapping a recipe routes back to the menu, which
  // applies it to the week it's showing.
  const replaceMode = params.replaceMenuItemId !== undefined;
  const selectionMode = params.forMenuDay !== undefined || replaceMode;
  const selectionDayLabel = params.forMenuDay && params.forMenuDay !== 'none'
    ? MENU_DAYS.find(d => d.key === params.forMenuDay)?.label
    : 'utan dag';

  // Carry the viewed week back so the dish lands there, not in the current week.
  const weekSuffix = params.forMenuWeek ? `&forMenuWeek=${params.forMenuWeek}` : '';

  function selectRecipeForMenu(recipe: RecipeWithIngredients) {
    if (replaceMode) {
      confirm({
        title: 'Byt ut rätt',
        message: `Ersätt "${params.replaceTitle ?? 'rätten'}" med "${recipe.title}"?`,
        buttons: [
          { label: 'Byt ut', style: 'destructive', onPress: () => router.replace(`/(tabs)/menu?addRecipeId=${recipe.id}&replaceMenuItemId=${params.replaceMenuItemId}${weekSuffix}` as never) },
          { label: 'Avbryt', style: 'cancel' },
        ],
      });
      return;
    }
    const day = params.forMenuDay === 'none' ? '' : (params.forMenuDay ?? '');
    router.replace(`/(tabs)/menu?addRecipeId=${recipe.id}&day=${day}${weekSuffix}` as never);
  }

  const filteredRecipes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const base = q
      ? recipes.filter(r =>
          r.title.toLowerCase().includes(q) ||
          r.ingredients.some(i => i.name.toLowerCase().includes(q)))
      : recipes;
    return [...base].sort((a, b) => {
      if (sortMode === 'used') return (b.timesUsed ?? 0) - (a.timesUsed ?? 0) || a.title.localeCompare(b.title);
      if (sortMode === 'recent') return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      return a.title.localeCompare(b.title);
    });
  }, [recipes, searchQuery, sortMode]);

  // New recipe form
  const [mode, setMode] = useState<'manual' | 'url'>('manual');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
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
      confirm({ title: 'Fel', message: 'Kunde inte ladda recept', buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); return () => setEditMode(false); }, [load]));

  async function handleScrape() {
    if (!url.trim()) return;
    const normalizedUrl = url.trim().replace(/\/$/, '');
    const existing = recipes.find(r => r.sourceUrl?.replace(/\/$/, '') === normalizedUrl);
    if (existing) {
      confirm({
        title: 'Recept finns redan',
        message: `"${existing.title}" har redan hämtats från den här URL:en.`,
        buttons: [
          { label: 'Öppna receptet', onPress: () => { setShowModal(false); router.push(`/recipes/${existing.id}` as never); } },
          { label: 'Avbryt', style: 'cancel' },
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
        confirm({ title: 'Inga ingredienser hittades', message: 'Receptet skapades men vi kunde inte läsa ingredienserna. Lägg till dem manuellt.', buttons: [{ label: 'OK' }] });
        router.push(`/recipes/${recipe.id}?edit=1` as never);
      } else {
        router.push(`/recipes/${recipe.id}` as never);
      }
    } catch (err) {
      // Scrape failed (no recipe data, fetch error, timeout…) — don't dead-end;
      // offer to add the recipe manually instead.
      confirm({
        title: 'Kunde inte läsa receptet',
        message: `${err instanceof Error ? err.message : 'Länken gick inte att läsa'}\n\nVill du lägga till receptet manuellt istället?`,
        buttons: [
          { label: 'Lägg till manuellt', onPress: () => setMode('manual') },
          { label: 'Avbryt', style: 'cancel' },
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
        servings: parsed.servings,
        ingredients: parsed.ingredients.map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
      });
      setRecipes(prev => [...prev, recipe].sort((a, b) => a.title.localeCompare(b.title)));
      setShowModal(false);
      setTitle('');
      setPasteText('');
      setShowPaste(false);
      const forMenuDay = params.forMenuDay;
      const suffix = (forMenuDay !== undefined ? `&forMenuDay=${forMenuDay}` : '') + weekSuffix;
      router.push(`/recipes/${recipe.id}${parsed.ingredients.length === 0 ? '?edit=1' : ''}${suffix}` as never);
    } catch (err) {
      confirm({ title: 'Fel', message: err instanceof Error ? err.message : 'Kunde inte tolka receptet', buttons: [{ label: 'OK' }] });
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
      confirm({ title: 'Fel', message: 'Kunde inte skapa recept', buttons: [{ label: 'OK' }] });
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
    setMode('manual');
    setTitle('');
    setUrl('');
    setShowModal(true);
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="arrow-back" size={26} color="#111827" />
            </Pressable>
            <Text style={s.title}>Recept</Text>
          </View>
          <Pressable onPress={() => setShowSort(true)} hitSlop={8} style={s.sortBtn} accessibilityLabel="Sortera recept">
            <Ionicons name="swap-vertical" size={18} color="#4f46e5" />
          </Pressable>
        </View>
        <View style={s.searchRow}>
          <Ionicons name="search" size={16} color="#9ca3af" style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            placeholder="Sök på namn eller ingrediens…"
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Rensa sökning">
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </Pressable>
          )}
        </View>
      </View>

      {selectionMode && (
        <View style={s.selectBanner}>
          <Ionicons name="restaurant-outline" size={16} color="#4f46e5" />
          <Text style={s.selectBannerText} numberOfLines={1}>
            {replaceMode ? `Byt ut · ${params.replaceTitle ?? ''}` : `Välj en rätt · ${selectionDayLabel}`}
          </Text>
        </View>
      )}

      <FlatList
        data={filteredRecipes}
        keyExtractor={r => r.id}
        contentContainerStyle={[s.list, filteredRecipes.length === 0 && s.listEmpty]}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          searchQuery ? (
            <EmptyState
              icon="search-outline"
              title="Inga träffar"
              subtitle={`Inget recept matchar "${searchQuery}"`}
            />
          ) : (
            <EmptyState
              icon="book-outline"
              title="Inga recept än"
              subtitle="Lägg till ett recept manuellt eller via en URL."
              actionLabel="Nytt recept"
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
                if (selectionMode) { selectRecipeForMenu(item); return; }
                router.push(`/recipes/${item.id}` as never);
              }}
              onLongPress={() => { if (!selectionMode) setEditMode(true); }}
            >
              <View style={s.cardIcon}>
                <Ionicons name="restaurant-outline" size={20} color="#4f46e5" />
              </View>
              <View style={s.cardContent}>
                <Text style={s.cardTitle}>{item.title}</Text>
                <Text style={s.cardMeta}>{item.servings} port · {item.ingredients.length} ingredienser</Text>
              </View>
              {selectionMode ? (
                <Ionicons name="add-circle" size={22} color="#4f46e5" />
              ) : !editMode && (
                <Pressable style={s.addMenuBtn} onPress={() => {
                  const { weekYear, weekNumber } = getISOWeek(new Date());
                  setAddToMenuWeekStr(`${weekYear}-${String(weekNumber).padStart(2, '0')}`);
                  setAddToMenuFor(item);
                }} hitSlop={8} accessibilityLabel="Lägg till i meny">
                  <Ionicons name="calendar-outline" size={20} color="#4f46e5" />
                </Pressable>
              )}
              {!editMode && !selectionMode && <Ionicons name="chevron-forward" size={18} color="#d1d5db" />}
            </Pressable>
            {editMode && (
              <Pressable
                style={s.cardDeleteBtn}
                onPress={() =>
                  confirm({
                    title: 'Ta bort recept',
                    message: `Ta bort "${item.title}"?`,
                    buttons: [
                      { label: 'Ta bort', style: 'destructive', onPress: async () => {
                        try {
                          await client.deleteRecipe(item.id);
                          setRecipes(prev => prev.filter(r => r.id !== item.id));
                        } catch { confirm({ title: 'Fel', message: 'Kunde inte ta bort receptet', buttons: [{ label: 'OK' }] }); }
                      }},
                      { label: 'Avbryt', style: 'cancel' },
                    ],
                  })
                }
              >
                <Ionicons name="remove-circle" size={22} color="#ef4444" />
              </Pressable>
            )}
          </View>
        )}
      />

      {editMode ? (
        <Pressable style={s.editDoneBtn} onPress={() => setEditMode(false)}>
          <Text style={s.editDoneBtnText}>Klar</Text>
        </Pressable>
      ) : (
        <Pressable style={s.fab} onPress={wrapAddRecipeTip(
          openModal,
          { title: 'Skapa recept', message: 'Lägg till ett recept manuellt eller importera direkt från en webbsida — klistra bara in URL:en så hämtar appen titel, ingredienser, bild och instruktioner automatiskt.' },
        )}>
          <Ionicons name="add" size={30} color="#fff" />
        </Pressable>
      )}

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => { setShowModal(false); setPasteText(''); setShowPaste(false); }}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => { setShowModal(false); setPasteText(''); setShowPaste(false); }} />
        <KeyboardAvoidingView behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Nytt recept</Text>

          <View style={s.modeTabs}>
            <Pressable style={[s.modeTab, mode === 'manual' && s.modeTabActive]} onPress={() => setMode('manual')}>
              <Text style={[s.modeTabText, mode === 'manual' && s.modeTabTextActive]}>Manuellt</Text>
            </Pressable>
            <Pressable style={[s.modeTab, mode === 'url' && s.modeTabActive]} onPress={() => setMode('url')}>
              <Text style={[s.modeTabText, mode === 'url' && s.modeTabTextActive]}>Från URL</Text>
            </Pressable>
          </View>

          {mode === 'manual' ? (
            <>
              <TextInput
                style={s.input}
                placeholder="Receptets namn (valfritt om du klistrar in)"
                placeholderTextColor="#9ca3af"
                value={title}
                onChangeText={setTitle}
                autoFocus={!showPaste}
                returnKeyType="done"
                onSubmitEditing={showPaste ? undefined : handleCreateManual}
              />
              <Pressable style={s.pasteToggle} onPress={() => { setShowPaste(p => !p); setPasteText(''); }}>
                <Ionicons name={showPaste ? 'chevron-down' : 'clipboard-outline'} size={14} color="#6b7280" />
                <Text style={s.pasteToggleText}>{showPaste ? 'Dölj recepttext' : 'Klistra in recepttext (AI tolkar)'}</Text>
              </Pressable>
              {showPaste ? (
                <>
                  <TextInput
                    style={[s.input, { height: 160, textAlignVertical: 'top', paddingTop: 10 }]}
                    placeholder={"Klistra in recept, ingredienslista eller hela receptsidan här — AI:n plockar ut titel, ingredienser och tillvägagångssätt automatiskt."}
                    placeholderTextColor="#9ca3af"
                    value={pasteText}
                    onChangeText={setPasteText}
                    multiline
                    scrollEnabled
                    autoFocus
                  />
                  <Pressable
                    style={[s.button, !pasteText.trim() && s.buttonDisabled]}
                    onPress={handleParseAndCreate}
                    disabled={parsing || creating || !pasteText.trim()}
                  >
                    {parsing || creating ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Tolka och skapa recept</Text>}
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={s.createHint}>Du fyller i beskrivning, ingredienser och instruktioner i nästa steg.</Text>
                  <Pressable
                    style={[s.button, !title.trim() && s.buttonDisabled]}
                    onPress={handleCreateManual}
                    disabled={creating || !title.trim()}
                  >
                    {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Skapa recept</Text>}
                  </Pressable>
                </>
              )}
            </>
          ) : (
            <>
              <TextInput
                style={s.input}
                placeholder="https://tasteline.com/recept/..."
                placeholderTextColor="#9ca3af"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                keyboardType="url"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleScrape}
              />
              <Text style={s.urlHint}>Fungerar med de flesta receptsajter (ICA, Arla, Tasteline, m.fl.)</Text>
              <Pressable
                style={[s.button, !url.trim() && s.buttonDisabled]}
                onPress={handleScrape}
                disabled={scraping || creating || !url.trim()}
              >
                {scraping || creating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.buttonText}>Hämta recept</Text>}
              </Pressable>
            </>
          )}
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Quick add-to-menu week+day picker */}
      <Modal visible={!!addToMenuFor} transparent animationType="slide" onRequestClose={() => setAddToMenuFor(null)}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => setAddToMenuFor(null)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Lägg till i meny</Text>
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
                  const str = `${weekYear}-${String(weekNumber).padStart(2, '0')}`;
                  const active = addToMenuWeekStr === str;
                  const label = i === 0 ? `v.${weekNumber} · nu` : `v.${weekNumber}`;
                  const sub = `${mon.getDate()}/${mon.getMonth() + 1}`;
                  return (
                    <Pressable key={str} style={[s.weekChip, active && s.weekChipActive]} onPress={() => setAddToMenuWeekStr(str)}>
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
              const todayW = getISOWeek(new Date());
              const [selY, selW] = addToMenuWeekStr.split('-').map(Number);
              const isCurrentWeek = selY === todayW.weekYear && selW === todayW.weekNumber;
              const taken = isCurrentWeek && weekMenu.some(m => m.day === d.key);
              return (
                <Pressable
                  key={d.key}
                  style={[s.dayGridItem, taken && s.dayGridItemTaken]}
                  onPress={() => { if (addToMenuFor) addRecipeToMenu(addToMenuFor, d.key); }}
                >
                  <Text style={[s.dayGridLabel, taken && s.dayGridLabelTaken]}>{d.label}</Text>
                  {taken && <Text style={s.dayGridTakenHint}>Planerad</Text>}
                </Pressable>
              );
            })}
            <Pressable
              style={[s.dayGridItem, s.dayGridItemNone]}
              onPress={() => { if (addToMenuFor) addRecipeToMenu(addToMenuFor, null); }}
            >
              <Ionicons name="calendar-clear-outline" size={18} color="#4f46e5" />
              <Text style={[s.dayGridLabel, s.dayGridLabelNone]}>Lägg till utan dag</Text>
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
          <Text style={s.sheetTitle}>Sortera recept</Text>
          {([['name', 'A–Ö'], ['used', 'Mest använda'], ['recent', 'Senast tillagda']] as const).map(([key, label]) => (
            <Pressable key={key} style={s.sortOption} onPress={() => chooseSort(key)}>
              <Ionicons name={sortMode === key ? 'radio-button-on' : 'radio-button-off'} size={22} color={sortMode === key ? '#4f46e5' : '#9ca3af'} />
              <Text style={s.sortOptionText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  sortBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  sortOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  sortOptionText: { fontSize: 16, color: '#111827', fontWeight: '500' },
  searchIcon: { marginRight: 2 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', padding: 0 },
  list: { padding: 16, gap: 10 },
  listEmpty: { flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#fde68a', padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardMeta: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  // Dim på eget absolut lager så det täcker bakom sheetens rundade hörn.
  overlay: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 14 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  addMenuBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  selectBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eef2ff', paddingHorizontal: 16, paddingVertical: 10 },
  selectBannerText: { fontSize: 14, fontWeight: '600', color: '#4f46e5' },
  daySheetSub: { fontSize: 13, color: '#6b7280', marginTop: -8 },
  dayGrid: { gap: 8, marginTop: 4 },
  dayGridItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#f3f4f6', borderRadius: 12 },
  dayGridItemTaken: { backgroundColor: '#fafafa' },
  dayGridItemNone: { backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#c7d2fe', justifyContent: 'flex-start' },
  dayGridLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  dayGridLabelTaken: { color: '#9ca3af' },
  dayGridTakenHint: { fontSize: 12, fontWeight: '600', color: '#f59e0b' },
  dayGridLabelNone: { color: '#4f46e5' },
  modeTabs: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 10, padding: 4 },
  modeTab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  modeTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  modeTabText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
  modeTabTextActive: { color: '#111827' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 16, backgroundColor: '#f9fafb' },
  createHint: { fontSize: 13, color: '#9ca3af', marginTop: -4 },
  urlHint: { fontSize: 12, color: '#9ca3af', marginTop: -6 },
  pasteToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginBottom: 4 },
  pasteToggleText: { fontSize: 13, color: '#6b7280' },
  button: { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cardWrap: { position: 'relative' },
  cardDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: '#fff', borderRadius: 11 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', backgroundColor: '#111827', borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  weekChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  weekChipActive: { backgroundColor: '#eef2ff', borderColor: '#4f46e5' },
  weekChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  weekChipTextActive: { color: '#4f46e5' },
  weekChipSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  weekChipSubActive: { color: '#818cf8' },
});
