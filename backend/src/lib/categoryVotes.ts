import type { StoreCategory } from '@prisma/client';
import type { SubCategory } from '@veckis/shared';
import { categorizeIngredient, curatedSubCategory } from './categorizeIngredient';

/**
 * Rapport: var är hushållen oense med den kurerade klassaren?
 *
 * Ett hushålls val är lokalt (se storeIngredientCategory) — en flytt ändrar
 * aldrig vad andra ser. Men när flera hushåll OBEROENDE gör samma rättelse är
 * det en stark signal om att klassaren har fel. Den här rapporten samlar de
 * signalerna så att någon kan lägga in en regel i categorizeIngredient.ts eller
 * inferSubCategory.ts. Den skriver aldrig något: rättelsen sprids bara via ett
 * medvetet beslut i koden, aldrig automatiskt.
 *
 * Källan är hushållens basvaror. Bara kategorier märkta som val räknas
 * (categoryChosen, se stapleChoice.ts) — en sparad gissning är ingen röst.
 * En underkategori på en basvara är alltid ett val.
 */

export type StapleChoice = { householdId: string; name: string; category: StoreCategory | string; categoryChosen?: boolean | null; subCategory: string | null };

export type CuratedAnswer = { category: StoreCategory; subCategory: SubCategory | null };

export type CategoryVoteRow = {
  name: string;
  curated: CuratedAnswer;
  /** Hushåll som har varan som basvara. */
  households: number;
  /** Hushåll vars val skiljer sig från klassaren (kategori eller underkategori). */
  disagreeing: number;
  /** Hushållens kategorier, flest först. */
  categories: { category: string; households: number }[];
  /** Hushållens valda underkategorier (bara de som valt någon), flest först. */
  subCategories: { subCategory: string; households: number }[];
};

/** Den kurerade kedjan (categorizeIngredient), utan hushållets eget val. */
export function curatedAnswer(name: string): CuratedAnswer {
  return { category: categorizeIngredient(name), subCategory: curatedSubCategory(name) };
}

const tally = (values: string[]) =>
  [...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())]
    .map(([value, households]) => ({ value, households }))
    .sort((a, b) => b.households - a.households || a.value.localeCompare(b.value, 'sv'));

export function categoryVotes(staples: StapleChoice[], minDisagreeing = 1): CategoryVoteRow[] {
  const byName = new Map<string, Map<string, StapleChoice>>();
  for (const s of staples) {
    const name = s.name.toLowerCase().trim();
    if (!name) continue;
    // En rad per hushåll och namn — basvaran är unik per hushåll, men namn
    // med olika skiftläge ska räknas som samma vara.
    if (!byName.has(name)) byName.set(name, new Map());
    byName.get(name)!.set(s.householdId, s);
  }

  const rows: CategoryVoteRow[] = [];
  for (const [name, perHousehold] of byName) {
    const curated = curatedAnswer(name);
    const choices = [...perHousehold.values()];
    // 'other' är inget val (samma regel som basvaruval.ts) — det är en rest av
    // det gamla felet där "vet inte" sparades som svar.
    const disagreeing = choices.filter(c =>
      (c.categoryChosen !== false && c.category !== 'other' && c.category !== curated.category)
      || (c.subCategory != null && c.subCategory !== curated.subCategory),
    ).length;
    if (disagreeing < minDisagreeing) continue;
    rows.push({
      name,
      curated,
      households: choices.length,
      disagreeing,
      // Bara valda kategorier — en sparad gissning är ingen röst.
      categories: tally(choices.filter(c => c.categoryChosen !== false).map(c => String(c.category))).map(t => ({ category: t.value, households: t.households })),
      subCategories: tally(choices.flatMap(c => (c.subCategory ? [c.subCategory] : []))).map(t => ({ subCategory: t.value, households: t.households })),
    });
  }
  return rows.sort((a, b) => b.disagreeing - a.disagreeing || b.households - a.households || a.name.localeCompare(b.name, 'sv'));
}
