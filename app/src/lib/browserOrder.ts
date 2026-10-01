// Ordning i kategoriväljaren (rutnätet + varulistan i inköpslistan). Följer
// butikens layout, så väljaren läses i samma ordning som man går i affären.
import {
  CATEGORY_LABELS, subsForParent, subsAlsoUnder, inferSubCategory,
  type StoreCategory, type SubCategory,
} from '@veckis/shared';
import { sortedRestFor } from './subOrder';
import { placedHeadings } from './categoryGroups';

/** Huvudkategorierna i butikens ordning; de som butiken inte nämner sist, i standardordning. */
export function browserCategories(categoryOrder: string[]): StoreCategory[] {
  const all = Object.keys(CATEGORY_LABELS) as StoreCategory[];
  const ranked = categoryOrder.filter((c): c is StoreCategory => all.includes(c as StoreCategory));
  return [...new Set([...ranked, ...all])];
}

/**
 * Rutorna i väljaren i butikens ordning: standardkategorier och butikens egna
 * rubriker ("c:Frukost") som har något i sig — utlyfta underkategorier direkt
 * under rubriken, eller en kategori som slagits ihop med den. En kategori som
 * slagits ihop med en annan visas inte för sig, precis som i listan.
 */
export function browserTiles(parentOrder: string[], categoryOrder: string[], categoryMerge: Record<string, string> = {}): string[] {
  const all = Object.keys(CATEGORY_LABELS) as StoreCategory[];
  const headings = placedHeadings(parentOrder);
  const hasContent = (key: string) => [...headings.values()].includes(key) || Object.values(categoryMerge).includes(key);
  const tiles: string[] = [];
  for (const key of parentOrder) {
    if (key.startsWith('c:') ? hasContent(key) : all.includes(key as StoreCategory) && !categoryMerge[key]) tiles.push(key);
  }
  for (const cat of browserCategories(categoryOrder)) {
    if (!tiles.includes(cat) && !categoryMerge[cat]) tiles.push(cat);
  }
  return tiles;
}

/** Underkategorierna som hör till en egen rubrik, i butikens ordning. */
export function headingSubs(heading: string, parentOrder: string[]): SubCategory[] {
  return [...placedHeadings(parentOrder)].filter(([, h]) => h === heading).map(([k]) => k.slice(2) as SubCategory);
}

/**
 * Underkategorierna under en huvudkategori i butikens ordning. Ej utbrutna
 * ligger inne i kategorins sektion (ordnade efter subOrder), utbrutna står
 * efter den i butiksvyn — därför kommer de sist, i expandedSubs-ordning.
 */
export function browserSubs(parent: StoreCategory, expandedSubs: string[], subOrder: string[]): SubCategory[] {
  const own = [...new Set([...subsForParent(parent), ...subsAlsoUnder(parent)])];
  const expanded = expandedSubs.filter((s): s is SubCategory => own.includes(s as SubCategory));
  const rest = sortedRestFor(own.filter(s => !expanded.includes(s)), subOrder);
  return [...rest, ...expanded];
}

export type BrowserItem = { name: string; subCategory?: string | null; usageCount?: number };
export type BrowserSection<T> = { sub: SubCategory | null; items: T[] };

/**
 * Delar en kategoris varor i sektioner per underkategori, i den givna
 * ordningen. Varor utan (giltig) underkategori hamnar i en sista sektion med
 * sub = null. Inom en sektion: mest använda först, sedan alfabetiskt.
 */
export function browserSections<T extends BrowserItem>(items: T[], orderedSubs: SubCategory[]): BrowserSection<T>[] {
  const bySub = new Map<SubCategory | null, T[]>();
  for (const item of items) {
    const guess = (item.subCategory as SubCategory | null | undefined) ?? inferSubCategory(item.name);
    const sub = guess && orderedSubs.includes(guess) ? guess : null;
    bySub.set(sub, [...(bySub.get(sub) ?? []), item]);
  }
  const byUse = (a: T, b: T) => ((b.usageCount ?? 0) - (a.usageCount ?? 0)) || a.name.localeCompare(b.name, 'sv');
  return [...orderedSubs, null]
    .filter(sub => bySub.has(sub))
    .map(sub => ({ sub, items: [...bySub.get(sub)!].sort(byUse) }));
}
