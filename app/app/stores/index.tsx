import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { resolveStorePick, hasPendingStorePick } from '../../src/lib/storePicker';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { EmptyState } from '../../src/components/EmptyState';
import { type Store, type StoreCategory } from '@veckis/shared';
import { kavBehavior } from '../../src/lib/platform';
import { stores as str, common } from '../../src/lib/svenska';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useDiscardDraft } from '../../src/hooks/useDiscardDraft';

type SortMode = 'name' | 'created';

export default function StoresScreen() {
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
  const [showSort, setShowSort] = useState(false);

  // Skapa-modal
  const [showCreate, setShowCreate] = useState(false);
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

  useFocusEffect(useCallback(() => { load(); }, [load]));
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

  async function createStore() {
    if (!householdId || !newStoreName.trim()) return;
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
      setCreating(false);
    }
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4e7a5e" /></View>;
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="arrow-back" size={26} color="#292524" />
            </Pressable>
            <Text style={s.title}>{str.title}</Text>
          </View>
          <Pressable onPress={() => setShowSort(true)} hitSlop={8} style={s.sortBtn} accessibilityLabel={str.sort.a11y}>
            <Ionicons name="swap-vertical" size={18} color="#4e7a5e" />
          </Pressable>
        </View>
        <View style={s.searchRow}>
          <Ionicons name="search" size={16} color="#a8a29e" style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            placeholder={str.search.placeholder}
            placeholderTextColor="#a8a29e"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityRole="button" accessibilityLabel={common.actions.clearSearch}>
              <Ionicons name="close-circle" size={16} color="#a8a29e" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 }}>
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
          filteredSorted.map(store => {
            const catCount = (store.categoryOrder as StoreCategory[]).length || 0;
            const isCurrent = pickMode && store.id === currentStoreId;
            return (
              <Pressable
                key={store.id}
                style={[s.card, isCurrent && s.cardCurrent]}
                onPress={() => {
                  if (pickMode) {
                    resolveStorePick(store.id);
                    router.back();
                  } else {
                    router.push(`/stores/${store.id}` as never);
                  }
                }}
              >
                <View style={[s.cardIcon, isCurrent && s.cardIconCurrent]}>
                  <Ionicons name="storefront-outline" size={20} color={isCurrent ? '#b96a45' : '#4e7a5e'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, isCurrent && s.cardTitleCurrent]}>{store.name}</Text>
                  {(() => {
                    const parts: string[] = [];
                    if (catCount > 0) parts.push(str.card.categories(catCount));
                    if (isCurrent) parts.push(str.card.selected);
                    return parts.length > 0 ? <Text style={[s.cardMeta, isCurrent && s.cardMetaCurrent]}>{parts.join(' · ')}</Text> : null;
                  })()}
                </View>
                {isCurrent ? (
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); resolveStorePick(null); router.back(); }}
                    hitSlop={10}
                    style={s.cardClearBtn}
                    accessibilityLabel={str.card.clearA11y}
                  >
                    <Ionicons name="close" size={18} color="#ef4444" />
                  </Pressable>
                ) : !pickMode ? (
                  <Ionicons name="chevron-forward" size={18} color="#d6d3d1" />
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Pressable style={s.fab} onPress={() => setShowCreate(true)} accessibilityLabel={str.createModal.add}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      {/* Skapa-modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => tryCloseCreate(newStoreName.trim() !== '', () => { setShowCreate(false); setNewStoreName(''); })}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => tryCloseCreate(newStoreName.trim() !== '', () => { setShowCreate(false); setNewStoreName(''); })} />
        <KeyboardAvoidingView behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{str.createModal.title}</Text>
            <TextInput
              style={s.input}
              placeholder={str.createModal.placeholder}
              placeholderTextColor="#a8a29e"
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
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Sort-modal */}
      <Modal visible={showSort} transparent animationType="slide" onRequestClose={() => setShowSort(false)}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => setShowSort(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{str.sort.modalTitle}</Text>
          {[
            { v: 'name' as const, label: str.sort.az },
            { v: 'created' as const, label: str.sort.addedOrder },
          ].map(o => (
            <Pressable
              key={o.v}
              style={s.sortRow}
              onPress={() => { setSortMode(o.v); setShowSort(false); }}
            >
              <Text style={s.sortRowText}>{o.label}</Text>
              {sortMode === o.v && <Ionicons name="checkmark" size={20} color="#4e7a5e" />}
            </Pressable>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf8f3' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf8f3' },
  header: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f1efec', gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '700', color: '#292524' },
  sortBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ecf3ec' },
  clearBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f2' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f1efec', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  searchIcon: {},
  searchInput: { flex: 1, fontSize: 15, color: '#292524', paddingVertical: 4 },
  empty: { textAlign: 'center', color: '#a8a29e', marginTop: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 2, borderWidth: 1, borderColor: '#f1efec' },
  cardCurrent: { borderColor: '#d29a77', backgroundColor: '#faf1e9', borderWidth: 2 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#ecf3ec', alignItems: 'center', justifyContent: 'center' },
  cardIconCurrent: { backgroundColor: '#f6e8dc' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#292524' },
  cardTitleCurrent: { color: '#8f4b2c' },
  cardMeta: { fontSize: 12, color: '#78716c', marginTop: 2 },
  cardMetaCurrent: { color: '#b96a45', fontWeight: '600' },
  cardClearBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f2' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4e7a5e', alignItems: 'center', justifyContent: 'center', shadowColor: '#4e7a5e', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  // flex:1 (inte absolut) så den transparenta Pressablen puttar ner sheeten till
  // botten; dim ligger på eget absolut lager (overlayDim) bakom de rundade hörnen.
  overlay: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#d6d3d1', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#292524', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e7e5e4', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, color: '#292524' },
  primaryBtn: { backgroundColor: '#4e7a5e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sortRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f1efec' },
  sortRowText: { fontSize: 15, color: '#292524', fontWeight: '500' },
});
