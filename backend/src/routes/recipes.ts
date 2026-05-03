import { Router } from 'express';
import { z } from 'zod';
import { StoreCategory } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { learnIngredientAliases } from '../lib/normalizeIngredients';
import { stripIngredient } from '../lib/stripIngredient';

export const recipesRouter = Router();

const categoryEnum = z.nativeEnum(StoreCategory);

const ingredientSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().positive().nullable().default(null),
  unit: z.string().max(50).nullable().default(null),
  category: categoryEnum.default('other'),
});

const createRecipeSchema = z.object({
  householdId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  servings: z.number().int().positive().default(4),
  ingredients: z.array(ingredientSchema).default([]),
});

const updateRecipeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  servings: z.number().int().positive().optional(),
  ingredients: z.array(ingredientSchema).optional(),
});

// GET /api/recipes?householdId=
recipesRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { householdId } = req.query;
  if (typeof householdId !== 'string') { res.status(400).json({ error: 'Missing householdId' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  const recipes = await prisma.recipe.findMany({
    where: { householdId },
    include: { ingredients: { orderBy: { id: 'asc' } } },
    orderBy: { title: 'asc' },
  });
  res.json(recipes);
}));

// GET /api/recipes/:recipeId
recipesRouter.get('/:recipeId', requireAuth, asyncHandler(async (req, res) => {
  const recipe = await prisma.recipe.findUnique({
    where: { id: req.params.recipeId },
    include: { ingredients: { orderBy: { id: 'asc' } } },
  });
  if (!recipe) { res.status(404).json({ error: 'Recipe not found' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: recipe.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  res.json(recipe);
}));

// POST /api/recipes
recipesRouter.post('/', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = createRecipeSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const { ingredients, ...recipeData } = body.data;
  const recipe = await prisma.recipe.create({
    data: {
      ...recipeData,
      createdBy: (req as AuthenticatedRequest).clerkUserId,
      ingredients: { create: ingredients },
    },
    include: { ingredients: true },
  });

  // Learn ingredients as household staples (fire-and-forget)
  prisma.stapleItem.createMany({
    data: recipe.ingredients.map(ing => ({
      householdId: body.data.householdId,
      name: ing.name,
      category: ing.category,
      unit: ing.unit ?? undefined,
      defaultQuantity: ing.quantity ?? undefined,
    })),
    skipDuplicates: true,
  }).catch(() => {});

  res.status(201).json(recipe);
}));

// PATCH /api/recipes/:recipeId
recipesRouter.patch('/:recipeId', requireAuth, asyncHandler(async (req, res) => {
  const recipe = await prisma.recipe.findUnique({ where: { id: req.params.recipeId } });
  if (!recipe) { res.status(404).json({ error: 'Recipe not found' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: recipe.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  const body = updateRecipeSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const { ingredients, ...recipeData } = body.data;

  const updated = await prisma.$transaction(async (tx) => {
    if (ingredients !== undefined) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
      await tx.recipeIngredient.createMany({ data: ingredients.map(i => ({ ...i, recipeId: recipe.id })) });
    }
    return tx.recipe.update({
      where: { id: recipe.id },
      data: recipeData,
      include: { ingredients: { orderBy: { id: 'asc' } } },
    });
  });
  res.json(updated);
}));

// DELETE /api/recipes/:recipeId
recipesRouter.delete('/:recipeId', requireAuth, asyncHandler(async (req, res) => {
  const recipe = await prisma.recipe.findUnique({ where: { id: req.params.recipeId } });
  if (!recipe) { res.status(404).json({ error: 'Recipe not found' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: recipe.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  await prisma.recipe.delete({ where: { id: recipe.id } });
  res.status(204).send();
}));

// POST /api/recipes/from-url
recipesRouter.post('/from-url', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ url: z.string().url() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'Invalid URL' }); return; }

  try {
    const scraped = await scrapeRecipe(body.data.url);
    // Learn from parsed names before stripping (e.g. "mjöl, siktat" → "mjöl")
    learnIngredientAliases(scraped.ingredients).catch(() => {});
    // Return with normalized names but quantity/unit preserved
    res.json({
      ...scraped,
      ingredients: scraped.ingredients.map(i => ({ ...i, name: stripIngredient(i.name) })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not scrape recipe';
    res.status(422).json({ error: msg });
  }
}));

interface ScrapedRecipe {
  title: string;
  description: string | null;
  imageUrl: string | null;
  servings: number;
  ingredients: Array<{ name: string; quantity: number | null; unit: string | null }>;
}

async function scrapeRecipe(url: string): Promise<ScrapedRecipe> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Veckis/1.0; +https://veckis.app)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Could not fetch page (${res.status})`);
  const html = await res.text();

  // Extract JSON-LD blocks
  const jsonLdRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = jsonLdRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const recipe = findRecipeNode(data);
      if (recipe) return parseJsonLdRecipe(recipe, url);
    } catch { /* skip malformed blocks */ }
  }
  throw new Error('No recipe data found on this page');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findRecipeNode(data: any): any {
  if (!data) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  const type = data['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return data;
  if (data['@graph']) return findRecipeNode(data['@graph']);
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonLdRecipe(r: any, sourceUrl: string): ScrapedRecipe {
  const title = String(r.name ?? '').trim() || 'Okänt recept';

  const description = r.description ? String(r.description).slice(0, 2000) : null;

  const imageUrl: string | null = (() => {
    if (!r.image) return null;
    if (typeof r.image === 'string') return r.image;
    if (Array.isArray(r.image)) return String(r.image[0]?.url ?? r.image[0] ?? '');
    if (typeof r.image === 'object') return String(r.image.url ?? '');
    return null;
  })();

  const servings = (() => {
    const raw = r.recipeYield ?? r.yield;
    if (!raw) return 4;
    const s = Array.isArray(raw) ? raw[0] : raw;
    const n = parseInt(String(s), 10);
    return isNaN(n) || n < 1 ? 4 : n;
  })();

  const rawIngredients: string[] = Array.isArray(r.recipeIngredient) ? r.recipeIngredient.map(String) : [];
  const ingredients = rawIngredients.map(parseIngredientString);

  void sourceUrl;
  return { title, description, imageUrl, servings, ingredients };
}

function parseIngredientString(raw: string): { name: string; quantity: number | null; unit: string | null } {
  const s = raw.trim();
  // Match patterns like "2 dl mjöl", "½ tsk salt", "3-4 tomater", "1.5 kg potatis"
  const re = /^([\d½¼¾⅓⅔,./\-–]+)?\s*([a-zA-ZåäöÅÄÖ]+(?:\s+[a-zA-ZåäöÅÄÖ]+)?)?\s+(.+)$/u;
  const m = s.match(re);
  if (!m) return { name: s, quantity: null, unit: null };

  const units = new Set([
    'dl', 'ml', 'l', 'cl', 'msk', 'tsk', 'krm', 'g', 'kg', 'st', 'port', 'burk', 'förp',
    'cups', 'cup', 'tbsp', 'tsp', 'oz', 'lb', 'pkt', 'påse', 'näve', 'skiva', 'skivor',
  ]);

  const maybeQty = m[1];
  const maybeUnit = m[2]?.toLowerCase();
  const rest = m[3];

  if (!maybeQty) return { name: s, quantity: null, unit: null };

  const qty = parseQuantity(maybeQty);
  if (maybeUnit && units.has(maybeUnit)) {
    return { name: rest ?? '', quantity: qty, unit: maybeUnit };
  }
  // No recognized unit — the "unit" token is part of the name
  return { name: `${maybeUnit ?? ''} ${rest ?? ''}`.trim(), quantity: qty, unit: null };
}

function parseQuantity(s: string): number | null {
  const fractions: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 0.333, '⅔': 0.667 };
  if (fractions[s]) return fractions[s];
  const n = parseFloat(s.replace(',', '.').replace(/–|-/, '.'));
  return isNaN(n) ? null : n;
}
