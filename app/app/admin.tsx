// Adminsidan — bara för appens ägare. Ersätter skripten som kördes för hand
// mot prod: överblick över klassningen (oense hushåll, namn utan regel,
// kandidater, nya hushåll) och handskrivna klassningar som går före reglerna
// i koden. Varje skrivning förhandsvisas först och loggas i backenden.
// Byggd främst för webben på datorn, men fungerar i appen.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_LABELS, SUB_TAXONOMY, subsForParent, type StoreCategory, type SubCategory } from '@veckis/shared';
import { useTheme } from '../src/context/ThemeContext';
import { useToast } from '../src/context/ToastContext';
import { useApiClient, type AdminClassifyReport, type AdminCurationImpact, type AdminJob, type AdminJobRow, type AdminNameImpact, type AdminVoteRow } from '../src/api/client';
import { Pressable } from '../src/components/Pressable';
import { DraggableBottomSheet } from '../src/components/DraggableBottomSheet';
import { NyHeader } from '../src/components/nydesign/NyHeader';
import { useBottomGap } from '../src/hooks/useBottomGap';
import { nyFont, type NyPalett } from '../src/lib/nyDesign';
import { admin as str, common } from '../src/lib/svenska';

type Tab = 'votes' | 'gaps' | 'candidates' | 'curated' | 'names' | 'cleanup' | 'jobs' | 'households';
const TABS: Tab[] = ['votes', 'gaps', 'candidates', 'curated', 'names', 'cleanup', 'jobs', 'households'];
/** Flikar där en rad öppnar namnarket (byt namn/radera) i stället för klassningen. */
const NAME_TABS: Tab[] = ['names', 'cleanup'];

/** En rad i en lista: ett namn att klassa eller städa, eller (nya hushåll) bara information. */
type Row = { key: string; title: string; meta: string; name?: string; suggestedName?: string; job?: AdminJob };

const catLabel = (key: string) => CATEGORY_LABELS[key as StoreCategory] ?? key;
const subLabel = (key: string | null) => (key ? SUB_TAXONOMY[key as SubCategory]?.label ?? key : null);
const answer = (category: string, sub: string | null) => [catLabel(category), subLabel(sub)].filter(Boolean).join(' / ');

export default function AdminScreen() {
  const { ny } = useTheme();
  const s = useMemo(() => makeStyles(ny), [ny]);
  const router = useRouter();
  const client = useApiClient();
  const { showError } = useToast();
  const bottomGap = useBottomGap();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('votes');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [classifyName, setClassifyName] = useState<string | null>(null);
  const [nameTarget, setNameTarget] = useState<{ name: string; suggestedName?: string } | null>(null);
  const [nameQuery, setNameQuery] = useState('');
  const [job, setJob] = useState<AdminJob | null>(null);

  useEffect(() => {
    client.getIsAppAdmin().then(r => setIsAdmin(r.isAdmin)).catch(() => setIsAdmin(false));
  }, [client]);

  const load = useCallback(async (t: Tab, q = '') => {
    setRows(null);
    setSummary(null);
    try {
      if (t === 'votes') {
        const r = await client.adminCategoryVotes(1);
        setRows(r.rader.map((v: AdminVoteRow) => ({
          key: v.name,
          name: v.name,
          title: v.name,
          meta: [
            str.rows.disagree(v.disagreeing, v.households),
            answer(v.curated.category, v.curated.subCategory),
            v.categories.length ? str.rows.choices(v.categories.map(c => `${catLabel(c.category)} ×${c.households}`).join(', ')) : null,
          ].filter(Boolean).join(' · '),
        })));
      } else if (t === 'gaps') {
        const r = await client.adminCategoryGaps();
        setRows(r.luckor.map((l, i) => ({ key: `${l.namn}-${i}`, name: l.namn, title: l.namn, meta: `${str.rows.seen(l.seenCount)} · ${catLabel(l.lagradKategori)}` })));
      } else if (t === 'candidates') {
        const r = await client.adminCandidates();
        setRows(r.rader.map(k => ({ key: k.name, name: k.name, title: k.name, meta: `${str.rows.seen(k.seenCount)} · ${catLabel(k.category)}` })));
      } else if (t === 'names') {
        const r = await client.adminNames(q);
        setRows(r.rader.map((n, i) => ({
          key: `${n.name}-${i}`, name: n.name, title: n.name,
          meta: [str.rows.weight(n.weight), n.junk ? str.rows.junk(n.junk) : null].filter(Boolean).join(' · '),
        })));
        setSummary(str.rows.namesTotal(Math.min(r.rader.length, r.totalt), r.totalt));
      } else if (t === 'cleanup') {
        const r = await client.adminNameSuggestions();
        setRows(r.rader.map((n, i) => ({
          key: `${n.name}-${i}`, name: n.name, title: n.name,
          suggestedName: n.action === 'rename' ? n.to : undefined,
          meta: `${str.rows.weight(n.weight)} · ${n.action === 'rename' ? str.rows.suggestRename(n.to, n.reason) : str.rows.suggestDelete(n.reason)}`,
        })));
      } else if (t === 'jobs') {
        const r = await client.adminJobs();
        setRows(r.map(j => ({ key: j.id, title: j.title, meta: j.description, job: j })));
      } else if (t === 'curated') {
        const r = await client.adminCurated();
        setRows(r.map(k => ({ key: k.name, name: k.name, title: k.name, meta: answer(k.category, k.subCategory) })));
      } else {
        const r = await client.adminNewHouseholds();
        const date = (iso: string) => new Date(iso).toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        setRows(r.rader.map((h, i) => ({ key: `${h.createdAt}-${i}`, title: date(h.createdAt), meta: str.rows.household(date(h.createdAt), h.members, h.recipes, h.lists, h.items, h.menuItems) })));
        setSummary(str.rows.householdsSummary(r.rader.length, r.rader.filter(h => h.recipes + h.lists + h.menuItems > 0).length));
      }
    } catch (e) {
      setRows([]);
      showError(e, str.empty);
    }
  }, [client, showError]);

  useEffect(() => { if (isAdmin) load(tab); }, [isAdmin, tab, load]);
  // Stabila, så arket inte hämtar om (och nollställer valen) vid varje omritning.
  const closeSheet = useCallback(() => setClassifyName(null), []);
  const closeNameSheet = useCallback(() => setNameTarget(null), []);
  const closeJobSheet = useCallback(() => setJob(null), []);
  const reloadTab = useCallback(() => load(tab, tab === 'names' ? nameQuery.trim() : ''), [load, tab, nameQuery]);
  const openClassify = useCallback((name: string) => { setNameTarget(null); setClassifyName(name); }, []);

  const header = <NyHeader title={str.title} onBack={() => router.back()} backLabel={str.backA11y} />;

  if (isAdmin === null || isAdmin === false) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
        {header}
        <View style={s.center}>
          {isAdmin === null ? <ActivityIndicator color={ny.skog} /> : <Text style={s.meta}>{str.notAdmin}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
      {header}
      <ScrollView style={s.body} contentContainerStyle={[s.content, { paddingBottom: bottomGap + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={s.searchRow}>
          <TextInput
            style={s.input}
            value={query}
            onChangeText={setQuery}
            placeholder={str.searchPlaceholder}
            placeholderTextColor={ny.textDampad}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => { if (query.trim()) setClassifyName(query.trim()); }}
          />
          <Pressable style={s.iconBtn} onPress={() => { if (query.trim()) setClassifyName(query.trim()); }} accessibilityLabel={str.searchPlaceholder}>
            <Ionicons name="arrow-forward" size={20} color={ny.skog} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
          {TABS.map(t => (
            <Pressable key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)} accessibilityRole="button" accessibilityState={{ selected: tab === t }}>
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>{str.tabs[t]}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={s.hint}>{str.tabHint[tab]}</Text>
        {tab === 'names' && (
          <TextInput
            style={[s.input, { marginBottom: 12 }]}
            value={nameQuery}
            onChangeText={setNameQuery}
            placeholder={str.nameFilter}
            placeholderTextColor={ny.textDampad}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => load('names', nameQuery.trim())}
          />
        )}
        {summary && <Text style={s.summary}>{summary}</Text>}

        {rows === null ? (
          <ActivityIndicator color={ny.skog} style={{ marginTop: 24 }} />
        ) : rows.length === 0 ? (
          <Text style={s.meta}>{str.empty}</Text>
        ) : (
          <View style={s.group}>
            {rows.map((r, i) => (
              <Pressable
                key={r.key}
                style={[s.row, i > 0 && s.rowBorder]}
                onPress={r.job
                  ? () => setJob(r.job!)
                  : r.name
                    ? () => (NAME_TABS.includes(tab) ? setNameTarget({ name: r.name!, suggestedName: r.suggestedName }) : setClassifyName(r.name!))
                    : undefined}
                disabled={!r.name && !r.job}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{r.title}</Text>
                  <Text style={s.meta}>{r.meta}</Text>
                </View>
                {(r.name || r.job) && <Ionicons name="chevron-forward" size={16} color={ny.kontur} />}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <ClassifySheet
        name={classifyName}
        onClose={closeSheet}
        onChanged={reloadTab}
      />
      <JobSheet job={job} onClose={closeJobSheet} />
      <NameSheet
        target={nameTarget}
        onClose={closeNameSheet}
        onChanged={reloadTab}
        onClassify={openClassify}
      />
    </SafeAreaView>
  );
}

function ClassifySheet({ name, onClose, onChanged }: { name: string | null; onClose: () => void; onChanged: () => void }) {
  const { ny } = useTheme();
  const s = useMemo(() => makeStyles(ny), [ny]);
  const client = useApiClient();
  const { showToast, showError } = useToast();

  const [report, setReport] = useState<AdminClassifyReport | null>(null);
  const [category, setCategory] = useState<StoreCategory>('other');
  const [subCategory, setSubCategory] = useState<string | null>(null);
  const [moveItems, setMoveItems] = useState(true);
  const [impact, setImpact] = useState<AdminCurationImpact | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReport(null);
    setImpact(null);
    if (!name) return;
    client.adminClassify(name)
      .then(r => { setReport(r); setCategory(r.category as StoreCategory); setSubCategory(r.subCategory); })
      .catch(e => { showError(e, str.empty); onClose(); });
  }, [name, client, showError, onClose]);

  // Ett nytt val gör förhandsvisningen inaktuell.
  useEffect(() => { setImpact(null); }, [category, subCategory, moveItems]);

  async function preview() {
    if (!report) return;
    setBusy(true);
    try { setImpact(await client.adminCurationPreview({ name: report.name, category, subCategory })); }
    catch (e) { showError(e, str.sheet.preview); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!report) return;
    setBusy(true);
    try {
      const r = await client.adminCurate({ name: report.name, category, subCategory, moveItems });
      showToast(str.sheet.saved(r.name, r.itemsMoved), 'success');
      onChanged();
      onClose();
    } catch (e) { showError(e, str.sheet.save); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!report) return;
    setBusy(true);
    try {
      await client.adminRemoveCuration(report.name);
      showToast(str.sheet.removed(report.name), 'success');
      onChanged();
      onClose();
    } catch (e) { showError(e, str.sheet.remove); }
    finally { setBusy(false); }
  }

  const subs = subsForParent(category);

  return (
    <DraggableBottomSheet visible={!!name} onRequestClose={onClose} title={name ?? ''} sheetStyle={{ maxHeight: '90%' }}>
      {!report ? (
        <ActivityIndicator color={ny.skog} style={{ marginVertical: 24 }} />
      ) : (
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
          <Text style={s.label}>{str.sheet.now}</Text>
          <Text style={s.answer}>{answer(report.category, report.subCategory)}</Text>
          <Text style={s.meta}>{str.sheet.because(str.sources[report.source] ?? report.source)}</Text>
          <Text style={s.meta}>
            {str.sheet.households(report.households)}
            {report.choices.length ? ` ${str.sheet.choices(report.choices.map(c => `${catLabel(c.category)} ×${c.households}`).join(', '))}` : ''}
            {` ${str.sheet.openItems(report.openItems)}`}
          </Text>

          <Text style={[s.label, { marginTop: 16 }]}>{str.sheet.category}</Text>
          <View style={s.chips}>
            {(Object.keys(CATEGORY_LABELS) as StoreCategory[]).map(cat => (
              <Pressable key={cat} style={[s.chip, category === cat && s.chipActive]} onPress={() => { setCategory(cat); setSubCategory(null); }}>
                <Text style={[s.chipText, category === cat && s.chipTextActive]}>{CATEGORY_LABELS[cat]}</Text>
              </Pressable>
            ))}
          </View>

          {subs.length > 0 && (
            <>
              <Text style={[s.label, { marginTop: 12 }]}>{str.sheet.subCategory}</Text>
              <View style={s.chips}>
                <Pressable style={[s.chip, !subCategory && s.chipActive]} onPress={() => setSubCategory(null)}>
                  <Text style={[s.chipText, !subCategory && s.chipTextActive]}>{str.sheet.none}</Text>
                </Pressable>
                {subs.map(sub => (
                  <Pressable key={sub} style={[s.chip, subCategory === sub && s.chipActive]} onPress={() => setSubCategory(sub)}>
                    <Text style={[s.chipText, subCategory === sub && s.chipTextActive]}>{SUB_TAXONOMY[sub].label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <View style={s.switchRow}>
            <Text style={[s.rowTitle, { flex: 1 }]}>{str.sheet.moveItems}</Text>
            <Switch value={moveItems} onValueChange={setMoveItems} trackColor={{ true: ny.skog }} />
          </View>

          {impact && (
            <Text style={s.impact}>
              {answer(impact.before.category, impact.before.subCategory)} → {answer(impact.after.category, impact.after.subCategory)}.{' '}
              {str.sheet.impact(impact.guessedStaples, impact.chosenStaples, impact.chosenDiffering, impact.itemsToMove, moveItems)}
            </Text>
          )}

          <View style={s.actions}>
            {impact ? (
              <Pressable style={[s.primaryBtn, busy && { opacity: 0.5 }]} onPress={save} disabled={busy}>
                <Text style={s.primaryBtnText}>{str.sheet.save}</Text>
              </Pressable>
            ) : (
              <Pressable style={[s.secondaryBtn, busy && { opacity: 0.5 }]} onPress={preview} disabled={busy}>
                <Text style={s.secondaryBtnText}>{str.sheet.preview}</Text>
              </Pressable>
            )}
            {report.override && (
              <Pressable style={s.linkBtn} onPress={remove} disabled={busy}>
                <Text style={s.dangerText}>{str.sheet.remove}</Text>
              </Pressable>
            )}
            <Pressable style={s.linkBtn} onPress={onClose} disabled={busy}>
              <Text style={s.linkText}>{common.actions.cancel}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </DraggableBottomSheet>
  );
}

/**
 * Ett städjobb: förhandsvisa förslagen, bocka ur det som inte ska med, kör.
 * Backenden kontrollerar varje vald rad igen innan den skrivs.
 */
function JobSheet({ job, onClose }: { job: AdminJob | null; onClose: () => void }) {
  const { ny } = useTheme();
  const s = useMemo(() => makeStyles(ny), [ny]);
  const client = useApiClient();
  const { showToast, showError } = useToast();

  const [plan, setPlan] = useState<{ total: number; rows: AdminJobRow[]; note: string | null } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => { setPlan(null); setSelected(new Set()); }, [job]);

  async function preview() {
    if (!job) return;
    setBusy(true);
    try {
      const p = await client.adminJobPlan(job.id);
      setPlan(p);
      setSelected(new Set(p.rows.map(r => r.key)));
    } catch (e) { showError(e, str.jobSheet.preview); }
    finally { setBusy(false); }
  }

  async function run() {
    if (!job || !plan) return;
    const rows = plan.rows.filter(r => selected.has(r.key)).map(r => ({ key: r.key, to: r.to }));
    if (!rows.length) return;
    setBusy(true);
    try {
      const r = await client.adminJobApply(job.id, rows);
      showToast(r.summary, 'success');
      onClose();
    } catch (e) { showError(e, str.jobSheet.run(rows.length)); }
    finally { setBusy(false); }
  }

  const toggle = (key: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <DraggableBottomSheet visible={!!job} onRequestClose={onClose} title={job?.title ?? ''} sheetStyle={{ maxHeight: '90%' }}>
      {job && (
        <ScrollView style={{ flexShrink: 1 }}>
          <Text style={s.meta}>{job.description}</Text>
          {job.usesAi && <Text style={[s.meta, { marginTop: 6 }]}>{str.jobSheet.aiNote}</Text>}

          {!plan ? (
            <View style={s.actions}>
              <Pressable style={[s.secondaryBtn, busy && { opacity: 0.5 }]} onPress={preview} disabled={busy}>
                {busy ? <ActivityIndicator color={ny.lime} /> : <Text style={s.secondaryBtnText}>{str.jobSheet.preview}</Text>}
              </Pressable>
            </View>
          ) : plan.rows.length === 0 ? (
            <Text style={[s.summary, { marginTop: 16 }]}>{str.jobSheet.nothing}{plan.note ? ` ${plan.note}` : ''}</Text>
          ) : (
            <>
              <Text style={[s.summary, { marginTop: 16 }]}>{str.jobSheet.total(plan.rows.length, plan.total)}{plan.note ? ` ${plan.note}` : ''}</Text>
              <View style={s.selectRow}>
                <Pressable onPress={() => setSelected(new Set(plan.rows.map(r => r.key)))}><Text style={s.linkText}>{str.jobSheet.selectAll}</Text></Pressable>
                <Pressable onPress={() => setSelected(new Set())}><Text style={s.linkText}>{str.jobSheet.selectNone}</Text></Pressable>
              </View>
              <View style={s.group}>
                {plan.rows.map((r, i) => {
                  const on = selected.has(r.key);
                  return (
                    <Pressable
                      key={r.key}
                      style={[s.row, i > 0 && s.rowBorder]}
                      onPress={() => toggle(r.key)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={str.jobSheet.rowA11y(r.label, on)}
                    >
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? ny.skog : ny.kontur} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowTitle}>{r.label}</Text>
                        <Text style={s.meta}>{r.table} · {r.from} → {r.to}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <View style={s.actions}>
                <Pressable style={[s.primaryBtn, (busy || selected.size === 0) && { opacity: 0.5 }]} onPress={run} disabled={busy || selected.size === 0}>
                  {busy ? <ActivityIndicator color={ny.skog} /> : <Text style={s.primaryBtnText}>{str.jobSheet.run(selected.size)}</Text>}
                </Pressable>
              </View>
            </>
          )}
          <Pressable style={s.linkBtn} onPress={onClose} disabled={busy}>
            <Text style={s.linkText}>{common.actions.cancel}</Text>
          </Pressable>
        </ScrollView>
      )}
    </DraggableBottomSheet>
  );
}

/**
 * Byt namn på eller radera ett varunamn i den gemensamma poolen och
 * hushållens basvaror. Alltid förhandsvisning först — radering är permanent.
 */
function NameSheet({ target, onClose, onChanged, onClassify }: {
  target: { name: string; suggestedName?: string } | null;
  onClose: () => void;
  onChanged: () => void;
  onClassify: (name: string) => void;
}) {
  const { ny } = useTheme();
  const s = useMemo(() => makeStyles(ny), [ny]);
  const client = useApiClient();
  const { showToast, showError } = useToast();

  const [usage, setUsage] = useState<AdminNameImpact | null>(null);
  const [newName, setNewName] = useState('');
  const [preview, setPreview] = useState<{ kind: 'rename'; to: AdminNameImpact } | { kind: 'delete' } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUsage(null);
    setPreview(null);
    if (!target) return;
    setNewName(target.suggestedName ?? target.name);
    client.adminNameImpact(target.name)
      .then(r => setUsage(r.from))
      .catch(e => { showError(e, str.empty); onClose(); });
  }, [target, client, showError, onClose]);

  // Ett nytt namn gör förhandsvisningen inaktuell.
  useEffect(() => { setPreview(null); }, [newName]);

  const to = newName.trim().toLowerCase();
  const canRename = !!target && !!to && to !== target.name;

  async function previewRename() {
    if (!target || !canRename) return;
    setBusy(true);
    try {
      const r = await client.adminNameImpact(target.name, to);
      if (r.to) setPreview({ kind: 'rename', to: r.to });
    } catch (e) { showError(e, str.nameSheet.previewRename); }
    finally { setBusy(false); }
  }

  async function run(action: () => Promise<unknown>, message: string, fallback: string) {
    setBusy(true);
    try { await action(); showToast(message, 'success'); onChanged(); onClose(); }
    catch (e) { showError(e, fallback); }
    finally { setBusy(false); }
  }

  return (
    <DraggableBottomSheet visible={!!target} onRequestClose={onClose} title={target?.name ?? ''} sheetStyle={{ maxHeight: '90%' }}>
      {!usage || !target ? (
        <ActivityIndicator color={ny.skog} style={{ marginVertical: 24 }} />
      ) : (
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
          <Text style={s.meta}>{str.nameSheet.usage(usage.aliasRows, usage.staples, usage.households)}</Text>

          <Text style={[s.label, { marginTop: 16 }]}>{str.nameSheet.newName}</Text>
          <TextInput
            style={s.input}
            value={newName}
            onChangeText={setNewName}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={previewRename}
          />

          {preview && (
            <Text style={s.impact}>
              {preview.kind === 'rename'
                ? (preview.to.aliasRows + preview.to.staples > 0 ? str.nameSheet.targetExists(to, preview.to.households) : str.nameSheet.targetNew(to))
                : str.nameSheet.deleteWarning}
            </Text>
          )}

          <View style={s.actions}>
            {preview?.kind === 'rename' ? (
              <Pressable
                style={[s.primaryBtn, busy && { opacity: 0.5 }]}
                disabled={busy}
                onPress={() => run(() => client.adminRenameIngredient(target.name, to), str.nameSheet.renamed(target.name, to), str.nameSheet.rename)}
              >
                <Text style={s.primaryBtnText}>{str.nameSheet.rename}</Text>
              </Pressable>
            ) : preview?.kind === 'delete' ? (
              <Pressable
                style={[s.dangerBtn, busy && { opacity: 0.5 }]}
                disabled={busy}
                onPress={() => run(() => client.adminDeleteIngredient(target.name), str.nameSheet.deleted(target.name), str.nameSheet.delete)}
              >
                <Text style={s.dangerBtnText}>{str.nameSheet.delete}</Text>
              </Pressable>
            ) : (
              <>
                <Pressable style={[s.secondaryBtn, (!canRename || busy) && { opacity: 0.5 }]} onPress={previewRename} disabled={!canRename || busy}>
                  <Text style={s.secondaryBtnText}>{str.nameSheet.previewRename}</Text>
                </Pressable>
                <Pressable style={s.linkBtn} onPress={() => setPreview({ kind: 'delete' })} disabled={busy}>
                  <Text style={s.dangerText}>{str.nameSheet.previewDelete}</Text>
                </Pressable>
              </>
            )}
            <Pressable style={s.linkBtn} onPress={() => onClassify(target.name)} disabled={busy}>
              <Text style={s.linkText}>{str.nameSheet.classify}</Text>
            </Pressable>
            <Pressable style={s.linkBtn} onPress={onClose} disabled={busy}>
              <Text style={s.linkText}>{common.actions.cancel}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </DraggableBottomSheet>
  );
}

// Byggd för webben på datorn i första hand: innehållet hålls i en lagom bred
// kolumn så långa listor går att läsa på en stor skärm.
const makeStyles = (ny: NyPalett) => StyleSheet.create({
  container: { flex: 1, backgroundColor: ny.skog },
  body: { flex: 1, backgroundColor: ny.bakgrund },
  content: { padding: 16, width: '100%', maxWidth: 900, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: ny.bakgrund },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, color: ny.text, borderWidth: 1, borderColor: ny.kontur, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: ny.kort },
  iconBtn: { width: 46, height: 46, borderRadius: 14, backgroundColor: ny.lime, alignItems: 'center', justifyContent: 'center' },
  tabs: { gap: 8, paddingVertical: 14 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: ny.bricka },
  tabActive: { backgroundColor: ny.skog },
  tabText: { fontFamily: nyFont.halvfet, fontSize: 14, color: ny.chipText },
  tabTextActive: { color: ny.lime },
  hint: { fontSize: 13, color: ny.textDampad, lineHeight: 19, marginBottom: 12 },
  summary: { fontFamily: nyFont.halvfet, fontSize: 14, color: ny.text, marginBottom: 12 },
  group: { backgroundColor: ny.kort, borderRadius: 18, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: ny.bricka },
  rowTitle: { fontFamily: nyFont.halvfet, fontSize: 15, color: ny.text },
  meta: { fontSize: 13, color: ny.textDampad, marginTop: 2, lineHeight: 18 },
  label: { fontFamily: nyFont.fet, fontSize: 12, letterSpacing: 0.6, color: ny.padYta, textTransform: 'uppercase', marginBottom: 6 },
  answer: { fontFamily: nyFont.fet, fontSize: 18, color: ny.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: ny.bricka },
  chipActive: { backgroundColor: ny.skog },
  chipText: { fontSize: 13, color: ny.chipText, fontFamily: nyFont.halvfet },
  chipTextActive: { color: ny.lime },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  impact: { marginTop: 14, fontSize: 14, lineHeight: 20, color: ny.text, backgroundColor: ny.bricka, borderRadius: 12, padding: 12 },
  actions: { marginTop: 16, gap: 8 },
  primaryBtn: { backgroundColor: ny.lime, borderRadius: 14, padding: 16, alignItems: 'center' },
  primaryBtnText: { color: ny.skog, fontSize: 16, fontFamily: nyFont.fet },
  secondaryBtn: { backgroundColor: ny.skog, borderRadius: 14, padding: 16, alignItems: 'center' },
  secondaryBtnText: { color: ny.lime, fontSize: 16, fontFamily: nyFont.fet },
  linkBtn: { padding: 10, alignItems: 'center' },
  linkText: { color: ny.padYta, fontSize: 15, fontFamily: nyFont.halvfet },
  dangerText: { color: ny.fara, fontSize: 15, fontFamily: nyFont.halvfet },
  selectRow: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  dangerBtn: { backgroundColor: ny.fara, borderRadius: 14, padding: 16, alignItems: 'center' },
  dangerBtnText: { color: ny.kort, fontSize: 16, fontFamily: nyFont.fet },
});
