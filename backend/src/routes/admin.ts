import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { stripIngredient } from '../lib/stripIngredient';
import { adminSyncLimiter } from '../lib/rateLimits';

export const adminRouter = Router();

// POST /api/admin/sync-ingredients
// Scrapes a list of recipe URLs, extracts ingredient strings and learns aliases.
adminRouter.post('/sync-ingredients', adminSyncLimiter, requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    urls: z.array(z.string().url()).min(1).max(50),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const results: { url: string; learned: number; error?: string }[] = [];

  for (const url of body.data.urls) {
    try {
      const ingredients = await scrapeIngredients(url);
      const pairs = ingredients
        .map(raw => ({ raw: raw.toLowerCase().trim(), canonical: stripIngredient(raw) }))
        .filter(p => p.raw.length > 0 && p.raw !== p.canonical);

      if (pairs.length > 0) {
        await prisma.$transaction(
          pairs.map(p =>
            prisma.ingredientAlias.upsert({
              where: { raw: p.raw },
              create: { raw: p.raw, canonical: p.canonical, seenCount: 1 },
              update: { seenCount: { increment: 1 } },
            })
          )
        );
      }
      results.push({ url, learned: pairs.length });
    } catch (err) {
      results.push({ url, learned: 0, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  const totalLearned = results.reduce((s, r) => s + r.learned, 0);
  res.json({ totalLearned, results });
}));

// GET /api/admin/aliases?q=
// Quick lookup/debug endpoint
adminRouter.get('/aliases', requireAuth, asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const aliases = await prisma.ingredientAlias.findMany({
    where: q ? { raw: { contains: q, mode: 'insensitive' } } : undefined,
    orderBy: { seenCount: 'desc' },
    take: 100,
  });
  res.json(aliases);
}));

async function scrapeIngredients(url: string): Promise<string[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Veckis/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const jsonLdRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = jsonLdRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const ingredients = extractIngredients(data);
      if (ingredients.length > 0) return ingredients;
    } catch { /* skip */ }
  }
  throw new Error('No recipe data found');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractIngredients(data: any): string[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = extractIngredients(item);
      if (found.length > 0) return found;
    }
    return [];
  }
  const type = data['@type'];
  const isRecipe = type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
  if (isRecipe && Array.isArray(data.recipeIngredient)) {
    return data.recipeIngredient.map(String).filter((s: string) => s.trim().length > 0);
  }
  if (data['@graph']) return extractIngredients(data['@graph']);
  return [];
}
