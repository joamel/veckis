/**
 * Startordning för en nyvald butik: hur andra hushåll har sorterat SAMMA
 * butik, annars butiker av samma kedja och format ("ICA Maxi"), annars samma
 * kedja. Förut fick varje ny butik standardordningen, som sällan stämmer —
 * och den som handlade första gången trodde att listan skulle vara rätt.
 *
 * Rena funktioner; datan hämtas av anroparen (routes/stores.ts).
 *
 * Integritet: bara standardkategorier (egna rubriker säger mer om ett hushåll),
 * bara butiker som faktiskt sorterats (orderSource "custom"), och bara när
 * minst MIN_SEED_HOUSEHOLDS hushåll bidrar — samma gräns som förslagen, så att
 * ett enskilt hushålls väg genom butiken aldrig går att läsa ut.
 */
import type { StoreCategory } from '@prisma/client';

export const MIN_SEED_HOUSEHOLDS = 2;

export type SeedLevel = 'shared_store' | 'chain_format' | 'chain';

/**
 * Format inom kedjan ur butikens namn. Layouten skiljer sig mer mellan ICA Nära
 * och ICA Maxi än mellan två ICA Maxi. null när kedjan saknas.
 */
export function storeFormat(chain: string | null | undefined, name: string): string | null {
  if (!chain) return null;
  const n = name.toLowerCase();
  if (chain === 'ICA') {
    if (/\bmaxi\b/.test(n)) return 'ICA Maxi';
    if (/\bkvantum\b/.test(n)) return 'ICA Kvantum';
    if (/\bsupermarket\b/.test(n)) return 'ICA Supermarket';
    if (/\bn[äa]ra\b/.test(n)) return 'ICA Nära';
    return 'ICA';
  }
  if (chain === 'Coop') {
    if (/\bstora coop\b|\bcoop forum\b|\bx-?tra\b|\bextra\b/.test(n)) return 'Stora Coop';
    return 'Coop';
  }
  if (chain === 'Willys') return /\bhemma\b/.test(n) ? 'Willys Hemma' : 'Willys';
  return chain;
}

export type SeedCandidate = {
  householdId: string;
  parentOrder: string[];
};

/**
 * Lägger ihop flera hushålls sorteringar till en ordning: varje kategoris
 * genomsnittliga relativa plats (0 = först, 1 = sist) bland de standard-
 * kategorier hushållet har med. Lika plats avgörs av standardordningen.
 * Ett hushåll med flera butiker på samma nivå räknas en gång (dess första).
 *
 * null när färre än MIN_SEED_HOUSEHOLDS hushåll har en egen ordning.
 */
export function aggregateOrder(candidates: SeedCandidate[], defaultOrder: StoreCategory[]): StoreCategory[] | null {
  const standard = new Set<string>(defaultOrder);
  const isDefault = (o: string[]) => o.length === defaultOrder.length && o.every((k, i) => k === defaultOrder[i]);
  const perHousehold = new Map<string, string[]>();
  for (const c of candidates) {
    if (perHousehold.has(c.householdId)) continue;
    const own = c.parentOrder.filter(k => standard.has(k));
    // En ordning som är standardordningen säger inget om butiken.
    if (own.length < 2 || isDefault(own)) continue;
    perHousehold.set(c.householdId, own);
  }
  if (perHousehold.size < MIN_SEED_HOUSEHOLDS) return null;

  const sum = new Map<string, { total: number; n: number }>();
  for (const order of perHousehold.values()) {
    order.forEach((k, i) => {
      const s = sum.get(k) ?? { total: 0, n: 0 };
      s.total += i / (order.length - 1);
      s.n += 1;
      sum.set(k, s);
    });
  }
  const defaultPos = new Map(defaultOrder.map((k, i) => [k, i / (defaultOrder.length - 1)]));
  // Kategorier ingen har med (dolda eller sammanslagna överallt) får sin plats
  // i standardordningen, så att ingen kategori försvinner ur butiken.
  const score = (k: StoreCategory) => {
    const s = sum.get(k);
    return s ? s.total / s.n : defaultPos.get(k)!;
  };
  return [...defaultOrder].sort((a, b) => score(a) - score(b) || defaultPos.get(a)! - defaultPos.get(b)!);
}

export type SeedResult = { order: StoreCategory[]; level: SeedLevel; label: string };

/** Den mest specifika nivån som har tillräckligt med underlag. */
export function pickSeed(
  levels: { level: SeedLevel; label: string; candidates: SeedCandidate[] }[],
  defaultOrder: StoreCategory[],
): SeedResult | null {
  for (const l of levels) {
    const order = aggregateOrder(l.candidates, defaultOrder);
    if (order) return { order, level: l.level, label: l.label };
  }
  return null;
}
