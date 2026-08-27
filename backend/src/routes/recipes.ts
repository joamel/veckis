import { Router } from 'express';
import { z } from 'zod';
import { StoreCategory, Prisma } from '@prisma/client';
import { prisma } from '../db';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { learnIngredientAliases } from '../lib/normalizeIngredients';
import { stripIngredient } from '../lib/stripIngredient';
import { uploadRecipeImage, deleteRecipeImage, type UploadResult } from '../lib/imageUpload';
import { recipeAbuseLimiter, parseTextLimiter } from '../lib/rateLimits';
import { safeFetch } from '../lib/ssrfGuard';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// In-memory upload — files are forwarded to Cloudinary, never hit disk. 10 MB
// max keeps us safe against accidental huge uploads.
// Säker mime-whitelist — `image/*` släpper igenom SVG, som kan innehålla
// inbäddat JavaScript och servas tillbaka som same-origin. Vi accepterar
// bara bildformat Cloudinary kan transformera utan risk för code execution.
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) return cb(new Error('Image type not allowed (jpeg, png, webp, heic, gif)'));
    cb(null, true);
  },
});

export const recipesRouter = Router();

const categoryEnum = z.nativeEnum(StoreCategory);

const ingredientSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().positive().nullable().default(null),
  unit: z.string().max(50).nullable().default(null),
  category: categoryEnum.default('other'),
});

const tagsSchema = z.array(z.string().min(1).max(30)).max(10);
/** Normalisera taggar: gemener, trimmade, dedupe:ade, tomma bortfiltrerade. */
function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map(t => t.toLowerCase().trim()).filter(Boolean))];
}

/**
 * Skriv en färsk, EGEN beskrivning av rätten (1–2 meningar) i stället för att
 * kopiera källans ingress. Den redaktionella ingressen är upphovsrättsskyddad;
 * ingredienser/steg är funktionella fakta som inte skyddas. Returnerar null om
 * AI saknas eller failar (då droppas beskrivningen hellre än att kopiera).
 */
async function freshDescription(title: string, ingredients: Array<{ name: string }>): Promise<string | null> {
  if (!anthropic) return null;
  try {
    const ingList = ingredients.slice(0, 20).map(i => i.name).filter(Boolean).join(', ');
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: 'Du skriver en kort, aptitlig beskrivning av en maträtt på svenska, 1–2 meningar. Skriv HELT eget innehåll utifrån rättens namn och ingredienser — kopiera aldrig text från någon källa. Returnera enbart beskrivningen: ingen rubrik, inga citattecken.',
      messages: [{ role: 'user', content: `Rätt: ${title}\nIngredienser: ${ingList}` }],
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
    return text ? text.slice(0, 2000) : null;
  } catch {
    return null;
  }
}

/**
 * Ladda ner en extern bild (SSRF-skyddat) och lägg den på vår EGEN Cloudinary
 * i stället för att hotlinka tredje parts URL — löser både upphovsrätt och
 * tillförlitlighet (källbilden kan dö). Returnerar null vid fel → anroparen
 * droppar bilden hellre än att hotlinka.
 */
async function rehostExternalImage(imageUrl: string, householdId: string): Promise<UploadResult | null> {
  try {
    const res = await safeFetch(imageUrl, { maxRedirects: 3 });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 10 * 1024 * 1024) return null;
    return await uploadRecipeImage(buf, householdId);
  } catch {
    return null;
  }
}

const createRecipeSchema = z.object({
  householdId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  instructions: z.string().max(8000).nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  source: z.enum(['manual', 'ai_paste', 'url_import']).default('manual'),
  imageUrl: z.string().url().nullable().optional(),
  servings: z.number().int().positive().default(4),
  ingredients: z.array(ingredientSchema).default([]),
  tags: tagsSchema.optional(),
});

const updateRecipeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  instructions: z.string().max(8000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  servings: z.number().int().positive().optional(),
  ingredients: z.array(ingredientSchema).optional(),
  tags: tagsSchema.optional(),
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

  const { ingredients, tags, ...recipeData } = body.data;
  // url_import-bilder får inte hotlinkas — re-hosta källbilden till vår egen
  // Cloudinary (upphovsrätt + tillförlitlighet). Vid fel: droppa bilden.
  let imagePublicId: string | null = null;
  if (recipeData.source === 'url_import' && recipeData.imageUrl && !recipeData.imageUrl.includes('res.cloudinary.com')) {
    const rehosted = await rehostExternalImage(recipeData.imageUrl, recipeData.householdId);
    recipeData.imageUrl = rehosted?.url ?? null;
    imagePublicId = rehosted?.publicId ?? null;
  }
  const recipe = await prisma.recipe.create({
    data: {
      ...recipeData,
      ...(imagePublicId ? { imagePublicId } : {}),
      ...(tags !== undefined ? { tags: normalizeTags(tags) } : {}),
      createdBy: (req as AuthenticatedRequest).clerkUserId,
      ingredients: { create: ingredients as Prisma.RecipeIngredientCreateWithoutRecipeInput[] },
    } as Prisma.RecipeUncheckedCreateInput,
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

  const { ingredients, tags, ...restData } = body.data;
  const recipeData = { ...restData, ...(tags !== undefined ? { tags: normalizeTags(tags) } : {}) };

  // If the user clears the image (imageUrl: null), also clear the Cloudinary asset.
  const clearingImage = 'imageUrl' in recipeData && recipeData.imageUrl === null && recipe.imagePublicId;
  const data: Prisma.RecipeUpdateInput = clearingImage
    ? { ...recipeData, imagePublicId: null }
    : recipeData;

  const updated = await prisma.$transaction(async (tx) => {
    if (ingredients !== undefined) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
      await tx.recipeIngredient.createMany({ data: ingredients.map(i => ({ ...i, recipeId: recipe.id })) as Prisma.RecipeIngredientCreateManyInput[] });
    }
    return tx.recipe.update({
      where: { id: recipe.id },
      data,
      include: { ingredients: { orderBy: { id: 'asc' } } },
    });
  });
  if (clearingImage && recipe.imagePublicId) void deleteRecipeImage(recipe.imagePublicId);
  res.json(updated);
}));

// POST /api/recipes/:recipeId/image — multipart upload to Cloudinary, persist URL.
recipesRouter.post('/:recipeId/image', recipeAbuseLimiter, requireAuth, upload.single('image'), asyncHandler(async (req, res) => {
  const recipe = await prisma.recipe.findUnique({ where: { id: req.params.recipeId } });
  if (!recipe) { res.status(404).json({ error: 'Recipe not found' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: recipe.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  if (!req.file?.buffer) { res.status(400).json({ error: 'No image uploaded' }); return; }

  try {
    const { url, publicId } = await uploadRecipeImage(req.file.buffer, recipe.householdId);
    const updated = await prisma.recipe.update({
      where: { id: recipe.id },
      data: { imageUrl: url, imagePublicId: publicId },
      include: { ingredients: { orderBy: { id: 'asc' } } },
    });
    // Clean up the previous Cloudinary asset (best-effort, fire-and-forget).
    if (recipe.imagePublicId && recipe.imagePublicId !== publicId) {
      void deleteRecipeImage(recipe.imagePublicId);
    }
    res.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Image upload failed';
    res.status(500).json({ error: msg });
  }
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
  if (recipe.imagePublicId) void deleteRecipeImage(recipe.imagePublicId);
  res.status(204).send();
}));

// POST /api/recipes/from-url
recipesRouter.post('/from-url', recipeAbuseLimiter, requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ url: z.string().url() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'Invalid URL' }); return; }

  try {
    const scraped = await scrapeRecipe(body.data.url);
    // Learn from parsed names before stripping (e.g. "mjöl, siktat" → "mjöl")
    learnIngredientAliases(scraped.ingredients).catch(() => {});
    // Ersätt källans (upphovsrättsskyddade) ingress med en färsk EGEN beskrivning.
    // Return with normalized names but quantity/unit preserved
    res.json({
      ...scraped,
      description: await freshDescription(scraped.title, scraped.ingredients),
      ingredients: scraped.ingredients.map(i => ({ ...i, name: stripIngredient(i.name) })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not scrape recipe';
    res.status(422).json({ error: msg });
  }
}));

// POST /api/recipes/parse-text
recipesRouter.post('/parse-text', parseTextLimiter, requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ text: z.string().min(1).max(100000) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'Invalid text' }); return; }
  if (!anthropic) { res.status(503).json({ error: 'AI parsing not available' }); return; }

  let parsed: { title: string | null; description: string | null; instructions: string | null; servings?: number; ingredients: Array<{ name: string; quantity: number | null; unit: string | null }> };
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: `Du är ett system som extraherar receptinformation från fri text på svenska eller engelska.
Returnera ENBART giltig JSON utan förklaringar eller markdown-kodblock.

JSON-schema:
{
  "title": "receptnamn (string, null om okänt)",
  "description": "skriv en kort EGEN aptitlig beskrivning av rätten (1–2 meningar) utifrån ingredienser och tillagning — kopiera INTE någon ingress/brödtext ur källtexten, formulera helt eget; null bara om du inte kan avgöra vad rätten är",
  "instructions": "tillagningssteg numrerade på separata rader: \"1. Gör X\\n2. Gör Y\\n3. Gör Z\", null om inga steg finns",
  "servings": 4,
  "ingredients": [{ "name": "ingrediensnamn", "quantity": 2.5, "unit": "dl" }]
}

Regler:
- quantity är ett tal (float) eller null om ingen mängd anges
- unit ska vara EN av: dl, l, liter, ml, cl, msk, tsk, krm, g, kg, st, knippe, näve, nypa, klyfta — eller null
- Extrahera ALLA ingredienser och steg du ser, ignorera navigation, annonser och annat sidinnehåll
- Ingrediensnamn på svenska (översätt om texten är på engelska)
- instructions: om steg finns, ett steg per rad, "1. Förbered X\n2. Stek Y\n3. Servera" — varje steg på egen rad med \n emellan, annars null`,
      messages: [{ role: 'user', content: body.data.text.slice(0, 80000) }],
    });
    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
    const clean = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
    parsed = JSON.parse(clean);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI-anropet misslyckades';
    res.status(422).json({ error: msg });
    return;
  }

  const result: ScrapedRecipe = {
    title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'Okänt recept',
    description: typeof parsed.description === 'string' ? parsed.description : null,
    instructions: typeof parsed.instructions === 'string' ? parsed.instructions : null,
    imageUrl: null,
    servings: typeof parsed.servings === 'number' && parsed.servings > 0 ? parsed.servings : 4,
    ingredients: Array.isArray(parsed.ingredients)
      ? parsed.ingredients
          .filter((i): i is { name: string; quantity: number | null; unit: string | null } => typeof i?.name === 'string' && i.name.trim().length > 0)
          .map(i => ({ name: i.name.trim(), quantity: typeof i.quantity === 'number' ? i.quantity : null, unit: typeof i.unit === 'string' && i.unit ? i.unit : null }))
      : [],
  };
  res.json(result);
}));

interface ScrapedRecipe {
  title: string;
  description: string | null;
  imageUrl: string | null;
  instructions: string | null;
  servings: number;
  ingredients: Array<{ name: string; quantity: number | null; unit: string | null }>;
}

// JSON-LD recipeInstructions comes in many shapes: a plain string, an array of
// strings, an array of HowToStep ({ text }) objects, or HowToSection objects
// that nest steps under itemListElement. Flatten them all to numbered lines.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseInstructions(raw: any): string | null {
  const steps: string[] = [];
  const walk = (node: any): void => {
    if (!node) return;
    if (typeof node === 'string') {
      const t = node.replace(/<[^>]+>/g, '').trim();
      if (t) steps.push(t);
      return;
    }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node['@type'] === 'HowToSection' && node.itemListElement) { walk(node.itemListElement); return; }
    const text = node.text ?? node.name;
    if (typeof text === 'string') {
      const t = text.replace(/<[^>]+>/g, '').trim();
      if (t) steps.push(t);
    }
  };
  walk(raw);
  if (steps.length === 0) return null;
  return steps.map((s, i) => `${i + 1}. ${s}`).join('\n').slice(0, 8000);
}

async function scrapeRecipe(url: string): Promise<ScrapedRecipe> {
  // safeFetch validerar måladressen + varje redirect-hopp (SSRF-skydd) — en
  // publik URL får inte redirecta vidare till en intern tjänst.
  const res = await safeFetch(url, {
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

  const instructions = parseInstructions(r.recipeInstructions);

  void sourceUrl;
  return { title, description, imageUrl, instructions, servings, ingredients };
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
