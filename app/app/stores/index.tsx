import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
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
      showError(e, 'Kunde inte ladda butiker');
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
      showToast(`${store.name} skapad`, 'success');
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
      showError(e, 'Kunde inte skapa butik');
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="arrow-back" size={26} color="#111827" />
            </Pressable>
            <Text style={s.title}>Butiker</Text>
          </View>
          <Pressable onPress={() => setShowSort(true)} hitSlop={8} style={s.sortBtn} accessibilityLabel="Sortera butiker">
            <Ionicons name="swap-vertical" size={18} color="#4f46e5" />
          </Pressable>
        </View>
        <View style={s.searchRow}>
          <Ionicons name="search" size={16} color="#9ca3af" style={s.searchIcon} />
          <TextInput
            style={s.searchInput}
            placeholder="Sök butik…"
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 }}>
        {filteredSorted.length === 0 ? (
          searchQuery ? (
            <Text style={s.empty}>Inga butiker matchar "{searchQuery}"</Text>
          ) : (
            <EmptyState
              icon="storefront-outline"
              title="Inga butiker än"
              subtitle="Lägg till en butik så kan dina inköpslistor sorteras efter butikens layout."
              actionLabel="Lägg till butik"
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
                  <Ionicons name="storefront-outline" size={20} color={isCurrent ? '#7c3aed' : '#4f46e5'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, isCurrent && s.cardTitleCurrent]}>{store.name}</Text>
                  {(() => {
                    const parts: string[] = [];
                    if (catCount > 0) parts.push(`${catCount} kategorier`);
                    if (isCurrent) parts.push('vald');
                    return parts.length > 0 ? <Text style={[s.cardMeta, isCurrent && s.cardMetaCurrent]}>{parts.join(' · ')}</Text> : null;
                  })()}
                </View>
                {isCurrent ? (
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); resolveStorePick(null); router.back(); }}
                    hitSlop={10}
                    style={s.cardClearBtn}
                    accessibilityLabel="Rensa butik"
                  >
                    <Ionicons name="close" size={18} color="#ef4444" />
                  </Pressable>
                ) : !pickMode ? (
                  <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                ) : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Pressable style={s.fab} onPress={() => setShowCreate(true)} accessibilityLabel="Lägg till butik">
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>

      {/* Skapa-modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={s.overlay} onPress={() => setShowCreate(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ justifyContent: 'flex-end' }}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Ny butik</Text>
            <TextInput
              style={s.input}
              placeholder="t.ex. Ica, Coop, Willys…"
              placeholderTextColor="#9ca3af"
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
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Skapa</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Sort-modal */}
      <Modal visible={showSort} transparent animationType="slide" onRequestClose={() => setShowSort(false)}>
        <Pressable style={s.overlay} onPress={() => setShowSort(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>Sortera</Text>
          {[
            { v: 'name' as const, label: 'A–Ö' },
            { v: 'created' as const, label: 'I tilläggsordning' },
          ].map(o => (
            <Pressable
              key={o.v}
              style={s.sortRow}
              onPress={() => { setSortMode(o.v); setShowSort(false); }}
            >
              <Text style={s.sortRowText}>{o.label}</Text>
              {sortMode === o.v && <Ionicons name="checkmark" size={20} color="#4f46e5" />}
            </Pressable>
          ))}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  sortBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef2ff' },
  clearBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f2' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  searchIcon: {},
  searchInput: { flex: 1, fontSize: 15, color: '#111827', paddingVertical: 4 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  cardCurrent: { borderColor: '#a78bfa', backgroundColor: '#faf5ff', borderWidth: 2 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  cardIconCurrent: { backgroundColor: '#ede9fe' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  cardTitleCurrent: { color: '#5b21b6' },
  cardMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  cardMetaCurrent: { color: '#7c3aed', fontWeight: '600' },
  cardClearBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fef2f2' },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, color: '#111827' },
  primaryBtn: { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sortRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  sortRowText: { fontSize: 15, color: '#111827', fontWeight: '500' },
});
