import type { StoreCategory } from '@prisma/client';

/**
 * Handskrivna klassningar från adminsidan, i minnet.
 *
 * Klassaren (categorizeIngredient) är synkron och anropas överallt, så
 * tabellen CuratedCategory läses in hit vid start och efter varje ändring
 * (curatedOverridesDb.ts). Den här modulen rör aldrig databasen — då går
 * klassaren att testa utan en.
 */
export type CuratedOverride = { category: StoreCategory; subCategory: string | null };

let overrides = new Map<string, CuratedOverride>();

export const curatedKey = (name: string) => name.toLowerCase().trim();

export function getCuratedOverride(name: string): CuratedOverride | null {
  return overrides.get(curatedKey(name)) ?? null;
}

export function setCuratedOverrides(rows: { name: string; category: StoreCategory; subCategory: string | null }[]): void {
  overrides = new Map(rows.map(r => [curatedKey(r.name), { category: r.category, subCategory: r.subCategory }]));
}
