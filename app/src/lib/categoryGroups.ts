import { SUB_TAXONOMY, type StoreCategory, type SubCategory } from '@veckis/shared';

/** Minsta form en vara behöver ha för att kunna grupperas. */
export interface CategoryGroupItem {
  category: string;
  subCategory?: string | null;
  customCategory?: string | null;
  isChecked: boolean;
  name: string;
}

export interface CategoryGroup<T extends CategoryGroupItem> {
  /** Antingen en StoreCategory (parent), en custom-string ELLER en SubCategory
   *  som hushållet har "expanderat" till egen sektion. */
  category: StoreCategory | string;
  isCustom: boolean;
  /** Sant när gruppen är en sub som brutits ut. */
  isSub?: boolean;
  /** Label att visa i UI:t. */
  label?: string;
  items: T[];
}

/**
 * Grupperar inköpsvaror i sektioner enligt butikens kategori-ordning.
 * Utbruten ur shopping/[listId].tsx (ren funktion, generisk över varutypen).
 *
 * Tre buckets: customCategory-strängar (legacy), expanderade subs (egen sektion)
 * och enum-parents. Subs renderas direkt efter sin parent i butiksordningen; en
 * parent vars items alla brutits ut i subs behåller ändå sin slot (annars
 * hamnar sub-sektionerna sist oavsett ordning). Custom-grupper läggs sist.
 */
export function buildCategoryGroups<T extends CategoryGroupItem>(
  items: T[],
  order: StoreCategory[],
  customCategories: string[] = [],
  expandedSubs: string[] = [],
): CategoryGroup<T>[] {
  const expandedSet = new Set(expandedSubs);
  const enumMap = new Map<StoreCategory, T[]>();
  const customMap = new Map<string, T[]>();
  const subMap = new Map<string, T[]>();
  for (const item of items) {
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
  // Parents vars items alla brutits ut i expanderade subs (inga direkta items)
  // behöver ändå en slot i ordningen, annars hamnar deras sub-sektioner sist.
  const subParents = new Set<StoreCategory>();
  for (const sub of subMap.keys()) {
    const info = SUB_TAXONOMY[sub as SubCategory];
    if (info) subParents.add(info.defaultParent);
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
  const orderedCustom = [...customCategories.filter(c => customMap.has(c))];
  for (const cat of customMap.keys()) {
    if (!orderedCustom.includes(cat)) orderedCustom.push(cat);
  }
  const sortItems = (arr: T[]) => arr.sort((a, b) => {
    if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
    return a.name.localeCompare(b.name, 'sv');
  });

  const result: CategoryGroup<T>[] = [];
  for (const parent of orderedEnum) {
    const direct = enumMap.get(parent);
    if (direct && direct.length) {
      result.push({ category: parent, isCustom: false, items: sortItems(direct) });
    }
    for (const [sub, subItems] of subMap.entries()) {
      const subInfo = SUB_TAXONOMY[sub as SubCategory];
      if (subInfo && subInfo.defaultParent === parent) {
        result.push({ category: sub, isCustom: false, isSub: true, label: subInfo.label, items: sortItems(subItems) });
      }
    }
  }
  for (const cat of orderedCustom) {
    result.push({ category: cat, isCustom: true, items: sortItems(customMap.get(cat)!) });
  }
  return result;
}
