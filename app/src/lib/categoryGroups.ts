import { SUB_TAXONOMY, type StoreCategory, type SubCategory } from '@veckis/shared';

// Kanonisk sub-ordning = SUB_TAXONOMY:s nyckelordning (definierad grupperad per
// parent). Används för att klustra varor per subkategori INOM en samlad kategori
// även när subben inte är utbruten som egen sektion — samma ordningskälla som
// plocklistan lutar sig mot. Varor utan sub hamnar sist i kategorin.
const SUB_RANK: Map<string, number> = new Map(
  Object.keys(SUB_TAXONOMY).map((k, i) => [k, i]),
);
function subRank(subCategory: string | null | undefined): number {
  if (!subCategory) return Number.POSITIVE_INFINITY;
  return SUB_RANK.get(subCategory) ?? Number.POSITIVE_INFINITY;
}

/** Minsta form en vara behöver ha för att kunna grupperas. */
export interface CategoryGroupItem {
  category: string;
  subCategory?: string | null;
  isChecked: boolean;
  name: string;
}

export interface CategoryGroup<T extends CategoryGroupItem> {
  /** Antingen en StoreCategory (parent), en custom-string eller en SubCategory
   *  som hushållet expanderat. */
  category: StoreCategory | string;
  isCustom: boolean;
  /** Sant när gruppen är en underkategori som brutits ut. */
  isSub?: boolean;
  /** Label att visa i UI:t. */
  label?: string;
  /** Flera fritt placerade underkategorier från samma kategori som ligger
   *  bredvid varandra i butiksordningen, sammanslagna till en sektion —
   *  visas som "Skafferi (2)". index = 2, 3 … per kategori (kategorin själv
   *  är 1). members = underkategoriernas nycklar i parentOrder. */
  cluster?: { parentKey: string; index: number; members: string[] };
  items: T[];
}

/**
 * Nyckeln en utbruten underkategori har i parentOrder när den placerats
 * fritt bland kategorierna ("blandad ordning"): "s:<sub>". En underkategori som INTE står i parentOrder ligger direkt efter sin
 * kategori, som förut.
 */
export const placedSubKey = (sub: string) => `s:${sub}`;
/** Är nyckeln i parentOrder en fritt placerad underkategori (inte en kategori)? */
export function isPlacedSubKey(key: string): boolean {
  return key.startsWith('s:');
}

/** Kategorin en fritt placerad underkategori kommer ifrån (merge-upplöst). */
export function placedParentKey(key: string, categoryMerge: Record<string, string> = {}): string | null {
  if (key.startsWith('s:')) {
    const info = SUB_TAXONOMY[key.slice(2) as SubCategory];
    return info ? resolveMerge(info.defaultParent, categoryMerge) : null;
  }
  return null;
}

/**
 * Egna rubriker i butiken: utlyfta underkategorier som ligger DIREKT efter en
 * egen kategori ("c:Frukost") i parentOrder hör till den rubriken — i listan
 * samlas deras varor under rubriken i stället för att bli egna sektioner.
 * Varorna behåller sin standardkategori; rubriken är bara butikens layout.
 * Returnerar underkategorins nyckel → rubrikens nyckel.
 */
export function placedHeadings(parentOrder: string[]): Map<string, string> {
  const out = new Map<string, string>();
  let heading: string | null = null;
  for (const key of parentOrder) {
    if (key.startsWith('c:')) heading = key;
    else if (isPlacedSubKey(key) && heading) out.set(key, heading);
    else heading = null;
  }
  return out;
}

/**
 * Kluster av fritt placerade underkategorier: två eller fler från SAMMA
 * kategori direkt efter varandra i parentOrder. Avgörs av butiksordningen,
 * inte av vad listan råkar innehålla — annars skulle rubriken byta namn
 * beroende på vilka varor som står på listan just i dag.
 * Returnerar nyckel → kluster för varje medlem.
 */
export function placedClusters(
  parentOrder: string[],
  categoryMerge: Record<string, string> = {},
): Map<string, { parentKey: string; index: number; members: string[] }> {
  const out = new Map<string, { parentKey: string; index: number; members: string[] }>();
  const next = new Map<string, number>();
  // Underkategorier under en egen rubrik hör till rubriken, inte till ett kluster.
  const headings = placedHeadings(parentOrder);
  const free = (key: string) => isPlacedSubKey(key) && !headings.has(key);
  let i = 0;
  while (i < parentOrder.length) {
    const parent = free(parentOrder[i]) ? placedParentKey(parentOrder[i], categoryMerge) : null;
    let j = i + 1;
    if (parent) {
      while (j < parentOrder.length && free(parentOrder[j]) && placedParentKey(parentOrder[j], categoryMerge) === parent) j++;
    }
    if (parent && j - i >= 2) {
      const index = next.get(parent) ?? 2;
      next.set(parent, index + 1);
      const cluster = { parentKey: parent, index, members: parentOrder.slice(i, j) };
      for (const k of cluster.members) out.set(k, cluster);
    }
    i = j;
  }
  return out;
}

/** Inlärd ordning INOM sektionerna, ur hushållets bockar i butiken: plats 0–1
 *  per underkategori och per varunamn (gemener). Se learnInnerOrder i backend. */
export interface InnerOrder {
  subs: Record<string, number>;
  items: Record<string, number>;
}

/**
 * Låter de element som har en inlärd plats byta plats SINSEMELLAN, i sina
 * egna luckor; resten står kvar där de stod. Samma princip som förslaget för
 * sektionerna — en vara man aldrig bockat i butiken hoppar inte runt.
 */
export function permuteKnown<X>(xs: X[], score: (x: X) => number | undefined): X[] {
  const known = xs.map((x, i) => ({ x, i, s: score(x) })).filter(k => k.s !== undefined);
  if (known.length < 2) return xs;
  const sorted = [...known].sort((a, b) => (a.s! - b.s!) || (a.i - b.i));
  const out = [...xs];
  known.forEach((k, n) => { out[k.i] = sorted[n].x; });
  return out;
}

/**
 * Lägger den inlärda ordningen ovanpå standardsorteringen inom en sektion:
 * underkategoriernas block byter plats efter hur man går, och varorna inom
 * varje block likaså. Bockade varor ligger kvar sist, orörda.
 */
export function applyInnerOrder<T extends CategoryGroupItem>(sorted: T[], inner?: InnerOrder | null): T[] {
  if (!inner) return sorted;
  const open = sorted.filter(i => !i.isChecked);
  const done = sorted.filter(i => i.isChecked);
  const runs: T[][] = [];
  for (const item of open) {
    const last = runs[runs.length - 1];
    if (last && (last[0].subCategory ?? null) === (item.subCategory ?? null)) last.push(item);
    else runs.push([item]);
  }
  const orderedRuns = permuteKnown(runs, r => (r[0].subCategory ? inner.subs[r[0].subCategory] : undefined));
  const itemScore = (i: T) => inner.items[i.name.trim().toLowerCase()];
  return [...orderedRuns.flatMap(r => permuteKnown(r, itemScore)), ...done];
}

/** Följer categoryMerge till slutmålet. Cykel-skydd är bara ett säkerhetsnät
 *  — UI:t tillåter aldrig kedjor (bara en nivå), men skyddar mot trasig data. */
function resolveMerge(key: string, categoryMerge: Record<string, string>): string {
  let cur = key;
  const seen = new Set<string>();
  while (categoryMerge[cur] && !seen.has(cur)) {
    seen.add(cur);
    cur = categoryMerge[cur];
  }
  return cur;
}

/**
 * Grupperar inköpsvaror i sektioner enligt butikens kategori-ordning.
 *
 * Buckets: standard-parents (enum), utbrutna underkategorier (expandedSubs)
 * och egna rubriker ("c:" i parentOrder) — som får sina varor från kategorier
 * som slagits ihop med dem och från utlyfta underkategorier direkt under dem
 * (placedHeadings). En vara bär aldrig en egen kategori; den hör alltid till
 * en standardkategori, och rubriken är bara butikens layout.
 */
export function buildCategoryGroups<T extends CategoryGroupItem>(
  items: T[],
  order: StoreCategory[],
  customCategories: string[] = [],
  expandedSubs: string[] = [],
  parentOrder: string[] = [],
  categoryMerge: Record<string, string> = {},
  inner?: InnerOrder | null,
): CategoryGroup<T>[] {
  const expandedSet = new Set(expandedSubs);
  const enumMap = new Map<StoreCategory, T[]>();
  const customMap = new Map<string, T[]>();
  const subMap = new Map<string, T[]>();

  for (const item of items) {
    // Ihopslagen kategori: resolveMerge är no-op om item.category inte är en
    // ihopslagen källa. "effectiveKey" är var varan HAMNAR (direkt-hinken
    // ELLER, om den har en utbruten sub, den parentKey subben letar upp sin
    // sektion under) — en ihopslagen kategoris utbrutna subs ärvs alltså av
    // målet i stället för att plattas ut, se subGroupsForParent nedan.
    const effectiveKey = resolveMerge(String(item.category), categoryMerge);
    const sub = item.subCategory ?? null;
    if (sub && expandedSet.has(sub)) {
      if (!subMap.has(sub)) subMap.set(sub, []);
      subMap.get(sub)!.push(item);
      continue;
    }
    if (effectiveKey.startsWith('c:')) {
      const custKey = effectiveKey.slice(2);
      if (!customMap.has(custKey)) customMap.set(custKey, []);
      customMap.get(custKey)!.push(item);
    } else {
      const cat = effectiveKey as StoreCategory;
      if (!enumMap.has(cat)) enumMap.set(cat, []);
      enumMap.get(cat)!.push(item);
    }
  }

  // Parents (standard ELLER egna, via ihopslagning) som behöver en slot:
  // direkta items ELLER utbrutna subs. Subs slåss upp mot sin
  // MERGE-UPPLÖSTA parent — en standard-subs defaultParent (från taxonomin)
  // kan alltså peka på en egen ("c:Namn") mål-kategori om dess ursprungliga
  // parent slagits ihop dit.
  const subParentKeys = new Set<string>();
  for (const sub of subMap.keys()) {
    const info = SUB_TAXONOMY[sub as SubCategory];
    if (info) subParentKeys.add(resolveMerge(info.defaultParent, categoryMerge));
  }
  const orderedEnum: StoreCategory[] = [];
  for (const cat of order) {
    if (enumMap.has(cat) || subParentKeys.has(cat)) orderedEnum.push(cat);
  }
  for (const cat of enumMap.keys()) {
    if (!orderedEnum.includes(cat)) orderedEnum.push(cat);
  }
  for (const key of subParentKeys) {
    if (!key.startsWith('c:') && !orderedEnum.includes(key as StoreCategory)) orderedEnum.push(key as StoreCategory);
  }

  // Egna parents: de med direkta items ELLER ihopslagna subs.
  const orderedCustom = [...customCategories];
  for (const cat of customMap.keys()) {
    if (!orderedCustom.includes(cat)) orderedCustom.push(cat);
  }
  for (const key of subParentKeys) {
    if (key.startsWith('c:')) {
      const cat = key.slice(2);
      if (!orderedCustom.includes(cat)) orderedCustom.push(cat);
    }
  }

  const sortItems = (arr: T[]) => applyInnerOrder(arr.sort((a, b) => {
    if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
    // Klustra per subkategori (kanonisk ordning) INOM kategorin; namn inom subben.
    const ra = subRank(a.subCategory);
    const rb = subRank(b.subCategory);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, 'sv');
  }), inner);

  // Ordnad lista av sub-sektioner under en parentKey, enligt expandedSubs.
  // Underkategorier som placerats fritt ritas där de står i parentOrder, inte
  // under sin kategori.
  const placed = new Set(parentOrder.filter(isPlacedSubKey));
  const placedGroups = new Map<string, CategoryGroup<T>>();
  const subGroupsForParent = (parentKey: string): CategoryGroup<T>[] => {
    const acc: { order: number; g: CategoryGroup<T> }[] = [];
    // INGEN "!parentKey.startsWith('c:')"-spärr här längre — en standard-subs
    // (merge-upplösta) parent kan nu peka på en egen kategori om dess
    // ursprungliga standard-parent slagits ihop dit.
    for (const [sub, its] of subMap) {
      const info = SUB_TAXONOMY[sub as SubCategory];
      if (info && resolveMerge(info.defaultParent, categoryMerge) === parentKey) {
        const g: CategoryGroup<T> = { category: sub, isCustom: false, isSub: true, label: info.label, items: sortItems(its) };
        if (placed.has(placedSubKey(sub))) { placedGroups.set(placedSubKey(sub), g); continue; }
        const idx = expandedSubs.indexOf(sub);
        acc.push({ order: idx === -1 ? Infinity : idx, g });
      }
    }
    acc.sort((a, b) => a.order - b.order);
    return acc.map(x => x.g);
  };

  // Grupper för EN standard-parent (direkta items + subs interfolierade).
  const standardParentGroups = (parent: StoreCategory): CategoryGroup<T>[] => {
    const out: CategoryGroup<T>[] = [];
    const direct = enumMap.get(parent);
    if (direct && direct.length) out.push({ category: parent, isCustom: false, items: sortItems(direct) });
    out.push(...subGroupsForParent(String(parent)));
    return out;
  };
  // Grupper för EN egen parent (direkta items + ihopslagna kategoriers subs).
  const customParentGroups = (cat: string): CategoryGroup<T>[] => {
    const out: CategoryGroup<T>[] = [];
    const direct = customMap.get(cat);
    if (direct && direct.length) out.push({ category: cat, isCustom: true, items: sortItems(direct) });
    out.push(...subGroupsForParent(`c:${cat}`));
    return out;
  };

  // Enhetlig ordning: parentOrder styr om den finns, annars standard först +
  // egna sist (bakåtkompat). Parents/egna som saknas i parentOrder läggs sist.
  const master: string[] = [];
  const seen = new Set<string>();
  const pushKey = (k: string) => { if (!seen.has(k)) { seen.add(k); master.push(k); } };
  for (const key of parentOrder) pushKey(key);
  for (const cat of orderedEnum) pushKey(String(cat));
  for (const cat of orderedCustom) pushKey(`c:${cat}`);

  // Kategorierna först, så att deras fritt placerade underkategorier hunnit
  // samlas in; sedan läggs allt ut i parentOrders ordning.
  const perKey = new Map<string, CategoryGroup<T>[]>();
  for (const key of master) {
    if (isPlacedSubKey(key)) continue;
    perKey.set(key, key.startsWith('c:') ? customParentGroups(key.slice(2)) : standardParentGroups(key as StoreCategory));
  }
  // Underkategorier vars kategori saknas i master (ingen vara direkt i den)
  // har inte samlats in ovan — kör deras kategori för att hitta dem.
  for (const key of placed) {
    if (placedGroups.has(key)) continue;
    const info = SUB_TAXONOMY[key.slice(2) as SubCategory];
    if (info) subGroupsForParent(resolveMerge(info.defaultParent, categoryMerge));
  }

  const clusters = placedClusters(parentOrder, categoryMerge);
  const headings = placedHeadings(parentOrder);
  const emittedClusters = new Set<string>();
  const result: CategoryGroup<T>[] = [];
  for (const key of master) {
    if (isPlacedSubKey(key)) {
      // Hör till en egen rubrik — dess varor läggs ut under rubriken nedan.
      if (headings.has(key)) continue;
      const cluster = clusters.get(key);
      if (cluster) {
        const id = cluster.members.join('+');
        if (emittedClusters.has(id)) continue;
        emittedClusters.add(id);
        const items = cluster.members.flatMap(m => placedGroups.get(m)?.items ?? []);
        if (items.length) result.push({ category: `${cluster.parentKey}#${cluster.index}`, isCustom: false, cluster, items: sortItems(items) });
        continue;
      }
      const g = placedGroups.get(key);
      if (g) result.push(g);
    } else if (key.startsWith('c:')) {
      const groups = [...(perKey.get(key) ?? [])];
      const memberItems = [...headings].filter(([, h]) => h === key).flatMap(([m]) => placedGroups.get(m)?.items ?? []);
      if (memberItems.length) {
        const direct = groups.find(g => g.isCustom && !g.isSub);
        if (direct) direct.items = sortItems([...direct.items, ...memberItems]);
        else groups.unshift({ category: key.slice(2), isCustom: true, items: sortItems(memberItems) });
      }
      result.push(...groups);
    } else {
      result.push(...(perKey.get(key) ?? []));
    }
  }
  return result;
}
