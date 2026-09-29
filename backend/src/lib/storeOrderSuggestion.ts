/**
 * Steg 4 i "Listan lär sig butikens ordning": föreslå en sektionsordning ur hur
 * man faktiskt bockat i butiken. Ren funktion — datan hämtas av anroparen.
 *
 *  - en HANDLING = en persons bockar (shopperKey) med högst 45 min mellanrum
 *  - massbockar ("markera alla i kategorin") är ingen väg genom butiken
 *  - i varje handling får en sektion sin plats (0–1) efter FÖRSTA bocken i den
 *  - platserna vägs ihop med nyare handlingar tyngre (halveringstid 30 dagar)
 *  - minst tre handlingar totalt, och en sektion måste ha setts i minst två,
 *    innan den flyttas — annars räcker ett enda udda besök för att vända upp
 *    och ned på listan
 *  - sektioner utan tillräckligt med data behåller EXAKT sin plats; bara de
 *    kända byter plats sinsemellan
 */

export type CheckEventLike = {
  shopperKey: string;
  checkedAt: Date;
  bulk: boolean;
  /** Sektionen varan låg i, som nyckel i parentOrder (se sectionKeyFor). */
  section: string;
};

export const TRIP_GAP_MS = 45 * 60 * 1000;
export const MIN_TRIPS = 3;
export const MIN_SECTION_TRIPS = 2;
const HALF_LIFE_DAYS = 30;

export type OrderSuggestion = {
  /** Antal handlingar förslaget bygger på. */
  trips: number;
  /** Föreslagen ordning — samma nycklar som currentOrder. */
  order: string[];
  /** Skiljer sig förslaget från nuvarande ordning? */
  changed: boolean;
  /** Hur många sektioner som hade tillräckligt med data. */
  known: number;
};

/** Delar upp bockar i handlingar: per person, bruten vid mer än 45 min tystnad. */
export function splitTrips(events: CheckEventLike[]): CheckEventLike[][] {
  const byShopper = new Map<string, CheckEventLike[]>();
  for (const e of events) {
    if (e.bulk) continue;
    if (!byShopper.has(e.shopperKey)) byShopper.set(e.shopperKey, []);
    byShopper.get(e.shopperKey)!.push(e);
  }
  const trips: CheckEventLike[][] = [];
  for (const list of byShopper.values()) {
    list.sort((a, b) => a.checkedAt.getTime() - b.checkedAt.getTime());
    let cur: CheckEventLike[] = [];
    for (const e of list) {
      if (cur.length && e.checkedAt.getTime() - cur[cur.length - 1].checkedAt.getTime() > TRIP_GAP_MS) {
        trips.push(cur);
        cur = [];
      }
      cur.push(e);
    }
    if (cur.length) trips.push(cur);
  }
  return trips;
}

export function suggestStoreOrder(events: CheckEventLike[], currentOrder: string[], now: Date): OrderSuggestion {
  // En handling med en enda sektion säger inget om ordningen.
  const trips = splitTrips(events).filter(t => new Set(t.map(e => e.section)).size >= 2);
  const none = { trips: trips.length, order: currentOrder, changed: false, known: 0 };
  if (trips.length < MIN_TRIPS) return none;

  const sum = new Map<string, { weighted: number; weight: number; trips: number }>();
  for (const trip of trips) {
    const firstSeen: string[] = [];
    for (const e of trip) if (!firstSeen.includes(e.section)) firstSeen.push(e.section);
    const ageDays = (now.getTime() - trip[trip.length - 1].checkedAt.getTime()) / 86_400_000;
    const weight = Math.pow(0.5, Math.max(0, ageDays) / HALF_LIFE_DAYS);
    firstSeen.forEach((section, i) => {
      const pos = i / (firstSeen.length - 1);
      const s = sum.get(section) ?? { weighted: 0, weight: 0, trips: 0 };
      s.weighted += pos * weight;
      s.weight += weight;
      s.trips += 1;
      sum.set(section, s);
    });
  }

  const avg = new Map<string, number>();
  for (const [section, s] of sum) {
    if (s.trips >= MIN_SECTION_TRIPS && s.weight > 0) avg.set(section, s.weighted / s.weight);
  }
  // Bara sektioner som finns i butikens ordning kan flyttas.
  const knownInOrder = currentOrder.filter(k => avg.has(k));
  if (knownInOrder.length < 2) return { ...none, known: knownInOrder.length };

  // Stabil sortering: lika snitt behåller nuvarande inbördes ordning.
  const sortedKnown = [...knownInOrder].sort((a, b) => (avg.get(a)! - avg.get(b)!) || (currentOrder.indexOf(a) - currentOrder.indexOf(b)));
  let next = 0;
  const order = currentOrder.map(k => (avg.has(k) ? sortedKnown[next++] : k));
  return { trips: trips.length, order, changed: order.some((k, i) => k !== currentOrder[i]), known: knownInOrder.length };
}

/**
 * Vilken sektion en bock hamnade i, uttryckt som parentOrder-nyckel — med
 * butikens egna val: fritt placerad underkategori, egen kategori, ihopslagning.
 */
export function sectionKeyFor(
  e: { category: string; subCategory: string | null; customCategory: string | null; customSubCategory: string | null },
  store: { parentOrder: string[]; categoryMerge: Record<string, string> },
): string {
  const resolve = (key: string) => {
    let cur = key;
    const seen = new Set<string>();
    while (store.categoryMerge[cur] && !seen.has(cur)) { seen.add(cur); cur = store.categoryMerge[cur]; }
    return cur;
  };
  const parent = e.customCategory ? `c:${e.customCategory}` : resolve(e.category);
  if (e.customSubCategory) {
    const key = `cs:${parent}:${e.customSubCategory}`;
    if (store.parentOrder.includes(key)) return key;
  }
  if (e.subCategory && store.parentOrder.includes(`s:${e.subCategory}`)) return `s:${e.subCategory}`;
  return parent;
}
