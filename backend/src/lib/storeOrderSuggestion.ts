/**
 * Steg 4 i "Listan lär sig butikens ordning": föreslå en sektionsordning ur hur
 * man faktiskt bockat i butiken. Rena funktioner — datan hämtas av anroparen.
 *
 * Två nivåer med olika krav, eftersom felen kostar olika mycket:
 *
 *  - MELLAN sektioner (suggestStoreOrder) är ett fel en promenad tillbaka genom
 *    butiken. Där krävs stark, samstämmig bevisning, och förslaget visas för
 *    användaren innan det används.
 *  - INOM en sektion (learnInnerOrder) är ett fel några steg i samma gång. Där
 *    räcker en enda handling, och ordningen används direkt i listan.
 *
 * Gemensamt:
 *  - en HANDLING = en persons bockar (shopperKey) med högst 45 min mellanrum
 *  - massbockar ("markera alla i kategorin") är ingen väg genom butiken, och
 *    inte heller SKURAR: bockar i tre eller fler sektioner med några sekunders
 *    mellanrum är bockar i efterhand (vid kassan, hemma), inte en promenad
 *  - nyare handlingar väger tyngre (halveringstid 30 dagar)
 */

export type CheckEventLike = {
  shopperKey: string;
  checkedAt: Date;
  bulk: boolean;
  /** Sektionen varan låg i, som nyckel i parentOrder (se sectionKeyFor). */
  section: string;
};

export const TRIP_GAP_MS = 45 * 60 * 1000;
/** Bockar tätare än så räknas som samma skur. */
export const BURST_GAP_MS = 5_000;
/** En skur som spänner över så många sektioner är bockar i efterhand. */
export const BURST_MIN_SECTIONS = 3;
/** Andra hushålls bockar räknas bara när minst så många bidrar — ett enda
 *  annat hushålls väg genom butiken ska aldrig gå att läsa ut ur förslaget. */
export const MIN_OTHER_HOUSEHOLDS = 2;
/** Två sektioner byter plats först när de setts i samma handling så många
 *  gånger … */
export const MIN_PAIR_TRIPS = 4;
/** … och minst så stor (viktad) andel av gångerna i den nya ordningen. */
export const MIN_PAIR_AGREEMENT = 0.8;
/** Handlingar som behövs innan ett förslag alls är möjligt. */
export const MIN_TRIPS = MIN_PAIR_TRIPS;
const HALF_LIFE_DAYS = 30;

export type SectionMove = {
  key: string;
  /** Sektionen den hamnar direkt efter i förslaget; null = först. */
  after: string | null;
};

export type OrderSuggestion = {
  /** Antal handlingar förslaget bygger på. */
  trips: number;
  /** Föreslagen ordning — samma nycklar som currentOrder. */
  order: string[];
  /** Skiljer sig förslaget från nuvarande ordning? */
  changed: boolean;
  /** Hur många sektioner som hade tillräckligt med data. */
  known: number;
  /** Det som flyttas, så användaren kan bedöma förslaget utan att jämföra två
   *  långa listor. Det minsta antalet flyttar som ger förslaget. */
  moves: SectionMove[];
};

/** Delar upp bockar i handlingar: per person, bruten vid mer än 45 min tystnad. */
export function splitTrips<T extends CheckEventLike>(events: T[]): T[][] {
  const byShopper = new Map<string, T[]>();
  for (const e of events) {
    if (e.bulk) continue;
    if (!byShopper.has(e.shopperKey)) byShopper.set(e.shopperKey, []);
    byShopper.get(e.shopperKey)!.push(e);
  }
  const trips: T[][] = [];
  for (const list of byShopper.values()) {
    list.sort((a, b) => a.checkedAt.getTime() - b.checkedAt.getTime());
    let cur: T[] = [];
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

/**
 * Tar bort bockar i efterhand ur en handling: en skur (bockar högst några
 * sekunder isär) som spänner över minst tre sektioner. Flera varor från samma
 * hylla i snabb följd är däremot en vanlig promenad och står kvar.
 */
export function dropBursts<T extends CheckEventLike>(trip: T[]): T[] {
  const out: T[] = [];
  let run: T[] = [];
  const flush = () => {
    if (new Set(run.map(e => e.section)).size < BURST_MIN_SECTIONS) out.push(...run);
    run = [];
  };
  for (const e of trip) {
    if (run.length && e.checkedAt.getTime() - run[run.length - 1].checkedAt.getTime() > BURST_GAP_MS) flush();
    run.push(e);
  }
  flush();
  return out;
}

/** Handlingarna ett förslag får bygga på: utan massbockar och skurar. */
export function usableTrips<T extends CheckEventLike>(events: T[]): T[][] {
  return splitTrips(events).map(dropBursts).filter(t => t.length > 0);
}

function weightFor(trip: CheckEventLike[], now: Date): number {
  const ageDays = (now.getTime() - trip[trip.length - 1].checkedAt.getTime()) / 86_400_000;
  return Math.pow(0.5, Math.max(0, ageDays) / HALF_LIFE_DAYS);
}

function firstSeen<T>(xs: T[]): T[] {
  const out: T[] = [];
  for (const x of xs) if (!out.includes(x)) out.push(x);
  return out;
}

/** Nycklar som behåller sin inbördes ordning — resten är det som flyttats. */
function longestCommonSubsequence(a: string[], b: string[]): Set<string> {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const keep = new Set<string>();
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { keep.add(a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return keep;
}

/**
 * Föreslår en sektionsordning — strikt. I stället för ett snitt av var varje
 * sektion legat (som en enda glömd bock sist i en liten handling kunde dra iväg)
 * jämförs sektionerna PARVIS: A hamnar före B bara om de setts i samma handling
 * minst MIN_PAIR_TRIPS gånger och A kom först i minst MIN_PAIR_AGREEMENT av
 * dem. Par med splittrad bild flyttar ingenting.
 *
 * En sektion som ofta säger emot sig själv — ibland tidigt, ibland sent mot
 * samma grannar — står troligen på flera ställen i butiken (glutenfritt bröd
 * vid bageriet, glutenfri pizza i frysen). Den flyttas aldrig.
 *
 * Allt som inte styrs av ett starkt par står kvar så nära sin plats som
 * möjligt: ordningen byggs med nuvarande plats som utslagsfråga.
 */
export function suggestStoreOrder(events: CheckEventLike[], currentOrder: string[], now: Date): OrderSuggestion {
  // En handling med en enda sektion säger inget om ordningen.
  const trips = usableTrips(events).filter(t => new Set(t.map(e => e.section)).size >= 2);
  const none: OrderSuggestion = { trips: trips.length, order: currentOrder, changed: false, known: 0, moves: [] };
  if (trips.length < MIN_TRIPS) return none;

  const inOrder = new Set(currentOrder);
  // pairs.get(a).get(b) = viktad mängd "a före b" och antal handlingar med båda.
  const pairs = new Map<string, Map<string, { w: number; n: number }>>();
  const add = (a: string, b: string, w: number) => {
    if (!pairs.has(a)) pairs.set(a, new Map());
    const m = pairs.get(a)!;
    const cur = m.get(b) ?? { w: 0, n: 0 };
    m.set(b, { w: cur.w + w, n: cur.n + 1 });
  };
  for (const trip of trips) {
    const w = weightFor(trip, now);
    const seq = firstSeen(trip.map(e => e.section)).filter(k => inOrder.has(k));
    for (let i = 0; i < seq.length; i++) for (let j = i + 1; j < seq.length; j++) add(seq[i], seq[j], w);
  }
  const get = (a: string, b: string) => pairs.get(a)?.get(b) ?? { w: 0, n: 0 };

  const keys = [...inOrder];
  const contradictions = new Map<string, number>();
  const supported = new Map<string, number>();
  const strong: [string, string][] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j];
      const ab = get(a, b), ba = get(b, a);
      const n = ab.n + ba.n;
      if (n < 3) continue;
      const share = ab.w / (ab.w + ba.w);
      for (const k of [a, b]) supported.set(k, (supported.get(k) ?? 0) + 1);
      if (share > 0.3 && share < 0.7) for (const k of [a, b]) contradictions.set(k, (contradictions.get(k) ?? 0) + 1);
      if (n < MIN_PAIR_TRIPS) continue;
      if (share >= MIN_PAIR_AGREEMENT) strong.push([a, b]);
      else if (1 - share >= MIN_PAIR_AGREEMENT) strong.push([b, a]);
    }
  }
  // Säger emot sig mot flera grannar, och mot minst en tredjedel av dem.
  const unstable = new Set(keys.filter(k => {
    const c = contradictions.get(k) ?? 0;
    return c >= 2 && c * 3 >= (supported.get(k) ?? 0);
  }));
  const edges = strong.filter(([a, b]) => !unstable.has(a) && !unstable.has(b));
  const known = new Set(edges.flat()).size;
  if (edges.length === 0) return { ...none, known };

  // Topologisk sortering med nuvarande plats som utslagsfråga.
  const indeg = new Map(currentOrder.map(k => [k, 0]));
  const out = new Map<string, string[]>();
  for (const [a, b] of edges) {
    indeg.set(b, (indeg.get(b) ?? 0) + 1);
    if (!out.has(a)) out.set(a, []);
    out.get(a)!.push(b);
  }
  const order: string[] = [];
  const left = new Set(currentOrder);
  while (left.size) {
    const next = currentOrder.find(k => left.has(k) && indeg.get(k) === 0);
    // Cykel: bockarna säger emot sig själva runt ett varv — föreslå inget.
    if (!next) return { ...none, known };
    order.push(next);
    left.delete(next);
    for (const b of out.get(next) ?? []) indeg.set(b, indeg.get(b)! - 1);
  }

  const keep = longestCommonSubsequence(currentOrder, order);
  const moves = order.flatMap((k, i) => keep.has(k) ? [] : [{ key: k, after: i === 0 ? null : order[i - 1] }]);
  return { trips: trips.length, order, changed: moves.length > 0, known, moves };
}

// --- Inom en sektion ---------------------------------------------------------

export type InnerEventLike = CheckEventLike & {
  subCategory: string | null;
  /** Varunamnet, gemener. Bara det egna hushållets bockar används. */
  itemName: string | null;
};

export type InnerOrder = {
  /** Underkategori → plats 0–1 inom sin sektion (lägre = tidigare). */
  subs: Record<string, number>;
  /** Varunamn → plats 0–1 inom sin sektion. */
  items: Record<string, number>;
};

/**
 * Lär ordningen INOM sektionerna: underkategorier och varor inom den sektion
 * de bockades i. Generöst: en enda handling där gurkan bockades före tomaten
 * räcker. Varje handling ger varje underkategori/vara en plats 0–1 i sin
 * sektion, och platserna vägs ihop med nyare tyngre.
 */
export function learnInnerOrder(events: InnerEventLike[], now: Date): InnerOrder {
  const subs = new Map<string, { s: number; w: number }>();
  const items = new Map<string, { s: number; w: number }>();
  const addPositions = (acc: typeof subs, seq: string[], w: number) => {
    if (seq.length < 2) return;
    seq.forEach((k, i) => {
      const cur = acc.get(k) ?? { s: 0, w: 0 };
      acc.set(k, { s: cur.s + (i / (seq.length - 1)) * w, w: cur.w + w });
    });
  };
  for (const trip of usableTrips(events)) {
    const w = weightFor(trip, now);
    const bySection = new Map<string, InnerEventLike[]>();
    for (const e of trip) {
      if (!bySection.has(e.section)) bySection.set(e.section, []);
      bySection.get(e.section)!.push(e);
    }
    for (const evs of bySection.values()) {
      addPositions(subs, firstSeen(evs.map(e => e.subCategory).filter((x): x is string => !!x)), w);
      addPositions(items, firstSeen(evs.map(e => e.itemName).filter((x): x is string => !!x)), w);
    }
  }
  const avg = (m: typeof subs) => Object.fromEntries([...m].map(([k, v]) => [k, Math.round((v.s / v.w) * 1000) / 1000]));
  return { subs: avg(subs), items: avg(items) };
}

export type RawCheckEvent = {
  storeId: string;
  shopperKey: string;
  checkedAt: Date;
  bulk: boolean;
  category: string;
  subCategory: string | null;
  customCategory: string | null;
};

/**
 * Bockarna ett förslag bygger på: det egna hushållets, plus andra hushålls i
 * SAMMA butik ur butiksbanken. Från andra hushåll räknas bara standardkategorier
 * och -underkategorier — en egen kategori är deras, och säger inget om den här
 * butikens hyllor. Andra hushåll tas med först när minst MIN_OTHER_HOUSEHOLDS
 * bidrar. shopperKey är pseudonym per butik, så handlingarna hålls isär.
 */
export function eventsForSuggestion(own: RawCheckEvent[], others: RawCheckEvent[]): { events: RawCheckEvent[]; otherHouseholds: number } {
  const standard = others.filter(e => !e.customCategory);
  const otherHouseholds = new Set(standard.map(e => e.storeId)).size;
  if (otherHouseholds < MIN_OTHER_HOUSEHOLDS) return { events: own, otherHouseholds: 0 };
  return { events: [...own, ...standard], otherHouseholds };
}

/**
 * Vilken sektion en bock hamnade i, uttryckt som parentOrder-nyckel — med
 * butikens egna val: fritt placerad underkategori, egen kategori, ihopslagning.
 */
export function sectionKeyFor(
  e: { category: string; subCategory: string | null; customCategory: string | null },
  store: { parentOrder: string[]; categoryMerge: Record<string, string> },
): string {
  const resolve = (key: string) => {
    let cur = key;
    const seen = new Set<string>();
    while (store.categoryMerge[cur] && !seen.has(cur)) { seen.add(cur); cur = store.categoryMerge[cur]; }
    return cur;
  };
  const parent = e.customCategory ? `c:${e.customCategory}` : resolve(e.category);
  if (e.subCategory && store.parentOrder.includes(`s:${e.subCategory}`)) return `s:${e.subCategory}`;
  return parent;
}
