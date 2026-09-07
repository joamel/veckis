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
  customCategory?: string | null;
  customSubCategory?: string | null;
  isChecked: boolean;
  name: string;
}

export interface CategoryGroup<T extends CategoryGroupItem> {
  /** Antingen en StoreCategory (parent), en custom-string, en SubCategory som
   *  hushållet expanderat, ELLER en egen underkategori-etikett. */
  category: StoreCategory | string;
  isCustom: boolean;
  /** Sant när gruppen är en sub (standard eller egen) som brutits ut. */
  isSub?: boolean;
  /** parentKey (StoreCategory eller "c:<egen kategori>") för egna subs — används
   *  för unik nyckel och parent-emoji i UI:t. */
  parentKey?: string;
  /** Label att visa i UI:t. */
  label?: string;
  items: T[];
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
 * Buckets: egna parents (customCategory), standard-parents (enum), utbrutna
 * standard-subs (expandedSubs) samt hushålls-lokala egna subs (customSubCategory
 * under valfri parent). Subs renderas direkt efter sin parent i butiksordningen.
 */
export function buildCategoryGroups<T extends CategoryGroupItem>(
  items: T[],
  order: StoreCategory[],
  customCategories: string[] = [],
  expandedSubs: string[] = [],
  customSubs: Record<string, string[]> = {},
  parentOrder: string[] = [],
  categoryMerge: Record<string, string> = {},
): CategoryGroup<T>[] {
  const expandedSet = new Set(expandedSubs);
  const enumMap = new Map<StoreCategory, T[]>();
  const customMap = new Map<string, T[]>();
  const subMap = new Map<string, T[]>();
  // Egna subs: parentKey → (subLabel → items)
  const customSubMap = new Map<string, Map<string, T[]>>();
  const pushCustomSub = (parentKey: string, label: string, item: T) => {
    if (!customSubMap.has(parentKey)) customSubMap.set(parentKey, new Map());
    const inner = customSubMap.get(parentKey)!;
    if (!inner.has(label)) inner.set(label, []);
    inner.get(label)!.push(item);
  };

  for (const item of items) {
    const hasCustomParent = !!item.customCategory;
    // Ihopslagen kategori: bara standard-kategorier kan vara källa (aldrig
    // customCategory), och resolveMerge är no-op om item.category inte är
    // en ihopslagen källa. "effectiveKey" är var varan HAMNAR (direkt-hinken
    // ELLER, om den har en utbruten sub, den parentKey subben letar upp sin
    // sektion under) — en ihopslagen kategoris utbrutna subs ärvs alltså av
    // målet i stället för att plattas ut, se subGroupsForParent nedan.
    const effectiveKey = hasCustomParent ? `c:${item.customCategory}` : resolveMerge(String(item.category), categoryMerge);

    if (item.customSubCategory) {
      pushCustomSub(effectiveKey, item.customSubCategory, item);
      continue;
    }
    if (hasCustomParent) {
      const custKey = item.customCategory!;
      if (!customMap.has(custKey)) customMap.set(custKey, []);
      customMap.get(custKey)!.push(item);
      continue;
    }
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
  // direkta items, utbrutna subs, ELLER egna subs. Subs slåss upp mot sin
  // MERGE-UPPLÖSTA parent — en standard-subs defaultParent (från taxonomin)
  // kan alltså peka på en egen ("c:Namn") mål-kategori om dess ursprungliga
  // parent slagits ihop dit.
  const subParentKeys = new Set<string>();
  for (const sub of subMap.keys()) {
    const info = SUB_TAXONOMY[sub as SubCategory];
    if (info) subParentKeys.add(resolveMerge(info.defaultParent, categoryMerge));
  }
  for (const parentKey of customSubMap.keys()) {
    subParentKeys.add(parentKey);
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

  // Egna parents: de med direkta items ELLER (egna eller ihopslagna) subs.
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

  const sortItems = (arr: T[]) => arr.sort((a, b) => {
    if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
    // Klustra per subkategori (kanonisk ordning) INOM kategorin; namn inom subben.
    const ra = subRank(a.subCategory);
    const rb = subRank(b.subCategory);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, 'sv');
  });

  // Ordnad lista av sub-sektioner (standard + egna) under en parentKey, enligt
  // expandedSubs. Egna subs kodas som "cs:<parentKey>:<label>" i expandedSubs så
  // att de kan interfolieras fritt med standard-subarna. (customSubs används som
  // register när expandedSubs saknar cs:-posten, t.ex. äldre data.)
  void customSubs;
  const subGroupsForParent = (parentKey: string): CategoryGroup<T>[] => {
    const acc: { order: number; g: CategoryGroup<T> }[] = [];
    // INGEN "!parentKey.startsWith('c:')"-spärr här längre — en standard-subs
    // (merge-upplösta) parent kan nu peka på en egen kategori om dess
    // ursprungliga standard-parent slagits ihop dit.
    for (const [sub, its] of subMap) {
      const info = SUB_TAXONOMY[sub as SubCategory];
      if (info && resolveMerge(info.defaultParent, categoryMerge) === parentKey) {
        const idx = expandedSubs.indexOf(sub);
        acc.push({ order: idx === -1 ? Infinity : idx, g: { category: sub, isCustom: false, isSub: true, label: info.label, items: sortItems(its) } });
      }
    }
    const inner = customSubMap.get(parentKey);
    if (inner) {
      for (const [label, its] of inner) {
        const idx = expandedSubs.indexOf(`cs:${parentKey}:${label}`);
        acc.push({ order: idx === -1 ? Infinity : idx, g: { category: label, isCustom: true, isSub: true, parentKey, label, items: sortItems(its) } });
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
  // Grupper för EN egen parent (direkta items + egna subs).
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

  const result: CategoryGroup<T>[] = [];
  for (const key of master) {
    if (key.startsWith('c:')) result.push(...customParentGroups(key.slice(2)));
    else result.push(...standardParentGroups(key as StoreCategory));
  }
  return result;
}
