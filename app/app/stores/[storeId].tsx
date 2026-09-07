import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../../src/context/ThemeContext';
import type { Palette } from '../../src/lib/theme';
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
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useApiClient } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { CATEGORY_LABELS, DEFAULT_CATEGORY_ORDER, SUB_TAXONOMY, subsForParent, type StoreCategory, type SubCategory, type Store } from '@veckis/shared';
import { kavBehavior } from '../../src/lib/platform';
import { stores as str, common } from '../../src/lib/svenska';
import { sortedRestFor } from '../../src/lib/subOrder';

export default function StoreDetailScreen() {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { storeId } = useLocalSearchParams<{ storeId: string }>();
  const router = useRouter();
  const client = useApiClient();
  const { householdId } = useHousehold();
  const { showError, showToast } = useToast();
  const confirm = useConfirm();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  // Synliga enum-kategorier (i ordning) + dolda räknas ut från diffen mellan
  // alla DEFAULT_CATEGORY_ORDER och visibleEnum.
  // Enhetlig, ordnad lista över SYNLIGA parents — blandar standard-kategorier
  // ("fruit_veg") och egna ("c:Barn"). Källa till sanning för ordning + membership.
  const [parentOrder, setParentOrder] = useState<string[]>([]);
  const visibleEnum = useMemo(() => parentOrder.filter(k => !k.startsWith('c:')) as StoreCategory[], [parentOrder]);
  const customCategories = useMemo(() => parentOrder.filter(k => k.startsWith('c:')).map(k => k.slice(2)), [parentOrder]);
  // Subs som hushållet brutit ut som egna sektioner under sin parent.
  const [expandedSubs, setExpandedSubs] = useState<string[]>([]);
  // Ordning för icke-utbrutna standard-subs — kan sorteras UTAN att visas.
  const [subOrder, setSubOrder] = useState<string[]>([]);
  // Hushålls-lokala egna underkategorier: parentKey → etiketter (ordnade).
  const [customSubs, setCustomSubs] = useState<Record<string, string[]>>({});
  // UI-state: vilka parents användaren har "fällt ut" lokalt för att se sub-listan.
  const [openParents, setOpenParents] = useState<Set<StoreCategory>>(new Set());
  const [openCustomParents, setOpenCustomParents] = useState<Set<string>>(new Set());
  const [newCatName, setNewCatName] = useState('');
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

  const hiddenEnum = useMemo(
    () => DEFAULT_CATEGORY_ORDER.filter(c => !visibleEnum.includes(c)),
    [visibleEnum],
  );

  const load = useCallback(async () => {
    if (!householdId || !storeId) return;
    try {
      const stores = await client.getStores(householdId);
      const found = stores.find(s => s.id === storeId) ?? null;
      setStore(found);
      if (found) {
        const order = (found.categoryOrder as StoreCategory[]).length
          ? (found.categoryOrder as StoreCategory[])
          : [...DEFAULT_CATEGORY_ORDER];
        const savedPO = ((found as { parentOrder?: string[] }).parentOrder ?? []);
        const cats = (found.customCategories as string[] | undefined) ?? [];
        // parentOrder är källa till sanning; härled från categoryOrder + egna om tom (bakåtkompat).
        setParentOrder(savedPO.length ? [...savedPO] : [...order, ...cats.map(c => `c:${c}`)]);
        setExpandedSubs([...((found as { expandedSubs?: string[] }).expandedSubs ?? [])]);
        setSubOrder([...((found as { subOrder?: string[] }).subOrder ?? [])]);
        setCustomSubs({ ...((found as { customSubs?: Record<string, string[]> }).customSubs ?? {}) });
        setDirty(false);
      }
    } catch (e) {
      showError(e, str.toasts.errorLoad('butiken'));
    } finally {
      setLoading(false);
    }
  }, [householdId, storeId]);

  useEffect(() => { load(); }, [load]);

  // Dra-och-släpp-omordning av kategorier (grå handtag i stället för pilar).
  // Mäter varje rads skärm-absoluta Y/höjd (samma teknik som menyns dag-
  // sektioner) och jämför mot fingrets absoluta Y under draget.
  type CatDragState = { key: string; startIndex: number; y: number; touchOffsetY: number };
  const [catDragState, setCatDragState] = useState<CatDragState | null>(null);
  const [catHoverIndex, setCatHoverIndex] = useState<number | null>(null);
  // Speglar catHoverIndex synkront — onCatDragEnd läser HÄRIFRÅN i stället för
  // React-state, så ett sent onUpdate/onFinalize-race inte kan råka läsa ett
  // inaktuellt hover-index om state hunnit uppdateras men inte re-rendrat än.
  const catHoverIndexRef = useRef<number | null>(null);
  const catRowRefs = useRef<Record<string, View | null>>({});
  const catRowLayouts = useRef<Record<string, { y: number; height: number }>>({});
  function measureCatRow(key: string, ref: View | null) {
    if (ref) catRowRefs.current[key] = ref;
    const target = catRowRefs.current[key];
    target?.measure((_x, _y, _w, h, _px, py) => { catRowLayouts.current[key] = { y: py, height: h }; });
  }
  function onCatDragStart(key: string, idx: number, absoluteY: number, touchOffsetY: number) {
    setCatDragState({ key, startIndex: idx, y: absoluteY, touchOffsetY });
    catHoverIndexRef.current = idx;
    setCatHoverIndex(idx);
  }
  function onCatDragMove(absoluteY: number) {
    setCatDragState(prev => prev ? { ...prev, y: absoluteY } : null);
    for (const [key, layout] of Object.entries(catRowLayouts.current)) {
      if (absoluteY >= layout.y && absoluteY <= layout.y + layout.height) {
        const idx = parentOrder.indexOf(key);
        if (idx >= 0) {
          catHoverIndexRef.current = idx;
          setCatHoverIndex(idx);
        }
        break;
      }
    }
  }
  function onCatDragEnd() {
    setCatDragState(prev => {
      const target = catHoverIndexRef.current;
      if (prev && target !== null && target !== prev.startIndex) {
        setParentOrder(order => {
          const next = [...order];
          const [moved] = next.splice(prev.startIndex, 1);
          next.splice(target, 0, moved);
          return next;
        });
        setDirty(true);
      }
      return null;
    });
    catHoverIndexRef.current = null;
    setCatHoverIndex(null);
  }

  function hideEnum(cat: StoreCategory) {
    setParentOrder(prev => prev.filter(k => k !== cat));
    setDirty(true);
  }
  function showEnum(cat: StoreCategory) {
    setParentOrder(prev => prev.includes(cat) ? prev : [...prev, cat]);
    setDirty(true);
  }

  function toggleSubExpanded(sub: string) {
    setExpandedSubs(prev =>
      prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub],
    );
    setDirty(true);
  }
  // Parent-nyckel för en expandedSubs-post. Egna subs kodas "cs:<parentKey>:<label>"
  // (parentKey kan själv innehålla ":" för egna parents, "c:Barn") → parenten är
  // allt mellan "cs:" och SISTA kolonet. Standard-subs: sub:ens defaultParent.
  function entryParentKey(entry: string): string {
    if (entry.startsWith('cs:')) return entry.slice(3, entry.lastIndexOf(':'));
    return SUB_TAXONOMY[entry as SubCategory]?.defaultParent ?? '';
  }
  // Flytta en sub-post (standard ELLER egen) upp/ner bland sina syskon (samma
  // parent) i expandedSubs — så egna och standard-subs kan interfolieras fritt.
  function moveSubEntry(entry: string, parentKey: string, dir: -1 | 1) {
    setExpandedSubs(prev => {
      const siblingIdxs = prev.map((s, i) => ({ s, i })).filter(({ s }) => entryParentKey(s) === parentKey).map(({ i }) => i);
      const pos = siblingIdxs.indexOf(prev.indexOf(entry));
      const target = pos + dir;
      if (pos < 0 || target < 0 || target >= siblingIdxs.length) return prev;
      const next = [...prev];
      const a = siblingIdxs[pos], b = siblingIdxs[target];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
    setDirty(true);
  }
  // EJ utbrutna poster för en parent — BÅDE standard-subs och egna (samma
  // "cs:parentKey:label"-kodning som expandedSubs). Egna subs börjar dolda
  // (se commitCustomSub) och ska gå att sortera bland de dolda standard-
  // subsen direkt, utan att först visas.
  function hiddenEntriesRaw(parentKey: string, standardSubs: SubCategory[]): string[] {
    const standardHidden = standardSubs.filter(sub => !expandedSubs.includes(sub));
    const customHidden = (customSubs[parentKey] ?? [])
      .map(label => `cs:${parentKey}:${label}`)
      .filter(entry => !expandedSubs.includes(entry));
    return [...standardHidden, ...customHidden];
  }
  // Ordnad lista av dolda poster för en parent (se subOrder.ts).
  function hiddenEntriesFor(parentKey: string, standardSubs: SubCategory[]): string[] {
    return sortedRestFor(hiddenEntriesRaw(parentKey, standardSubs), subOrder);
  }
  // Flytta en dold post (standard ELLER egen) upp/ner bland sina dolda
  // syskon — sorterbart utan att först behöva bocka i/visa den. Skriver in
  // den nya, fullständiga ordningen för DENNA parents dolda poster i
  // subOrder (ersätter ev. tidigare poster för samma parent).
  function moveHiddenEntry(entry: string, parentKey: string, standardSubs: SubCategory[], dir: -1 | 1) {
    const notShown = hiddenEntriesRaw(parentKey, standardSubs);
    const list = sortedRestFor(notShown, subOrder);
    const pos = list.indexOf(entry);
    const target = pos + dir;
    if (pos < 0 || target < 0 || target >= list.length) return;
    const next = [...list];
    [next[pos], next[target]] = [next[target], next[pos]];
    setSubOrder(prev => {
      const others = prev.filter(s => !notShown.includes(s));
      return [...others, ...next];
    });
    setDirty(true);
  }
  function toggleParentOpen(p: StoreCategory) {
    setOpenParents(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }
  function toggleCustomParentOpen(cat: string) {
    setOpenCustomParents(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  // --- Egna kategorier / underkategorier (hushålls-lokala) ---
  function addCustomCategory() {
    const n = newCatName.trim();
    if (!n || customCategories.includes(n)) { setNewCatName(''); return; }
    setParentOrder(prev => [...prev, `c:${n}`]);
    setNewCatName('');
    setDirty(true);
  }
  function removeCustomCategory(cat: string) {
    setParentOrder(prev => prev.filter(k => k !== `c:${cat}`));
    setCustomSubs(prev => { const next = { ...prev }; delete next[`c:${cat}`]; return next; });
    setDirty(true);
  }
  function commitCustomSub(parentKey: string) {
    const l = newSubName.trim().replace(/:/g, ''); // kolon krockar med cs:-kodningen
    setAddingSubFor(null);
    setNewSubName('');
    if (!l) return;
    setCustomSubs(prev => {
      const cur = prev[parentKey] ?? [];
      if (cur.includes(l)) return prev;
      return { ...prev, [parentKey]: [...cur, l] };
    });
    // Börjar DOLD (inte automatiskt visad) — hamnar i samma sorterbara,
    // dolda lista som ej utbrutna standard-subs (se hiddenEntriesFor), så
    // den går att placera in bland dem direkt utan att först visas och
    // sorteras om varje gång fler subs slås på senare.
    setDirty(true);
  }
  function removeCustomSub(parentKey: string, label: string) {
    setCustomSubs(prev => {
      const cur = (prev[parentKey] ?? []).filter(x => x !== label);
      const next = { ...prev };
      if (cur.length) next[parentKey] = cur; else delete next[parentKey];
      return next;
    });
    setExpandedSubs(prev => prev.filter(e => e !== `cs:${parentKey}:${label}`));
    setSubOrder(prev => prev.filter(e => e !== `cs:${parentKey}:${label}`));
    setDirty(true);
  }


  async function save() {
    if (!store) return;
    setSaving(true);
    try {
      const updated = await client.updateStore(store.id, {
        parentOrder,
        categoryOrder: visibleEnum,
        customCategories,
        expandedSubs,
        subOrder,
        customSubs,
      });
      setStore(updated);
      setDirty(false);
      showToast(str.toasts.saved, 'success');
    } catch (e) {
      showError(e, str.toasts.errorSave);
    } finally {
      setSaving(false);
    }
  }

  async function renameStore() {
    if (!store || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const updated = await client.updateStore(store.id, { name: renameValue.trim() });
      setStore(updated);
      setShowRename(false);
      showToast(str.toasts.renamed, 'success');
    } catch (e) {
      showError(e, str.toasts.errorRename);
    } finally {
      setRenaming(false);
    }
  }

  function deleteStore() {
    if (!store) return;
    confirm({
      title: str.delete.title,
      message: str.delete.message(store.name),
      buttons: [
        { label: common.actions.delete, style: 'destructive', onPress: async () => {
          try {
            await client.deleteStore(store.id);
            showToast(str.toasts.deleted(store.name), 'neutral');
            router.back();
          } catch (e) {
            showError(e, str.toasts.errorDelete);
          }
        } },
        { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={c.primary} /></View>;
  }
  if (!store) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={26} color={c.text} />
          </Pressable>
        </View>
        <Text style={s.empty}>{str.toasts.notFound}</Text>
      </SafeAreaView>
    );
  }

  // Enhetlig underkategori-lista för en parentKey: utbrutna standard-subs OCH
  // egna subs i EN ordnad lista (från expandedSubs) — sorterbara sinsemellan.
  // Under: ej utbrutna standard-subs (kryssa för att bryta ut) + "lägg till egen".
  const renderSubs = (parentKey: string, standardSubs: SubCategory[]) => {
    const entries = expandedSubs.filter(e => entryParentKey(e) === parentKey);
    const rest = hiddenEntriesFor(parentKey, standardSubs);
    return (
      <>
        {standardSubs.length > 0 && <Text style={s.subListHint}>{str.detail.subHint(CATEGORY_LABELS[parentKey as StoreCategory] ?? parentKey)}</Text>}
        {entries.map((entry, i) => {
          const isCustomEntry = entry.startsWith('cs:');
          const label = isCustomEntry ? entry.slice(entry.lastIndexOf(':') + 1) : SUB_TAXONOMY[entry as SubCategory].label;
          return (
            <View key={entry} style={s.subRow}>
              <Text style={[s.subName, s.subNameActive]}>{isCustomEntry ? `🏷️ ${label}` : label}</Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Pressable style={[s.catBtn, i === 0 && { opacity: 0.3 }]} disabled={i === 0} onPress={() => moveSubEntry(entry, parentKey, -1)}>
                  <Ionicons name="chevron-up" size={16} color={c.primary} />
                </Pressable>
                <Pressable style={[s.catBtn, i === entries.length - 1 && { opacity: 0.3 }]} disabled={i === entries.length - 1} onPress={() => moveSubEntry(entry, parentKey, 1)}>
                  <Ionicons name="chevron-down" size={16} color={c.primary} />
                </Pressable>
                {isCustomEntry ? (
                  <Pressable style={s.catBtnDanger} onPress={() => removeCustomSub(parentKey, label)}>
                    <Ionicons name="close" size={16} color={c.danger} />
                  </Pressable>
                ) : (
                  <Pressable style={[s.subToggle, s.subToggleActive]} onPress={() => toggleSubExpanded(entry)}>
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
        {rest.map((entry, i) => {
          const isCustomEntry = entry.startsWith('cs:');
          const label = isCustomEntry ? entry.slice(entry.lastIndexOf(':') + 1) : SUB_TAXONOMY[entry as SubCategory].label;
          return (
          <View key={entry} style={s.subRow}>
            <Pressable style={{ flex: 1 }} onPress={() => toggleSubExpanded(entry)}>
              <Text style={s.subName}>{isCustomEntry ? `🏷️ ${label}` : label}</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {/* Krysset längst till vänster (fast platshållare för standard-
                  rader) så pilarna alltid hamnar på samma plats oavsett om
                  raden är egen eller standard. */}
              {isCustomEntry ? (
                <Pressable style={s.catBtnDanger} onPress={() => removeCustomSub(parentKey, label)}>
                  <Ionicons name="close" size={16} color={c.danger} />
                </Pressable>
              ) : (
                <View style={s.catBtnSpacer} />
              )}
              <Pressable style={[s.catBtn, i === 0 && { opacity: 0.3 }]} disabled={i === 0} onPress={() => moveHiddenEntry(entry, parentKey, standardSubs, -1)}>
                <Ionicons name="chevron-up" size={16} color={c.primary} />
              </Pressable>
              <Pressable style={[s.catBtn, i === rest.length - 1 && { opacity: 0.3 }]} disabled={i === rest.length - 1} onPress={() => moveHiddenEntry(entry, parentKey, standardSubs, 1)}>
                <Ionicons name="chevron-down" size={16} color={c.primary} />
              </Pressable>
              <Pressable style={s.subToggle} onPress={() => toggleSubExpanded(entry)} />
            </View>
          </View>
          );
        })}
        {addingSubFor === parentKey ? (
          <View style={s.subRow}>
            <TextInput
              style={s.addSubInput}
              value={newSubName}
              onChangeText={setNewSubName}
              placeholder={str.detail.customSubPlaceholder}
              placeholderTextColor={c.textFaint}
              autoFocus
              onSubmitEditing={() => commitCustomSub(parentKey)}
              onBlur={() => commitCustomSub(parentKey)}
              returnKeyType="done"
            />
          </View>
        ) : (
          <Pressable style={s.addSubRow} onPress={() => { setAddingSubFor(parentKey); setNewSubName(''); }}>
            <Ionicons name="add" size={16} color={c.primary} />
            <Text style={s.addSubText}>{str.detail.customSubAdd}</Text>
          </Pressable>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.navBtn}>
          <Ionicons name="arrow-back" size={24} color={c.text} />
        </Pressable>
        <Text style={[s.title, { flex: 1 }]} numberOfLines={1}>{store.name}</Text>
        <Pressable onPress={() => confirm({ variant: 'menu', buttons: [{ label: str.actions.rename, icon: 'pencil-outline', onPress: () => { setRenameValue(store.name); setShowRename(true); } }, { label: str.actions.delete, icon: 'trash-outline', style: 'destructive', onPress: deleteStore }, { label: common.actions.cancel, style: 'cancel' }] })} hitSlop={8} style={s.navBtn} accessibilityLabel={common.actions.more}>
          <Ionicons name="ellipsis-vertical" size={22} color={c.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll} scrollEnabled={!catDragState}>
        <Text style={s.sectionSub}>{str.detail.hint}</Text>

        <Text style={s.sectionLabel}>{str.detail.sections.visible}</Text>
        <Text style={s.sectionSub}>{str.detail.mixedHint}</Text>
        <View style={s.catList}>
          {parentOrder.length === 0 ? (
            <Text style={s.emptyHint}>{str.detail.allHidden}</Text>
          ) : (
            parentOrder.map((key, idx) => {
              const isCustom = key.startsWith('c:');
              const cat = isCustom ? key.slice(2) : (key as StoreCategory);
              const subs = isCustom ? ([] as SubCategory[]) : subsForParent(key as StoreCategory);
              const isOpen = isCustom ? openCustomParents.has(cat) : openParents.has(key as StoreCategory);
              const customShownHere = (customSubs[key] ?? []).filter(label => expandedSubs.includes(`cs:${key}:${label}`)).length;
              const expandedHere = (isCustom ? 0 : subs.filter(s2 => expandedSubs.includes(s2)).length) + customShownHere;
              const dragHandle = Gesture.Pan()
                .hitSlop(6)
                // Utan en kort press-fördröjning konkurrerar den nakna Pan-
                // gesten mot ScrollView:ns egen vertikala scroll-igenkänning
                // (scrollEnabled slås först av EFTER att draget startat, så
                // vid själva touch-starten är listan fortfarande scrollbar) —
                // scrollen kan då hinna "vinna" arbitreringen och kapa draget
                // innan onFinalize någonsin committar en flytt. Samma mönster
                // som menyns redan fungerande kort-drag (activateAfterLongPress).
                .activateAfterLongPress(150)
                .onStart(e => {
                  runOnJS(onCatDragStart)(key, idx, e.absoluteY, e.y);
                })
                .onUpdate(e => {
                  runOnJS(onCatDragMove)(e.absoluteY);
                })
                .onFinalize(() => {
                  runOnJS(onCatDragEnd)();
                });
              const isBeingDragged = catDragState?.key === key;
              const isDropTarget = !!catDragState && catDragState.key !== key && catHoverIndex === idx;
              return (
                <View
                  key={key}
                  ref={ref => measureCatRow(key, ref)}
                  onLayout={() => measureCatRow(key, null)}
                  style={[isBeingDragged && s.catRowDragging, isDropTarget && s.catRowDropTarget]}
                >
                  <View style={s.catRow}>
                    <Pressable
                      onPress={() => isCustom ? toggleCustomParentOpen(cat) : toggleParentOpen(key as StoreCategory)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
                      hitSlop={6}
                    >
                      <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={c.textMuted} />
                      <Text style={s.catName}>{isCustom ? `🏷️ ${cat}` : (CATEGORY_LABELS[key as StoreCategory] ?? cat)}</Text>
                      {expandedHere > 0 && <Text style={s.expandedBadge}>{expandedHere}</Text>}
                    </Pressable>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {isCustom ? (
                        <Pressable style={s.catBtnDanger} onPress={() => removeCustomCategory(cat)}>
                          <Ionicons name="trash-outline" size={16} color={c.danger} />
                        </Pressable>
                      ) : (
                        <Pressable style={s.catBtnDanger} onPress={() => hideEnum(key as StoreCategory)}>
                          <Ionicons name="eye-off-outline" size={16} color={c.danger} />
                        </Pressable>
                      )}
                      <GestureDetector gesture={dragHandle}>
                        <View style={s.dragHandle}>
                          <Ionicons name="reorder-three" size={22} color={c.textFaint} />
                        </View>
                      </GestureDetector>
                    </View>
                  </View>
                  {isOpen && (
                    <View style={s.subList}>
                      {renderSubs(key, isCustom ? ([] as SubCategory[]) : subs)}
                    </View>
                  )}
                </View>
              );
            })
          )}
          {/* Lägg till egen kategori (hushålls-lokal, matar aldrig global inlärning) */}
          <View style={[s.catRow, { gap: 8 }]}>
            <TextInput
              style={s.addSubInput}
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder={str.detail.customCatPlaceholder}
              placeholderTextColor={c.textFaint}
              onSubmitEditing={addCustomCategory}
              returnKeyType="done"
            />
            <Pressable style={s.catBtn} onPress={addCustomCategory} disabled={!newCatName.trim()}>
              <Ionicons name="add" size={20} color={newCatName.trim() ? c.primary : c.textFaint} />
            </Pressable>
          </View>
        </View>

        {hiddenEnum.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>{str.detail.sections.hidden}</Text>
            <Text style={s.sectionSub}>{str.detail.hiddenHint}</Text>
            <View style={s.catList}>
              {hiddenEnum.map(cat => (
                <View key={cat} style={[s.catRow, s.catRowMuted]}>
                  <Text style={[s.catName, s.catNameMuted]}>{CATEGORY_LABELS[cat] ?? cat}</Text>
                  <Pressable style={s.catBtn} onPress={() => showEnum(cat)}>
                    <Ionicons name="eye-outline" size={16} color={c.primary} />
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: dirty ? 100 : 40 }} />
      </ScrollView>

      {/* Drag-spöke — visar vilken kategori som flyttas, följer fingret vertikalt. */}
      {catDragState && (() => {
        const key = catDragState.key;
        const label = key.startsWith('c:') ? key.slice(2) : (CATEGORY_LABELS[key as StoreCategory] ?? key);
        return (
          <View pointerEvents="none" style={[s.ghostCat, { top: catDragState.y - catDragState.touchOffsetY }]}>
            <Ionicons name="reorder-three" size={18} color={c.primary} />
            <Text style={s.ghostCatText} numberOfLines={1}>{key.startsWith('c:') ? `🏷️ ${label}` : label}</Text>
          </View>
        );
      })()}

      {dirty && (
        <View style={s.saveBar}>
          <Pressable
            style={[s.primaryBtn, (saving || visibleEnum.length === 0) && { opacity: 0.4 }]}
            onPress={save}
            disabled={saving || visibleEnum.length === 0}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{str.detail.saveButton}</Text>}
          </Pressable>
        </View>
      )}

      {/* Byt namn-modal */}
      <Modal visible={showRename} transparent animationType="slide" onRequestClose={() => setShowRename(false)}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={s.overlay} onPress={() => setShowRename(false)} />
        <KeyboardAvoidingView behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{str.renameModal.title}</Text>
            <TextInput
              style={s.input}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={renameStore}
            />
            <Pressable
              style={[s.primaryBtn, (!renameValue.trim() || renaming) && { opacity: 0.4 }]}
              onPress={renameStore}
              disabled={renaming || !renameValue.trim()}
            >
              {renaming ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{common.actions.save}</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background },
  header: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  navBtn: { padding: 8 },
  title: { fontSize: 18, fontWeight: '700', color: c.text },
  scroll: { padding: 16 },
  empty: { textAlign: 'center', color: c.textFaint, marginTop: 40 },
  emptyHint: { padding: 14, color: c.danger, fontSize: 13, textAlign: 'center' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5, marginBottom: 6 },
  sectionSub: { fontSize: 13, color: c.textMuted, marginBottom: 14, lineHeight: 18 },
  catList: { backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.surfaceSubtle, overflow: 'hidden' },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle, gap: 8 },
  catRowMuted: { backgroundColor: c.background },
  catRowDragging: { opacity: 0.4 },
  catRowDropTarget: { borderTopWidth: 2, borderTopColor: c.primary },
  catName: { fontSize: 15, color: c.text, flex: 1, flexShrink: 1 },
  catNameMuted: { color: c.textFaint },
  catBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primaryTint },
  catBtnDanger: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.dangerTint },
  // Osynlig platshållare, samma mått som catBtnDanger — håller pilarna på
  // samma plats för standard-rader i den dolda sub-listan (jämte egna rader
  // som har ett extra kryss-ta-bort-knapp längst till vänster).
  catBtnSpacer: { width: 32, height: 32 },
  // Draghandtag för att ordna om kategorier (ersätter upp/ner-pilarna).
  dragHandle: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  ghostCat: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, elevation: 10, zIndex: 100 },
  ghostCatText: { fontSize: 15, fontWeight: '600', color: c.text, flex: 1 },
  expandedBadge: { fontSize: 11, fontWeight: '700', color: c.accent, backgroundColor: c.accent100, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  subList: { paddingLeft: 24, paddingRight: 14, paddingVertical: 8, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  subListHint: { fontSize: 12, color: c.textFaint, marginBottom: 8, lineHeight: 17 },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  subName: { fontSize: 14, color: c.textSecondary, flex: 1, flexShrink: 1 },
  subNameActive: { color: c.accent, fontWeight: '600' },
  subToggle: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface },
  subToggleActive: { borderColor: c.accent, backgroundColor: c.accent },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addInput: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: c.text, backgroundColor: c.inputBg },
  addSubInput: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: c.text, backgroundColor: c.inputBg },
  addSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  addSubText: { fontSize: 14, color: c.primary, fontWeight: '600' },
  addBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary },
  saveBar: { position: 'absolute', left: 16, right: 16, bottom: 20 },
  primaryBtn: { backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', shadowColor: c.primary, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // flex:1 + eget dim-lager: transparent Pressable puttar ner sheeten till botten
  // (annars hamnar den i toppen) och dimmen täcker bakom de rundade hörnen.
  overlay: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: c.borderLight, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12, color: c.text },
});
