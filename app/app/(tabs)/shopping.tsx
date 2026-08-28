import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../../src/context/ThemeContext';
import type { Palette } from '../../src/lib/theme';
import {
  ActivityIndicator,
  FlatList,
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
import { useSpotlightTip, useTipsReady } from '../../src/context/SpotlightTipContext';
import { useOnceFlag } from '../../src/hooks/useOnceFlag';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { pickStore } from '../../src/lib/storePicker';
import { useConfirm } from '../../src/context/ConfirmContext';
import { EmptyState } from '../../src/components/EmptyState';
import { useTablet } from '../../src/hooks/useTablet';
import { useSheetLift } from '../../src/hooks/useSheetLift';
import { useDiscardDraft } from '../../src/hooks/useDiscardDraft';
import { ShoppingListDetail } from '../shopping/[listId]';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { onShoppingChanged } from '../../src/lib/shoppingEvents';
import { useHouseholdSocket } from '../../src/hooks/useHouseholdSocket';
import { useAuth } from '@clerk/clerk-expo';
import { type Store } from '@veckis/shared';
import { EmojiPicker } from '../../src/components/EmojiPicker';
import { shopping as str, common, gettingStarted } from '../../src/lib/svenska';
import { consumeSpotlight } from '../../src/lib/spotlightRequest';

export default function ShoppingScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
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
  const listFabRef = useRef<View>(null);
  const { fs, sp, isTablet, isSplitView, largeTablet } = useTablet();
  const insets = useSafeAreaInsets();
  const [lists, setLists] = useState<ShoppingListWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListEmoji, setNewListEmoji] = useState<string | null>(null);
  const [newListStoreId, setNewListStoreId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Scroll-into-view-lyft för modalen (mät fokuserat fält, lyft lagom).
  const { sheetLift, onFocusInput } = useSheetLift();
  const newListNameRef = useRef<TextInput>(null);

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
      confirm({ title: common.errorTitle, message: str.toasts.errorLoad, buttons: [{ label: common.actions.ok }] });
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Refresh when a list changes elsewhere (e.g. deferred clear in the detail view).
  useEffect(() => onShoppingChanged(load), [load]);

  // Kom igång-kortet: tänd spotlight på "Ny lista"-FAB om det begärts (opt-in).
  useFocusEffect(useCallback(() => {
    if (loading) return;
    if (!consumeSpotlight('gs-list')) return;
    showTip({ title: gettingStarted.spotlight.list.title, message: gettingStarted.spotlight.list.message, targetRef: listFabRef });
  }, [loading, showTip]));

  // Split-view: auto-välj första listan i landscape; rensa när portrait återkommer.
  useEffect(() => {
    if (isSplitView && lists.length > 0 && !selectedListId) {
      setSelectedListId(lists[0].id);
    }
    if (!isSplitView) setSelectedListId(null);
  }, [isSplitView, lists.length]);

  // Butiker-tip (vallgraven): förklarar att man kan skapa egna butiker och
  // sortera kategorierna efter sin affärsrutt. useFocusEffect så det bara fyrar
  // när inköp-fliken är aktiv; väntar tills spinnern är borta (annars är
  // storesBtnRef.current null) och tills koncept-guiden är avklarad.
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (loading) return;
    if (storesTip.seen !== false || storesTipShownRef.current) return;
    const shown = showTip({
      title: str.tips.stores.title,
      message: str.tips.stores.message,
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
    return <View style={styles.center}><ActivityIndicator size="large" color={c.primary} /></View>;
  }

  const leftWidth = largeTablet ? 400 : 360;
  return (
    <View style={isSplitView ? { flex: 1, flexDirection: 'row', backgroundColor: c.background } : { flex: 1 }}>
      <SafeAreaView style={[styles.container, isSplitView && { width: leftWidth, flex: 0 }]}>
      <ScreenHeader
        title={str.title}
        actionNode={
          // View-wrapper med collapsable={false} så Android inte optimerar bort
          // den ur native-hierarkin (annars returnerar measureInWindow 0).
          <View ref={storesBtnRef} collapsable={false}>
            <Pressable
              style={[styles.storesHeaderBtn, { paddingHorizontal: sp(12), paddingVertical: sp(7) }]}
              onPress={() => router.push('/stores' as never)}
              accessibilityRole="button"
              accessibilityLabel={str.header.stores}
            >
              <Ionicons name="storefront-outline" size={fs(16)} color={c.primary} />
              <Text style={[styles.storesHeaderBtnText, { fontSize: fs(13) }]}>{str.header.stores}</Text>
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
            title={str.emptyState.title}
            subtitle={str.emptyState.subtitle}
            actionLabel={str.emptyState.cta}
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
                    : <Ionicons name="cart-outline" size={fs(20)} color={c.accent} />}
                </View>
                <View style={styles.cardContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={[styles.cardTitle, { fontSize: fs(16) }]}>{item.name}</Text>
                    {shopper && (
                      <View style={styles.shopperPill}>
                        <Ionicons name="walk" size={11} color={c.accent} />
                        <Text style={styles.shopperPillText}>{iAmShopper ? str.listCard.youShop : str.listCard.otherShops(shopper.displayName)}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.cardMeta, { fontSize: fs(13) }]}>
                    {item.store ? `${item.store.name} · ` : ''}
                    {total === 0 ? str.listCard.empty : unchecked === 0 ? str.listCard.allChecked : str.listCard.remaining(total - unchecked, total)}
                  </Text>
                </View>
                {unchecked === 0 && total > 0 && (
                  <Ionicons name="checkmark-circle" size={fs(20)} color={c.success} />
                )}
                <Ionicons name="chevron-forward" size={fs(18)} color={c.border} />
              </Pressable>
            </View>
          );
        }}
      />

      <Pressable ref={listFabRef} style={[styles.fab, { width: sp(56), height: sp(56), borderRadius: sp(28), bottom: 20 + insets.bottom }]} onPress={() => setShowModal(true)}>
        <Ionicons name="add" size={fs(30)} color="#fff" />
      </Pressable>

      <Modal visible={showModal} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => tryCloseCreate(newListName.trim() !== '', discardCreate)}>
        <View pointerEvents="none" style={styles.overlayDim} />
        <Pressable style={styles.overlay} onPress={() => tryCloseCreate(newListName.trim() !== '', discardCreate)} />
        <View style={{ paddingBottom: sheetLift }}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{str.createModal.title}</Text>
            <TextInput
              ref={newListNameRef}
              style={styles.input}
              placeholder={str.createModal.namePlaceholder}
              placeholderTextColor={c.textFaint}
              value={newListName}
              onChangeText={setNewListName}
              autoFocus
              returnKeyType="done"
              onFocus={onFocusInput(newListNameRef)}
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
              <Ionicons name="storefront-outline" size={18} color={c.primary} />
              <Text style={styles.storePickBtnText}>
                {newListStoreId
                  ? stores.find(s => s.id === newListStoreId)?.name ?? str.selectedStore
                  : str.createModal.storePlaceholder}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
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
        </View>
      </Modal>
      </SafeAreaView>
      {isSplitView && (
        <>
          <View style={{ width: 1, backgroundColor: c.borderLight }} />
          <View style={{ flex: 1 }}>
            {selectedListId
              ? <ShoppingListDetail key={selectedListId} listId={selectedListId} onClose={() => setSelectedListId(null)} />
              : <View style={styles.center}><Text style={{ color: c.textFaint, fontSize: 15 }}>{str.splitPlaceholder}</Text></View>
            }
          </View>
        </>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  storesHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.primaryTint, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  storesHeaderBtnText: { fontWeight: '600', color: c.primary, fontSize: 13 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 2 },
  listEmpty: { flex: 1 },
  cardSelected: {
    backgroundColor: c.primaryTint,
    borderLeftColor: c.primary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: c.accent300,
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
    backgroundColor: c.accentTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: c.text },
  cardMeta: { fontSize: 13, color: c.textMuted, marginTop: 2 },
  shopperPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.accent100, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  shopperPillText: { fontSize: 11, color: c.accentDark, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: c.primary,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  // Dim på eget absolut lager så det täcker bakom sheetens rundade hörn.
  overlay: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: c.surface,
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
    backgroundColor: c.borderLight,
    alignSelf: 'center',
    marginBottom: 4,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: c.text },
  input: { color: c.text,
    borderWidth: 1,
    borderColor: c.borderLight,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: c.background,
  },
  button: { backgroundColor: c.primary, borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  sheetSub: { fontSize: 13, color: c.textMuted, marginTop: -8 },
  storesEmpty: { fontSize: 14, color: c.textFaint, textAlign: 'center', paddingVertical: 16 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  storeName: { flex: 1, fontSize: 16, fontWeight: '500', color: c.text },
  storeActions: { flexDirection: 'row', gap: 4 },
  storeActionBtn: { padding: 8 },
  newStoreRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  addStoreBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
  addStoreBtnDisabled: { opacity: 0.4 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.background },
  catRowLabel: { flex: 1, fontSize: 15, color: c.textSecondary },
  catArrow: { padding: 6 },
  pickStoreLabel: { fontSize: 14, fontWeight: '600', color: c.textSecondary, marginBottom: -6 },
  storePickBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.borderLight, backgroundColor: c.background },
  storePickBtnText: { flex: 1, fontSize: 15, color: c.textSecondary, fontWeight: '500' },
  cardWrap: { position: 'relative' },
  cardDeleteBtn: { position: 'absolute', top: -9, right: -9, zIndex: 10, backgroundColor: c.surface, borderRadius: 11 },
  editDoneBtn: { position: 'absolute', bottom: 32, alignSelf: 'center', backgroundColor: c.text, borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12 },
  editDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
