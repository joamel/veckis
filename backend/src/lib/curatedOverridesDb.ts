import { prisma } from '../db';
import { setCuratedOverrides } from './curatedOverrides';

/** Läser in adminsidans klassningar i klassarens minne. Anropas vid start och efter varje ändring. */
export async function reloadCuratedOverrides(): Promise<number> {
  const rows = await prisma.curatedCategory.findMany({ select: { name: true, category: true, subCategory: true } });
  setCuratedOverrides(rows);
  return rows.length;
}
