import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type ShoppingListWithItems } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { useSpotlightTip, useTipsReady } from '../../src/context/SpotlightTipContext';
import { useOnceFlag } from '../../src/hooks/useOnceFlag';
import { useFirstActionTip } from '../../src/hooks/useFirstActionTip';
import { pickStore } from '../../src/lib/storePicker';
import { useConfirm } from '../../src/context/ConfirmContext';
import { EmptyState } from '../../src/components/EmptyState';
import { useTablet } from '../../src/hooks/useTablet';
import { useDiscardDraft } from '../../src/hooks/useDiscardDraft';
import { ShoppingListDetail } from '../shopping/[listId]';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { onShoppingChanged } from '../../src/lib/shoppingEvents';
import { useHouseholdSocket } from '../../src/hooks/useHouseholdSocket';
import { useAuth } from '@clerk/clerk-expo';
import { type Store } from '@veckis/shared';
import { kavBehavior } from '../../src/lib/platform';
import { EmojiPicker } from '../../src/components/EmojiPicker';
import { shopping as str, common } from '../../src/lib/svenska';

export default function ShoppingScreen() {
  const router = useRouter();
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { showError } = useToast();
  const confirm = useConfirm();
  const tryCloseCreate = useDiscardDraft(confirm);
  const discardCreate = () => { setShowModal(false); setNewListName(''); setNewListEmoji(null); setNewListStoreId(null); };
  const showTip = useSpotlightTip();
  const tipsReady = useTipsReady();
  const storesTip = useOnceFlag('seen-stores-tip');
  const storesTipShownRef = useRef(false);
  const storesBtnRef = useRef<View>(null);
  const wrapNewListTip = useFirstActionTip('seen-shopping-add-tip');
  const { fs, sp, isTablet, isSplitView, largeTablet } = useTablet();
  const insets = useSafeAreaInsets();
  const [lists, setLists] = useState<ShoppingListWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListEmoji, setNewListEmoji] = useState<string | null>(null);
  const [newListStoreId, setNewListStoreId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Stores administreras numera på /stores-routen — vi hämtar bara listan här
  // för att kunna visa butik-koppling i "ny lista"-formuläret.
  const [stores, setStores] = useState<Store[]>([]);
  // Hushållsmedlemmar för "X handlar nu"-indikatorn på list-korten.
  const [members, setMembers] = useState<Array<{ id: string; displayName: string; clerkUserId: string | null }>>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);


  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const [data, storeList, household] = await Promise.all([
        client.getShoppingLists(householdId),
        client.getStores(householdId),
        client.getHousehold(householdId).catch(() => null),
      ]);
      setLists(data);
      setStores(storeList);
      if (household) setMembers(household.members);
    } catch {
      confirm({ title: 'Fel', message: 'Kunde inte ladda inköpslistor', buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Refresh when a list changes elsewhere (e.g. deferred clear in the detail view).
  useEffect(() => onShoppingChanged(load), [load]);

  // Split-view: auto-välj första listan i landscape; rensa när portrait återkommer.
  useEffect(() => {
    if (isSplitView && lists.length > 0 && !selectedListId) {
      setSelectedListId(lists[0].id);
    }
    if (!isSplitView) setSelectedListId(null);
  }, [isSplitView, lists.length]);

  // Butiker-tip: useFocusEffect så det bara fyrar när inköp-fliken faktiskt
  // är aktiv. useEffect skulle fyra direkt när tabben mountar i bakgrunden
  // (default-fliken är kalender) → tipset poppade men ring missade målet.
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    // Vänta tills loading-spinnern är borta — annars renderar shopping bara
    // ActivityIndicator och storesBtnRef.current är null när tipset fyrar.
    if (loading) return;
    if (storesTip.seen !== false || storesTipShownRef.current) return;
    const shown = showTip({
      title: 'Butiker',
      message: 'Tryck här för att lägga till butiker, redigera deras kategorier eller flytta ordningen så listan matchar din affärs layout.',
      targetRef: storesBtnRef,
    });
    if (shown) { storesTipShownRef.current = true; storesTip.markSeen(); }
  }, [tipsReady, loading, storesTip.seen, storesTip.markSeen, showTip]));

  // Live cross-device refresh: the backend emits shopping_list_updated on the
  // household socket when any list's items change, so the overview counts update
  // without waiting for tab focus. Debounced — one mutation can emit several events.
  const { getToken, userId } = useAuth();
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useHouseholdSocket(householdId, getToken, (msg) => {
    if (msg.type === 'shopping_list_updated') {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => load(), 350);
    } else if (msg.type === 'shopping_presence') {
      // Uppdatera bara presence-fältet på rätt lista (inget reload-behov).
      setLists(prev => prev.map(l => l.id === msg.data.listId
        ? { ...l, activeShopperMemberId: msg.data.memberId, activeShopperSince: msg.data.since }
        : l));
    }
  });

  async function createList() {
    if (!householdId || !newListName.trim()) return;
    setCreating(true);
    try {
      const list = await client.createShoppingList({ householdId, name: newListName.trim(), emoji: newListEmoji, storeId: newListStoreId ?? undefined });
      setShowModal(false);
      setNewListName('');
      setNewListEmoji(null);
      setNewListStoreId(null);
      if (isSplitView) setSelectedListId(list.id);
      else router.push(`/shopping/${list.id}` as never);
    } catch (e) {
      showError(e, str.toasts.errorCreate);
    } finally {
      setCreating(false);
    }
  }

  // Stores CRUD flyttat till /stores-routen.
  // Borttagning av lista sker inuti listans tre-prickar-meny (/shopping/[listId]).

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#4e7a5e" /></View>;
  }

  const leftWidth = largeTablet ? 400 : 360;
  return (
    <View style={isSplitView ? { flex: 1, flexDirection: 'row', backgroundColor: '#faf8f3' } : { flex: 1 }}>
      <SafeAreaView style={[styles.container, isSplitView && { width: leftWidth, flex: 0 }]}>
      <ScreenHeader
        title="Inköp"
        actionNode={
          // View-wrapper med collapsable={false} så Android inte optimerar bort
          // den ur native-hierarkin (annars returnerar measureInWindow 0).
          <View ref={storesBtnRef} collapsable={false}>
            <Pressable
              style={[styles.storesHeaderBtn, { paddingHorizontal: sp(12), paddingVertical: sp(7) }]}
              onPress={() => router.push('/stores' as never)}
              accessibilityRole="button"
              accessibilityLabel="Butiker"
            >
              <Ionicons name="storefront-outline" size={fs(16)} color="#4e7a5e" />
              <Text style={[styles.storesHeaderBtnText, { fontSize: fs(13) }]}>Butiker</Text>
            </Pressable>
          </View>
        }
      />

      <FlatList
        data={lists}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, lists.length === 0 && styles.listEmpty]}
        numColumns={1}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          <EmptyState
            icon="cart-outline"
            title="Inga aktiva listor"
            subtitle="Skapa en inköpslista så kan ni bocka av varor tillsammans."
            actionLabel="Ny lista"
            onAction={() => setShowModal(true)}
          />
        }
        renderItem={({ item }) => {
          const unchecked = item.items.filter(i => !i.isChecked).length;
          const total = item.items.length;
          const shopper = item.activeShopperMemberId ? members.find(m => m.id === item.activeShopperMemberId) : null;
          const iAmShopper = !!shopper && !!userId && shopper.clerkUserId === userId;
          return (
            <View style={styles.cardWrap}>
              <Pressable
                style={[styles.card, isSplitView && item.id === selectedListId && styles.cardSelected]}
                onPress={() => isSplitView ? setSelectedListId(item.id) : router.push(`/shopping/${item.id}` as never)}
              >
                <View style={styles.cardLeft}>
                  {item.emoji
                    ? <Text style={{ fontSize: fs(22) }}>{item.emoji}</Text>
                    : <Ionicons name="cart-outline" size={fs(20)} color="#b96a45" />}
                </View>
                <View style={styles.cardContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={[styles.cardTitle, { fontSize: fs(16) }]}>{item.name}</Text>
                    {shopper && (
                      <View style={styles.shopperPill}>
                        <Ionicons name="walk" size={11} color="#b96a45" />
                        <Text style={styles.shopperPillText}>{iAmShopper ? 'Du handlar' : `${shopper.displayName} handlar`}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.cardMeta, { fontSize: fs(13) }]}>
                    {item.store ? `${item.store.name} · ` : ''}
                    {total === 0 ? 'Tom' : unchecked === 0 ? 'Allt bockat' : `${unchecked} av ${total} kvar`}
                  </Text>
                </View>
                {unchecked === 0 && total > 0 && (
                  <Ionicons name="checkmark-circle" size={fs(20)} color="#10b981" />
                )}
                <Ionicons name="chevron-forward" size={fs(18)} color="#d6d3d1" />
              </Pressable>
            </View>
          );
        }}
      />

      <Pressable style={[styles.fab, { width: sp(56), height: sp(56), borderRadius: sp(28), bottom: 20 + insets.bottom }]} onPress={wrapNewListTip(
        () => setShowModal(true),
        { title: 'Skapa inköpslista', message: 'En lista kan kopplas till en butik så att varorna sorteras efter butikens kategorier. Du kan lägga till varor manuellt eller överföra hela veckomenyn till listan från Meny-fliken.' },
      )}>
        <Ionicons name="add" size={fs(30)} color="#fff" />
      </Pressable>

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => tryCloseCreate(newListName.trim() !== '', discardCreate)}>
        <View pointerEvents="none" style={styles.overlayDim} />
        <Pressable style={styles.overlay} onPress={() => tryCloseCreate(newListName.trim() !== '', discardCreate)} />
        <KeyboardAvoidingView behavior={kavBehavior} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{str.createModal.title}</Text>
            <TextInput
              style={styles.input}
              placeholder={str.createModal.namePlaceholder}
              placeholderTextColor="#a8a29e"
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createList}
            />
            <EmojiPicker value={newListEmoji} onChange={setNewListEmoji} />
            <Text style={styles.pickStoreLabel}>{str.createModal.storeLabel}</Text>
            <Pressable
              style={styles.storePickBtn}
              onPress={async () => {
                const promise = pickStore();
                const currentParam = newListStoreId ? `&current=${newListStoreId}` : '';
                // Dölj dialogen medan man väljer butik så den inte ligger kvar och
                // skymmer butikslistan; återställ den (med namnet kvar) efteråt.
                setShowModal(false);
                router.push(`/stores?pick=1${currentParam}` as never);
                const result = await promise;
                setShowModal(true);
                if (result === 'cancelled') return;
                setNewListStoreId(result);
              }}
            >
              <Ionicons name="storefront-outline" size={18} color="#4e7a5e" />
              <Text style={styles.storePickBtnText}>
                {newListStoreId
                  ? stores.find(s => s.id === newListStoreId)?.name ?? 'Vald butik'
                  : str.createModal.storePlaceholder}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#a8a29e" />
            </Pressable>
            <Pressable
              style={[styles.button, !newListName.trim() && styles.buttonDisabled]}
              onPress={createList}
              disabled={creating || !newListName.trim()}
            >
              {creating
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>{str.createModal.createButton}</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </SafeAreaView>
      {isSplitView && (
        <>
          <View style={{ width: 1, backgroundColor: '#e7e5e4' }} />
          <View style={{ flex: 1 }}>
            {selectedListId
              ? <ShoppingListDetail key={selectedListId} listId={selectedListId} onClose={() => setSelectedListId(null)} />
              : <View style={styles.center}><Text style={{ color: '#a8a29e', fontSize: 15 }}>Välj en inköpslista</Text></View>
            }
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf8f3' },
  storesHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ecf3ec', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  storesHeaderBtnText: { fontWeight: '600', color: '#4e7a5e', fontSize: 13 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 2 },
  listEmpty: { flex: 1 },
  cardSelected: {
    backgroundColor: '#ecf3ec',
    borderLeftColor: '#4e7a5e',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#e2bda1',
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardLeft: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#faf1e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#292524' },
  cardMeta: { fontSize: 13, color: '#78716c', marginTop: 2 },
  shopperPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f6e8dc', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  shopperPillText: { fontSize: 11, color: '#8f4b2c', fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4e7a5e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4e7a5e',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  // Dim på eget absolut lager så det täcker bakom sheetens rundade hörn.
  overlay: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 14,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e7e5e4',
    alignSelf: 'center',
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#292524' },
  input: {
    borderWidth: 1,
    borderColor: '#e7e5e4',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#faf8f3',
  },
  button: { backgroundColor: '#4e7a5e', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sheetSub: { fontSize: 13, color: '#78716c', marginTop: -8 },
  storesEmpty: { fontSize: 14, color: '#a8a29e', textAlign: 'center', paddingVertical: 16 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1efec' },
  storeName: { flex: 1, fontSize: 16, fontWeight: '500', color: '#292524' },
  storeActions: { flexDirection: 'row', gap: 4 },
  storeActionBtn: { padding: 8 },
  newStoreRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  addStoreBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#4e7a5e', alignItems: 'center', justifyContent: 'center' },
  addStoreBtnDisabled: { opacity: 0.4 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#faf8f3' },
  catRowLabel: { flex: 1, fontSize: 15, color: '#44403c' },
  catArrow: { padding: 6 },
  pickStoreLabel: { fontSize: 14, fontWeight: '600', color: '#44403c', marginBottom: -6 },
  storePickBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e7e5e4', backgroundColor: '#faf8f3' },
  storePickBtnText: { flex: 1, fontSize: 15, color: '#44403c', fontWeight: '500' },
  cardWrap: { position: 'relative' },
  cardDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: '#fff', borderRadius: 11 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', backgroundColor: '#292524', borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
