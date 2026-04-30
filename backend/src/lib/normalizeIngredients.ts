import { prisma } from '../db';
import { stripIngredient } from './stripIngredient';
import type { StoreCategory } from '@prisma/client';

export async function normalizeIngredientNames(names: string[]): Promise<string[]> {
  if (names.length === 0) return [];

  const keys = names.map(n => n.toLowerCase().trim());
  const aliases = await prisma.ingredientAlias.findMany({ where: { raw: { in: keys } } });
  const aliasMap = new Map(aliases.map(a => [a.raw, a.canonical]));

  return keys.map(k => aliasMap.get(k) ?? stripIngredient(k));
}

export async function learnIngredientAliases(
  ingredients: Array<{ name: string; category?: StoreCategory }>
): Promise<void> {
  if (ingredients.length === 0) return;

  const pairs = ingredients
    .map(i => ({ raw: i.name.toLowerCase().trim(), canonical: stripIngredient(i.name), category: i.category ?? 'other' as StoreCategory }))
    .filter(p => p.raw !== p.canonical && p.raw.length > 0);

  if (pairs.length === 0) return;

  await prisma.$transaction(
    pairs.map(p =>
      prisma.ingredientAlias.upsert({
        where: { raw: p.raw },
        create: { raw: p.raw, canonical: p.canonical, category: p.category, seenCount: 1 },
        update: { seenCount: { increment: 1 } },
      })
    )
  );
}
