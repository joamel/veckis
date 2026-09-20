import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { categorizeIngredient } from '../lib/categorizeIngredient';
import { requireAuth, requireAppAdmin } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { stripIngredient } from '../lib/stripIngredient';
import { adminSyncLimiter } from '../lib/rateLimits';

export const adminRouter = Router();

// Hela routern, inte per endpoint: en ny admin-endpoint ska vara skyddad för
// att den ligger här, inte för att någon kom ihåg att skriva middlewaren.
adminRouter.use(requireAuth, requireAppAdmin);

// POST /api/admin/sync-ingredients
// Scrapes a list of recipe URLs, extracts ingredient strings and learns aliases.
adminRouter.post('/sync-ingredients', adminSyncLimiter, asyncHandler(async (req, res) => {
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
adminRouter.get('/aliases', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const aliases = await prisma.ingredientAlias.findMany({
    where: q ? { raw: { contains: q, mode: 'insensitive' } } : undefined,
    orderBy: { seenCount: 'desc' },
    take: 100,
  });
  res.json(aliases);
}));

// GET /api/admin/category-gaps
//
// Granskningsrapport, inte en arbetskö: namnen som den KURERADE klassaren inte
// känner igen, alltså precis de varor som hamnar under Övrigt för ett hushåll
// som inte själv sagt något om dem.
//
// Det här ersätter den konsensus-/moderationsmaskin som en gång var planerad.
// Kategorin är kurerad, inte inlärd — rätt åtgärd på en rad här är att lägga
// till ett nyckelord i categorizeIngredient.ts, inte att klicka i ett UI. Därför
// finns ingen skrivväg: rapporten läses, koden ändras, och nästa deploy gäller
// för alla. Sorterad på seenCount så det vanligaste kureras först.
adminRouter.get('/category-gaps', asyncHandler(async (req, res) => {
  const alias = await prisma.ingredientAlias.findMany({
    orderBy: { seenCount: 'desc' },
    select: { raw: true, canonical: true, category: true, seenCount: true },
  });

  const luckor = alias
    .filter(a => categorizeIngredient(a.canonical) === 'other')
    .map(a => ({
      namn: a.canonical,
      raw: a.raw,
      seenCount: a.seenCount,
      // Vad som ligger lagrat idag. Skiljer det sig från 'other' är det ett
      // arv från den gamla inlärningen, innan kategorin blev kurerad.
      lagradKategori: a.category,
    }));

  res.json({
    totalt: alias.length,
    utanRegel: luckor.length,
    luckor: luckor.slice(0, 200),
  });
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
