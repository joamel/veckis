import { SUB_TAXONOMY, type StoreCategory, type SubCategory } from '@veckis/shared';

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

/** parentKey för en vara: "c:<egen kategori>" om egen parent, annars enum-parenten. */
function itemParentKey(item: CategoryGroupItem): string {
  return item.customCategory ? `c:${item.customCategory}` : String(item.category);
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
    if (item.customSubCategory) {
      pushCustomSub(itemParentKey(item), item.customSubCategory, item);
      continue;
    }
    if (item.customCategory) {
      if (!customMap.has(item.customCategory)) customMap.set(item.customCategory, []);
      customMap.get(item.customCategory)!.push(item);
      continue;
    }
    const sub = item.subCategory ?? null;
    if (sub && expandedSet.has(sub)) {
      if (!subMap.has(sub)) subMap.set(sub, []);
      subMap.get(sub)!.push(item);
      continue;
    }
    const cat = item.category as StoreCategory;
    if (!enumMap.has(cat)) enumMap.set(cat, []);
    enumMap.get(cat)!.push(item);
  }

  // Standard-parents som behöver en slot: direkta items, utbrutna subs, ELLER
  // egna subs under en standard-parent.
  const subParents = new Set<StoreCategory>();
  for (const sub of subMap.keys()) {
    const info = SUB_TAXONOMY[sub as SubCategory];
    if (info) subParents.add(info.defaultParent);
  }
  for (const parentKey of customSubMap.keys()) {
    if (!parentKey.startsWith('c:')) subParents.add(parentKey as StoreCategory);
  }
  const orderedEnum: StoreCategory[] = [];
  for (const cat of order) {
    if (enumMap.has(cat) || subParents.has(cat)) orderedEnum.push(cat);
  }
  for (const cat of enumMap.keys()) {
    if (!orderedEnum.includes(cat)) orderedEnum.push(cat);
  }
  for (const cat of subParents) {
    if (!orderedEnum.includes(cat)) orderedEnum.push(cat);
  }

  // Egna parents: de med direkta items ELLER egna subs.
  const orderedCustom = [...customCategories];
  for (const cat of customMap.keys()) {
    if (!orderedCustom.includes(cat)) orderedCustom.push(cat);
  }
  for (const parentKey of customSubMap.keys()) {
    if (parentKey.startsWith('c:')) {
      const cat = parentKey.slice(2);
      if (!orderedCustom.includes(cat)) orderedCustom.push(cat);
    }
  }

  const sortItems = (arr: T[]) => arr.sort((a, b) => {
    if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
    return a.name.localeCompare(b.name, 'sv');
  });

  // Egna sub-grupper för en parentKey, ordnade enligt customSubs (fallback:
  // insättningsordning).
  const customSubGroups = (parentKey: string): CategoryGroup<T>[] => {
    const inner = customSubMap.get(parentKey);
    if (!inner) return [];
    const orderArr = customSubs[parentKey] ?? [];
    const labels = [...inner.keys()].sort((a, b) => {
      const ia = orderArr.indexOf(a); const ib = orderArr.indexOf(b);
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    });
    return labels.map(label => ({
      category: label, isCustom: true, isSub: true, parentKey, label,
      items: sortItems(inner.get(label)!),
    }));
  };

  const result: CategoryGroup<T>[] = [];
  for (const parent of orderedEnum) {
    const direct = enumMap.get(parent);
    if (direct && direct.length) {
      result.push({ category: parent, isCustom: false, items: sortItems(direct) });
    }
    // Utbrutna standard-subs, ordnade enligt expandedSubs.
    const parentSubs = [...subMap.keys()].sort((a, b) => {
      const ia = expandedSubs.indexOf(a); const ib = expandedSubs.indexOf(b);
      return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    });
    for (const sub of parentSubs) {
      const subInfo = SUB_TAXONOMY[sub as SubCategory];
      if (subInfo && subInfo.defaultParent === parent) {
        result.push({ category: sub, isCustom: false, isSub: true, label: subInfo.label, items: sortItems(subMap.get(sub)!) });
      }
    }
    // Egna subs under standard-parenten.
    result.push(...customSubGroups(String(parent)));
  }
  for (const cat of orderedCustom) {
    const direct = customMap.get(cat);
    if (direct && direct.length) {
      result.push({ category: cat, isCustom: true, items: sortItems(direct) });
    }
    result.push(...customSubGroups(`c:${cat}`));
  }
  return result;
}
