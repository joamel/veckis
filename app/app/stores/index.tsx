import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../../src/context/ThemeContext';
import type { Palette } from '../../src/lib/theme';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { resolveStorePick, hasPendingStorePick } from '../../src/lib/storePicker';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { EmptyState } from '../../src/components/EmptyState';
import { DraggableBottomSheet } from '../../src/components/DraggableBottomSheet';
import { useSheetLift } from '../../src/hooks/useSheetLift';
import { type Store, type StoreCategory } from '@veckis/shared';
import { stores as str, common, gettingStarted } from '../../src/lib/svenska';
import { useSpotlightTip } from '../../src/context/SpotlightTipContext';
import { consumeSpotlight } from '../../src/lib/spotlightRequest';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useDiscardDraft } from '../../src/hooks/useDiscardDraft';
import { useDesign } from '../../src/context/DesignContext';
import { nyFont, type NyPalett } from '../../src/lib/nyDesign';
import { NyHeader, NyIkonKnapp } from '../../src/components/nydesign/NyHeader';

type SortMode = 'name' | 'created';

export default function StoresScreen() {
  const { colors: c, ny } = useTheme();
  const { nyDesign } = useDesign();
  const s = useMemo(() => makeStyles(c, nyDesign, ny), [c, nyDesign, ny]);
  const router = useRouter();
  const { pick, current } = useLocalSearchParams<{ pick?: string; current?: string }>();
  // pick=1 → kort-tap returnerar valt butik-id istället för att navigera in.
  // current=<storeId> markerar den nuvarande butiken som vald (purple ring +
  // X-knapp för att rensa). Om användaren backar utan val resolveras med
  // 'cancelled' via useEffect-cleanup.
  const pickMode = pick === '1' && hasPendingStorePick();
  const currentStoreId = pickMode ? (current ?? null) : null;
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { showError, showToast } = useToast();
  const confirm = useConfirm();
  const tryCloseCreate = useDiscardDraft(confirm);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('name');

  // Popup förankrad vid sorteringsknappen i headern — samma beteende som
  // receptlistans sortering, i stället för en sheet nerifrån.
  function openSortMenu() {
    confirm({
      variant: 'menu',
      buttons: [
        ...([['name', str.sort.az], ['created', str.sort.addedOrder]] as const).map(([v, label]) => ({
          label,
          icon: sortMode === v ? 'radio-button-on' : 'radio-button-off',
          onPress: () => setSortMode(v),
        })),
        { label: common.actions.cancel, style: 'cancel' as const },
      ],
    });
  }
  // Pick-läge: tapp MARKERAR butiken (highlight) men byter inte förrän man
  // trycker Spara — så man inte råkar byta av misstag. Init till nuvarande butik.
  const [chosenId, setChosenId] = useState<string | null>(currentStoreId);

  // Skapa-modal
  const [showCreate, setShowCreate] = useState(false);
  // Samma lyft-teknik som övriga ark med textfält: mät fältet och lyft precis
  // så mycket att det syns. KeyboardAvoidingView krympte i stället hela arket
  // och lämnade ett tomrum när tangentbordet stängdes.
  const { sheetLift, onFocusInput } = useSheetLift();
  const newStoreRef = useRef<TextInput>(null);
  const [newStoreName, setNewStoreName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const list = await client.getStores(householdId);
      setStores(list);
    } catch (e) {
      showError(e, str.toasts.errorLoad('butiker'));
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  const showTip = useSpotlightTip();
  const storeFabRef = useRef<View>(null);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Kom igång-kortet: tänd spotlight på "Ny butik"-FAB om det begärts (opt-in).
  useFocusEffect(useCallback(() => {
    if (loading) return;
    if (!consumeSpotlight('gs-store')) return;
    showTip({ title: gettingStarted.spotlight.store.title, message: gettingStarted.spotlight.store.message, targetRef: storeFabRef });
  }, [loading, showTip]));
  useEffect(() => { load(); }, [load]);

  // Pick-mode: om användaren backar utan att välja resolveras 'cancelled'
  // så caller:n vet att den ska låta listans nuvarande butik vara.
  useEffect(() => {
    if (!pickMode) return;
    return () => { if (hasPendingStorePick()) resolveStorePick('cancelled'); };
  }, [pickMode]);

  const filteredSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q ? stores.filter(s => s.name.toLowerCase().includes(q)) : stores;
    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name, 'sv');
      // 'created' = originalordning (API returnerar createdAt asc)
      return 0;
    });
    return sorted;
  }, [stores, searchQuery, sortMode]);

  const creatingRef = useRef(false);
  async function createStore() {
    // Synkron spärr — React-statet `creating` kan hinna släpa ett par renders
    // efter första trycket, så ett snabbt andra tryck (t.ex. både Enter på
    // tangentbordet och knappen) kunde smita igenom och skapa en dubblett.
    if (!householdId || !newStoreName.trim() || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const store = await client.createStore({ householdId, name: newStoreName.trim() });
      setStores(prev => [...prev, store]);
      setNewStoreName('');
      setShowCreate(false);
      showToast(str.toasts.created(store.name), 'success');
      if (pickMode) {
        // Inne i pick-läget = användaren ville välja butik; den nyskapade
        // markeras direkt och vi backar.
        resolveStorePick(store.id);
        router.back();
      } else {
        // Annars öppna direkt i detail-vyn så användaren kan ställa
        // kategori-ordningen.
        router.push(`/stores/${store.id}` as never);
      }
    } catch (e) {
      showError(e, str.toasts.errorCreate);
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>;
  }

  return (
    <SafeAreaView style={s.container} edges={nyDesign ? ['top', 'left', 'right'] : undefined}>
      {nyDesign ? (
        <NyHeader
          title={str.title}
          onBack={() => router.back()}
          right={<NyIkonKnapp icon="swap-vertical" onPress={openSortMenu} label={str.sort.a11y} size={18} />}
        >
          <View style={s.nySok}>
            <Ionicons name="search" size={16} color={ny.underrubrik} />
            <TextInput
              style={s.nySokInput}
              placeholder={str.search.placeholder}
              placeholderTextColor={ny.underrubrik}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={common.actions.clearSearch}>
                <Ionicons name="close-circle" size={16} color={ny.underrubrik} />
              </Pressable>
            )}
          </View>
        </NyHeader>
      ) : (
      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="arrow-back" size={26} color={c.text} />
            </Pressable>
            <Text style={s.title}>{str.title}</Text>
          </View>
          <Pressable onPress={openSortMenu} hitSlop={8} style={s.sortBtn} accessibilityLabel={str.sort.a11y}>
            <Ionicons name="swap-vertical" size={18} color={c.primary} />
          </Pressable>
        </View>
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
        </View>
      </View>
      )}

      <ScrollView style={s.innehall} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: nyDesign ? 16 : 12, paddingBottom: 120 }}>
        {filteredSorted.length === 0 ? (
          searchQuery ? (
            <Text style={s.empty}>{str.emptyState.noResults(searchQuery)}</Text>
          ) : (
            <EmptyState
              icon="storefront-outline"
              title={str.emptyState.title}
              subtitle={str.emptyState.subtitle}
              actionLabel={str.emptyState.cta}
              onAction={() => setShowCreate(true)}
            />
          )
        ) : (
          filteredSorted.map((store, idx) => {
            const catCount = (store.categoryOrder as StoreCategory[]).length || 0;
            // Varannan bricka mörk, varannan ljus — samma rytm som medlemslistan.
            const morkBricka = nyDesign && idx % 2 === 0;
            // Highlight/bock = MARKERAD (pending) butik. "Nuvarande"-etiketten
            // ligger kvar på den faktiskt SPARADE butiken så man vet vilken man
            // har om man avbryter.
            const isChosen = pickMode && store.id === chosenId;
            const isCurrent = pickMode && store.id === currentStoreId;
            return (
              <Pressable
                key={store.id}
                style={[s.card, isChosen && s.cardCurrent]}
                onPress={() => {
                  if (pickMode) {
                    setChosenId(store.id); // markera — byte sker först vid Spara
                  } else {
                    router.push(`/stores/${store.id}` as never);
                  }
                }}
              >
                <View style={[s.cardIcon, morkBricka && s.nyBrickaMork, isChosen && s.cardIconCurrent]}>
                  <Ionicons
                    name="storefront-outline"
                    size={20}
                    color={isChosen ? c.accent : (nyDesign ? (morkBricka ? ny.lime : ny.padYta) : c.primary)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, isChosen && s.cardTitleCurrent]}>{store.name}</Text>
                  {(() => {
                    const parts: string[] = [];
                    if (catCount > 0) parts.push(str.card.categories(catCount));
                    if (isCurrent) parts.push(str.card.current);
                    return parts.length > 0 ? <Text style={[s.cardMeta, isCurrent && s.cardMetaCurrent]}>{parts.join(' · ')}</Text> : null;
                  })()}
                </View>
                {isChosen ? (
                  <Ionicons name="checkmark-circle" size={22} color={c.primary} />
                ) : !pickMode ? (
                  <Ionicons name="chevron-forward" size={18} color={c.border} />
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {!pickMode && (
        <Pressable ref={storeFabRef} style={s.fab} onPress={() => setShowCreate(true)} accessibilityLabel={str.createModal.add}>
          <Ionicons name="add" size={30} color={nyDesign ? ny.skog : '#fff'} />
        </Pressable>
      )}

      {/* Pick-läge: markera butik i listan, byt först vid Spara. */}
      {pickMode && (
        <View style={s.saveBar}>
          <Pressable onPress={() => setChosenId(null)} hitSlop={8} style={s.noStoreBtn}>
            <Ionicons
              name={chosenId === null ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={chosenId === null ? c.primary : c.textFaint}
            />
            <Text style={[s.noStoreText, chosenId === null && s.noStoreTextActive]}>{str.pick.noStore}</Text>
          </Pressable>
          <Pressable style={s.saveBar_btn} onPress={() => { resolveStorePick(chosenId); router.back(); }}>
            <Text style={s.saveBar_btnText}>{common.actions.save}</Text>
          </Pressable>
        </View>
      )}

      {/* Skapa-modal */}
      <DraggableBottomSheet
        visible={showCreate}
        onRequestClose={() => tryCloseCreate(newStoreName.trim() !== '', () => { setShowCreate(false); setNewStoreName(''); })}
        liftOffset={sheetLift}
        title={str.createModal.title}
      >
        <TextInput
          ref={newStoreRef}
          onFocus={onFocusInput(newStoreRef)}
          style={s.input}
          placeholder={str.createModal.placeholder}
          placeholderTextColor={c.textFaint}
          value={newStoreName}
          onChangeText={setNewStoreName}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={createStore}
        />
        <Pressable
          style={[s.primaryBtn, (!newStoreName.trim() || creating) && { opacity: 0.4 }]}
          onPress={createStore}
          disabled={creating || !newStoreName.trim()}
        >
          {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{str.createModal.create}</Text>}
        </Pressable>
      </DraggableBottomSheet>

    </SafeAreaView>
  );
}

// nyD: den nya designen (beta) skriver över de stilar som skiljer.
const makeStyles = (c: Palette, nyD: boolean, ny: NyPalett) => StyleSheet.create({
  container: { flex: 1, backgroundColor: nyD ? ny.skog : c.background },
  innehall: nyD ? { backgroundColor: ny.bakgrund } : {},
  nyBrickaMork: { backgroundColor: ny.valdYta },
  nySok: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, marginTop: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: ny.glasSvag },
  nySokInput: { flex: 1, fontSize: 15, color: ny.rubrikLjus, padding: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background },
  header: { backgroundColor: c.surface, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '700', color: c.text },
  sortBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primaryTint },
  clearBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.dangerTint },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.inputBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  searchIcon: {},
  searchInput: { flex: 1, fontSize: 15, color: c.text, paddingVertical: 4 },
  empty: { textAlign: 'center', color: c.textFaint, marginTop: 40 },
  card: nyD
    ? { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: ny.kort, borderRadius: 18, padding: 12, marginBottom: 10, borderWidth: 2, borderColor: 'transparent' }
    : { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 2, borderWidth: 1, borderColor: c.surfaceSubtle },
  cardCurrent: { borderColor: c.primary, backgroundColor: c.primaryTint, borderWidth: 2 },
  cardIcon: nyD
    ? { width: 44, height: 44, borderRadius: 13, backgroundColor: ny.bricka, alignItems: 'center', justifyContent: 'center' }
    : { width: 36, height: 36, borderRadius: 10, backgroundColor: c.primaryTint, alignItems: 'center', justifyContent: 'center' },
  cardIconCurrent: { backgroundColor: c.accent100 },
  cardTitle: nyD
    ? { fontFamily: nyFont.fet, fontSize: 17, letterSpacing: -0.3, color: ny.text }
    : { fontSize: 16, fontWeight: '600', color: c.text },
  cardTitleCurrent: { color: c.accentDark },
  cardMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  cardMetaCurrent: { color: c.accent, fontWeight: '600' },
  cardClearBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.dangerTint },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: nyD ? ny.lime : c.primary, alignItems: 'center', justifyContent: 'center', shadowColor: nyD ? ny.skog : c.primary, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  input: { borderWidth: 1, borderColor: ny.kontur, borderRadius: 14, backgroundColor: ny.bakgrund, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, color: ny.text },
  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.surfaceSubtle },
  noStoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noStoreText: { fontSize: 14, color: c.textMuted, fontWeight: '500' },
  noStoreTextActive: { color: c.primary, fontWeight: '600' },
  saveBar_btn: { backgroundColor: nyD ? ny.lime : c.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  saveBar_btnText: { color: nyD ? ny.skog : '#fff', fontSize: 15, fontWeight: '700' },
  primaryBtn: { backgroundColor: ny.lime, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: ny.skog, fontSize: 15, fontWeight: '700' },
});
