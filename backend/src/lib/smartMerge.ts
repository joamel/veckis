// Smart merge-agent: föreslår ihopslagning av dubbletter med blandade enheter
// via förpackningskunskap ("1 paket krossade tomater ≈ 400 g" → 1 paket + 390 g
// = 2 paket, avrundat UPPÅT till hela förpackningar — man köper hela paket).
//
// Kunskapen bor i UnitEquivalence (global tabell som IngredientAlias):
// seedad med vanliga svenska förpackningar, påfylld av Claude Haiku vid behov,
// och promotad/demotad av användarnas faktiska ihopslagningar
// (learnEquivalenceFromMerge). AI anropas ALDRIG i auto-merge-vägen — bara i
// den explicita förslags-endpointen där användaren ändå bekräftar.
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db';
import { VOLUME_TO_ML, MASS_TO_G, combineQuantities } from './unitOrder';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export interface Equivalence {
  baseAmount: number;
  baseUnit: 'g' | 'ml';
}

/** key = förpackningsenhet (gemener, trimmad) för ETT kanoniskt namn */
export type EquivalenceMap = Map<string, Equivalence>;

export interface MergeSuggestion {
  quantity: number;
  unit: string;
  basis: 'exact' | 'equivalence';
}

/**
 * Pure förslagsfunktion. entries = dubblettradernas {quantity, unit},
 * equivalences = kända förpackningsstorlekar för varans kanoniska namn.
 *
 * - Rena volym-/massfamiljer → combineQuantities (basis 'exact').
 * - Minst en förpackningsenhet med känd ekvivalens + lösa g/ml i samma
 *   basfamilj → summera i basenheter och uttryck som HELA förpackningar
 *   (ceil) av den största förpackningsenheten (basis 'equivalence').
 * - Okänd enhet, tom enhet eller blandade basfamiljer → null (konservativt;
 *   anroparen behåller dagens beteende).
 */
export function suggestMerge(
  entries: Array<{ quantity: number; unit: string | null | undefined }>,
  equivalences: EquivalenceMap,
): MergeSuggestion | null {
  if (entries.length === 0) return null;

  const exact = combineQuantities(entries);
  if (exact !== null) return { ...exact, basis: 'exact' };

  // Klassificera varje rad. Någon okänd → ge upp.
  type Classified =
    | { kind: 'loose'; base: number; family: 'g' | 'ml' }
    | { kind: 'packaging'; unit: string; eq: Equivalence; quantity: number };
  const classified: Classified[] = [];
  for (const e of entries) {
    const u = (e.unit ?? '').toLowerCase().trim();
    if (!u) return null;
    if (MASS_TO_G[u] !== undefined) {
      classified.push({ kind: 'loose', base: e.quantity * MASS_TO_G[u], family: 'g' });
    } else if (VOLUME_TO_ML[u] !== undefined) {
      classified.push({ kind: 'loose', base: e.quantity * VOLUME_TO_ML[u], family: 'ml' });
    } else {
      const eq = equivalences.get(u);
      if (!eq) return null;
      classified.push({ kind: 'packaging', unit: u, eq, quantity: e.quantity });
    }
  }

  const packaging = classified.filter(c => c.kind === 'packaging');
  if (packaging.length === 0) return null; // combineQuantities hade redan täckt detta

  // Alla ekvivalenser + lösa rader måste dela EN basfamilj (ingen densitetsgissning).
  const families = new Set<string>(classified.map(c => (c.kind === 'loose' ? c.family : c.eq.baseUnit)));
  if (families.size > 1) return null;

  const total = classified.reduce(
    (sum, c) => sum + (c.kind === 'loose' ? c.base : c.quantity * c.eq.baseAmount),
    0,
  );

  // Målenhet = förpackningsenheten med störst basstorlek.
  const target = packaging.reduce((a, b) => (b.eq.baseAmount > a.eq.baseAmount ? b : a));
  return {
    quantity: Math.ceil(total / target.eq.baseAmount),
    unit: target.unit,
    basis: 'equivalence',
  };
}

/** Är enheten en förpackningsenhet (dvs. varken volym, massa eller tom)? */
export function isPackagingUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? '').toLowerCase().trim();
  return u.length > 0 && MASS_TO_G[u] === undefined && VOLUME_TO_ML[u] === undefined;
}

/**
 * Ladda kända ekvivalenser för varans kanoniska namn (flera varianter kan
 * skickas, t.ex. [stripped, aliasCanonical]). confirmedOnly (Fas 2) begränsar
 * till kunskap en människa/seed har gått i god för.
 */
export async function loadEquivalences(
  canonicalNames: string[],
  opts?: { confirmedOnly?: boolean },
): Promise<EquivalenceMap> {
  const names = [...new Set(canonicalNames.map(n => n.toLowerCase().trim()).filter(Boolean))];
  if (names.length === 0) return new Map();
  const rows = await prisma.unitEquivalence.findMany({ where: { name: { in: names } } });
  const map: EquivalenceMap = new Map();
  for (const r of rows) {
    if (r.seenCount <= 0) continue; // stale — resolveEquivalences frågar om
    if (opts?.confirmedOnly && !(r.source === 'user' || r.source === 'seed' || r.seenCount >= 2)) continue;
    if (r.baseUnit !== 'g' && r.baseUnit !== 'ml') continue;
    // Första namnet i listan vinner vid krock (stripped före alias).
    if (!map.has(r.unit)) map.set(r.unit, { baseAmount: r.baseAmount, baseUnit: r.baseUnit });
  }
  return map;
}

/**
 * Fas 2 (auto-merge): batch-ladda BEKRÄFTADE ekvivalenser för många varor i
 * en query, nycklat på kanoniskt namn. Bekräftad = människa/seed har gått i
 * god (source 'user'/'seed') eller AI-raden setts ≥2 gånger. Rå-AI-gissningar
 * släpps aldrig in i den tysta auto-merge-vägen — de måste passera en
 * användare i dubblettdialogen först.
 */
export async function loadConfirmedEquivalencesByName(names: string[]): Promise<Map<string, EquivalenceMap>> {
  const list = [...new Set(names.map(n => n.toLowerCase().trim()).filter(Boolean))];
  if (list.length === 0) return new Map();
  const rows = await prisma.unitEquivalence.findMany({ where: { name: { in: list } } });
  const out = new Map<string, EquivalenceMap>();
  for (const r of rows) {
    if (r.seenCount <= 0) continue;
    if (!(r.source === 'user' || r.source === 'seed' || r.seenCount >= 2)) continue;
    if (r.baseUnit !== 'g' && r.baseUnit !== 'ml') continue;
    if (!out.has(r.name)) out.set(r.name, new Map());
    const m = out.get(r.name)!;
    if (!m.has(r.unit)) m.set(r.unit, { baseAmount: r.baseAmount, baseUnit: r.baseUnit });
  }
  return out;
}

const EQUIVALENCE_PROMPT = `Du är ett uppslagsverk för typiska svenska förpackningsstorlekar i matbutik.
Du får ett JSON-objekt {"name": <varunamn>, "unit": <förpackningsenhet>} och
svarar med den typiska storleken på EN sådan förpackning i gram eller milliliter.

Regler:
- Svara ENBART med strikt JSON på exakt formen {"baseAmount": <tal>, "baseUnit": "g"} eller {"baseAmount": <tal>, "baseUnit": "ml"} — inga förklaringar, ingen övrig text.
- Använd den vanligaste storleken i svensk dagligvaruhandel (ICA/Coop/Willys).
- Om du inte vet en typisk storlek, eller om enheten inte är en förpackningsenhet, svara exakt: null

Exempel:
{"name":"krossade tomater","unit":"paket"} → {"baseAmount":400,"baseUnit":"g"}
{"name":"kokosmjölk","unit":"burk"} → {"baseAmount":400,"baseUnit":"ml"}
{"name":"jäst","unit":"paket"} → {"baseAmount":50,"baseUnit":"g"}
{"name":"smör","unit":"paket"} → {"baseAmount":500,"baseUnit":"g"}
{"name":"mjölk","unit":"msk"} → null`;

/** Fråga Haiku om typisk förpackningsstorlek. null vid alla fel. */
export async function fetchEquivalenceFromAI(name: string, unit: string): Promise<Equivalence | null> {
  if (!anthropic) return null;
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      system: EQUIVALENCE_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify({ name, unit }) }],
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
    if (!text || text === 'null') return null;
    const parsed = JSON.parse(text) as { baseAmount?: unknown; baseUnit?: unknown } | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const amount = parsed.baseAmount;
    const base = parsed.baseUnit;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 10000) return null;
    if (base !== 'g' && base !== 'ml') return null;
    return { baseAmount: amount, baseUnit: base };
  } catch {
    return null;
  }
}

function upsertEquivalence(name: string, unit: string, eq: Equivalence, source: 'ai'): Promise<unknown> {
  return prisma.unitEquivalence.upsert({
    where: { name_unit: { name, unit } },
    create: { name, unit, baseAmount: eq.baseAmount, baseUnit: eq.baseUnit, source, seenCount: 1 },
    // update-vägen nås bara för stale rader (seenCount <= 0) — skriv över.
    update: { baseAmount: eq.baseAmount, baseUnit: eq.baseUnit, source, seenCount: 1 },
  });
}

/**
 * Lös ekvivalenser för förpackningsenheterna: DB först, AI för missar inom
 * budgetMs. Vid timeout svarar vi utan ekvivalensen men låter AI-anropet
 * fortsätta och upserta i bakgrunden — dialogen degraderar snyggt nu och är
 * blixtsnabb nästa gång.
 */
export async function resolveEquivalences(
  canonicalNames: string[],
  packagingUnits: string[],
  budgetMs = 4000,
): Promise<EquivalenceMap> {
  const map = await loadEquivalences(canonicalNames);
  const primaryName = canonicalNames[0]?.toLowerCase().trim();
  if (!primaryName || !anthropic) return map;

  const missing = [...new Set(packagingUnits.map(u => u.toLowerCase().trim()))]
    .filter(u => u && !map.has(u));
  if (missing.length === 0) return map;

  await Promise.all(missing.map(async unit => {
    const aiPromise = fetchEquivalenceFromAI(primaryName, unit).then(eq => {
      if (eq) upsertEquivalence(primaryName, unit, eq, 'ai').catch(() => {});
      return eq;
    });
    const eq = await Promise.race([
      aiPromise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), budgetMs)),
    ]);
    if (eq) map.set(unit, eq);
    // Vid timeout: aiPromise fortsätter och upsertar — kunskapen finns nästa gång.
  }));
  return map;
}

/**
 * Inlärning från en riktig ihopslagning (fire-and-forget från POST /items/merge).
 * Medvetet INGEN ny inferens — ceil-avrundningen gör total/finalQty till en
 * biased underskattning av verklig förpackningsstorlek. Vi promotar/demotar
 * bara BEFINTLIGA rader genom att räkna om förslaget på backend och jämföra
 * med vad användaren faktiskt valde (litar inte på någon klientflagga).
 */
export async function learnEquivalenceFromMerge(
  sources: Array<{ name: string; quantity: number; unit: string | null }>,
  final: { name: string; quantity: number; unit?: string | null },
  canonicalNames: string[],
): Promise<void> {
  const finalUnit = (final.unit ?? '').toLowerCase().trim();
  if (!isPackagingUnit(finalUnit)) return;
  if (!Number.isInteger(final.quantity) || final.quantity <= 0) return;

  const hasLoose = sources.some(s => {
    const u = (s.unit ?? '').toLowerCase().trim();
    return MASS_TO_G[u] !== undefined || VOLUME_TO_ML[u] !== undefined;
  });
  const hasFinalUnit = sources.some(s => (s.unit ?? '').toLowerCase().trim() === finalUnit);
  if (!hasLoose || !hasFinalUnit) return;

  const rows = await loadEquivalences(canonicalNames);
  if (!rows.has(finalUnit)) return;

  const suggestion = suggestMerge(sources.map(s => ({ quantity: s.quantity, unit: s.unit })), rows);
  if (!suggestion || suggestion.basis !== 'equivalence') return;

  const name = canonicalNames[0]?.toLowerCase().trim();
  if (!name) return;
  const row = await prisma.unitEquivalence.findUnique({ where: { name_unit: { name, unit: finalUnit } } });
  if (!row) return;

  if (suggestion.unit === finalUnit && suggestion.quantity === final.quantity) {
    // Användaren bekräftade förslaget → promota (Fas 2-signal).
    await prisma.unitEquivalence.update({
      where: { id: row.id },
      data: { seenCount: { increment: 1 }, source: 'user' },
    });
  } else if (suggestion.unit === finalUnit && row.source !== 'user' && row.source !== 'seed') {
    // Användaren valde annan mängd för samma enhet → ekvivalensen är suspekt.
    await prisma.unitEquivalence.update({
      where: { id: row.id },
      data: { seenCount: { decrement: row.seenCount > 0 ? 1 : 0 } },
    });
  }
}
