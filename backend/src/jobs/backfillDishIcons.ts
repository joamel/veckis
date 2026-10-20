// Engångsjobb: recept som saknar matsymbol får en (se lib/dishIcon.ts). Körs vid
// backend-start, en i taget med paus emellan — ett AI-anrop per recept, aldrig
// fler. Idempotent: rör bara recept där iconEmoji är null.
import { prisma } from '../db';
import { assignDishIcon } from '../lib/dishIcon';

export async function backfillDishIcons(max = 3000): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) return 0;
  const recipes = await prisma.recipe.findMany({ where: { iconEmoji: null }, select: { id: true }, take: max, orderBy: { createdAt: 'desc' } });
  for (const r of recipes) {
    await assignDishIcon(r.id);
    await new Promise(res => setTimeout(res, 300));
  }
  return recipes.length;
}
