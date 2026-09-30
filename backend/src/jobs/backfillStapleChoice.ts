// Engångsjobb: avgör för basvaror skapade före 2026-09-30 om den sparade
// kategorin är hushållets val eller klassarens gamla gissning (se
// lib/stapleChoice.ts). Körs vid backend-start, idempotent — rör bara rader där
// categoryChosen är null, så efter första körningen gör det ingenting.
//
// En gissning byts mot den kurerade kategorin, och varor med samma namn som
// ligger obockade i hushållets öppna listor och har den gamla gissningen
// flyttas med — annars låg kakao kvar under Bröd tills den lades till på nytt.
// Varor med egen kategori (customCategory) rörs inte.

import { prisma } from '../db';
import { categorizeIngredient } from '../lib/categorizeIngredient';
import { looksLikeGuess } from '../lib/stapleChoice';

export async function backfillStapleChoice(): Promise<{ chosen: number; guesses: number; reclassified: number; itemsMoved: number }> {
  const staples = await prisma.stapleItem.findMany({
    where: { categoryChosen: null },
    select: { id: true, householdId: true, name: true, category: true },
    take: 20000,
  });
  if (staples.length === 0) return { chosen: 0, guesses: 0, reclassified: 0, itemsMoved: 0 };

  const aliases = await prisma.ingredientAlias.findMany({
    where: { raw: { in: [...new Set(staples.map(s => s.name))] } },
    select: { raw: true, category: true },
  });
  const aliasCategory = new Map(aliases.map(a => [a.raw, a.category]));

  let chosen = 0, guesses = 0, reclassified = 0, itemsMoved = 0;
  for (const s of staples) {
    if (!looksLikeGuess(s.name, s.category, aliasCategory.get(s.name))) {
      await prisma.stapleItem.update({ where: { id: s.id }, data: { categoryChosen: true } });
      chosen++;
      continue;
    }
    guesses++;
    const curated = categorizeIngredient(s.name);
    await prisma.stapleItem.update({ where: { id: s.id }, data: { categoryChosen: false, category: curated } });
    if (curated === s.category || s.category === 'other') continue;
    reclassified++;
    const moved = await prisma.shoppingItem.updateMany({
      where: {
        name: s.name,
        category: s.category,
        isChecked: false,
        customCategory: null,
        mergedIntoId: null,
        list: { householdId: s.householdId, completedAt: null },
      },
      data: { category: curated },
    });
    itemsMoved += moved.count;
  }
  return { chosen, guesses, reclassified, itemsMoved };
}
