import { prisma } from '../db';
import { setCuratedOverrides } from './curatedOverrides';

/**
 * Poolens sparade kategori ska stämma med adminsidans klassningar. Klassningar
 * gjorda innan klassningen själv skrev poolen (2026-10-01) rättas här vid
 * start; idempotent, rör bara rader som skiljer sig.
 */
export async function syncAliasesWithCurated(): Promise<number> {
  const rows = await prisma.curatedCategory.findMany({ select: { name: true, category: true } });
  let n = 0;
  for (const r of rows) {
    n += (await prisma.ingredientAlias.updateMany({ where: { canonical: r.name, category: { not: r.category } }, data: { category: r.category } })).count;
  }
  return n;
}

/** Läser in adminsidans klassningar i klassarens minne. Anropas vid start och efter varje ändring. */
export async function reloadCuratedOverrides(): Promise<number> {
  const rows = await prisma.curatedCategory.findMany({ select: { name: true, category: true, subCategory: true } });
  setCuratedOverrides(rows);
  return rows.length;
}
