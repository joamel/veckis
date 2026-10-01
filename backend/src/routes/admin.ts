import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { categorizeIngredient } from '../lib/categorizeIngredient';
import { categoryVotes } from '../lib/categoryVotes';
import { StoreCategory } from '@prisma/client';
import { applyCuration, classifyReport, curateCandidates, curationImpact, namesWithoutSubCategory, newHouseholds, removeCuration, validateCuration } from '../lib/adminCuration';
import { wsListUpdate } from '../lib/wsHub';
import { allNames, deleteIngredient, hideIngredients, junkReason, nameImpact, renameIngredient, suggestNameCleanup, unhideIngredients } from '../lib/nameCleanup';
import { CLEANUP_JOBS, findJob } from '../lib/cleanupJobs';
import type { AuthenticatedRequest } from '../middleware/auth';
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

// GET /api/admin/category-votes?min=2
//
// Syskon till category-gaps: namn där hushåll VALT en annan kategori eller
// underkategori än den kurerade klassaren. Flera oberoende hushåll med samma
// rättelse är skäl för en regel i koden. Läser bara — se lib/categoryVotes.ts.
adminRouter.get('/category-votes', asyncHandler(async (req, res) => {
  const min = Math.max(1, Number(req.query.min) || 1);
  const staples = await prisma.stapleItem.findMany({
    select: { householdId: true, name: true, category: true, categoryChosen: true, subCategory: true },
  });
  const curated = new Set((await prisma.curatedCategory.findMany({ select: { name: true } })).map(c => c.name));
  const rows = categoryVotes(staples, min, curated);
  res.json({ basvaror: staples.length, oense: rows.length, rader: rows.slice(0, 200) });
}));

// --- Adminsidan: klassning (steg 2) och överblick (steg 1) ---

// GET /api/admin/candidates — riktiga varor som ett enda hushåll använt ofta.
adminRouter.get('/candidates', asyncHandler(async (req, res) => {
  const min = Math.max(1, Number(req.query.min) || 3);
  const rows = await curateCandidates(min);
  res.json({ kandidater: rows.length, rader: rows.slice(0, 200) });
}));

// GET /api/admin/no-subcategory — namn utan underkategori, och vart de hamnar idag.
adminRouter.get('/no-subcategory', asyncHandler(async (_req, res) => {
  const rows = await namesWithoutSubCategory();
  res.json({ antal: rows.length, rader: rows.slice(0, 300) });
}));

// GET /api/admin/new-households?since=2026-09-17 — default två veckor bakåt.
adminRouter.get('/new-households', asyncHandler(async (req, res) => {
  const since = typeof req.query.since === 'string' ? new Date(req.query.since) : new Date(Date.now() - 14 * 86_400_000);
  if (Number.isNaN(since.getTime())) { res.status(400).json({ error: 'Ogiltigt datum' }); return; }
  res.json({ since: since.toISOString(), rader: await newHouseholds(since) });
}));

// GET /api/admin/classify?name= — hur ett namn klassas idag och av vilken regel.
adminRouter.get('/classify', asyncHandler(async (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name : '';
  if (!name.trim()) { res.status(400).json({ error: 'Namn saknas' }); return; }
  res.json(await classifyReport(name));
}));

// GET /api/admin/curated — alla handskrivna klassningar.
adminRouter.get('/curated', asyncHandler(async (_req, res) => {
  const rows = await prisma.curatedCategory.findMany({ orderBy: { updatedAt: 'desc' } });
  res.json(rows);
}));

const curationSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.nativeEnum(StoreCategory),
  subCategory: z.string().max(60).nullable(),
});

// POST /api/admin/curated/preview — vad en klassning skulle ändra, utan att ändra något.
adminRouter.post('/curated/preview', asyncHandler(async (req, res) => {
  const body = curationSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  const fel = validateCuration(body.data);
  if (fel) { res.status(400).json({ error: fel }); return; }
  res.json(await curationImpact(body.data));
}));

// PUT /api/admin/curated — skriv klassningen; moveItems flyttar obockade varor i öppna listor.
adminRouter.put('/curated', asyncHandler(async (req, res) => {
  const body = curationSchema.extend({ moveItems: z.boolean().default(false), resetChoices: z.boolean().default(false) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  const fel = validateCuration(body.data);
  if (fel) { res.status(400).json({ error: fel }); return; }
  const { clerkUserId } = req as AuthenticatedRequest;
  const result = await applyCuration(body.data, { clerkUserId }, body.data.moveItems, body.data.resetChoices);
  // Den som står i butiken ska se varan byta sektion direkt.
  if (result.itemIds.length) {
    const moved = await prisma.shoppingItem.findMany({ where: { id: { in: result.itemIds } }, include: { list: { select: { householdId: true } } } });
    for (const { list, ...item } of moved) wsListUpdate(item.listId, list.householdId, { type: 'item_updated', data: item });
  }
  res.json({ name: result.name, itemsMoved: result.itemsMoved });
}));

// DELETE /api/admin/curated?name= — tillbaka till klassarens egna regler.
adminRouter.delete('/curated', asyncHandler(async (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name : '';
  const { clerkUserId } = req as AuthenticatedRequest;
  const removed = await removeCuration(name, { clerkUserId });
  if (!removed) { res.status(404).json({ error: 'Ingen klassning för namnet' }); return; }
  res.status(204).send();
}));

// --- Adminsidan steg 3: namn och alias ---

// GET /api/admin/names?q= — alla varunamn (pool + basvaror), mest sedda först.
adminRouter.get('/names', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const names = (await allNames())
    .filter(n => !q || n.namn.toLowerCase().includes(q))
    .sort((a, b) => b.vikt - a.vikt);
  const hidden = new Set((await prisma.hiddenGlobalName.findMany({ select: { name: true } })).map(h => h.name));
  res.json({ totalt: names.length, rader: names.slice(0, 300).map(n => ({ name: n.namn, weight: n.vikt, junk: junkReason(n.namn), hidden: hidden.has(n.namn.toLowerCase()) })) });
}));

// GET /api/admin/name-suggestions — skräp, mängder i namnet och varianter.
adminRouter.get('/name-suggestions', asyncHandler(async (_req, res) => {
  const ignored = await ignoredKeys('names');
  const all = suggestNameCleanup(await allNames());
  const rows = all.filter(r => !ignored.has(r.name));
  res.json({ förslag: rows.length, ignorerade: all.length - rows.length, rader: rows.slice(0, 300) });
}));

// --- Ignorerade förslag: bockade ur → föreslås inte igen ---
async function ignoredKeys(scope: string): Promise<Set<string>> {
  return new Set((await prisma.ignoredSuggestion.findMany({ where: { scope }, select: { key: true } })).map(i => i.key));
}

// POST /api/admin/ignore { scope, keys } — föreslå inte de här igen.
adminRouter.post('/ignore', asyncHandler(async (req, res) => {
  const body = z.object({ scope: z.string().min(1).max(40), keys: z.array(z.string().min(1).max(600)).min(1).max(500) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  await prisma.ignoredSuggestion.createMany({ data: body.data.keys.map(key => ({ scope: body.data.scope, key })), skipDuplicates: true });
  res.json({ ignored: body.data.keys.length });
}));

// DELETE /api/admin/ignore?scope= — visa de ignorerade förslagen igen.
adminRouter.delete('/ignore', asyncHandler(async (req, res) => {
  const scope = typeof req.query.scope === 'string' ? req.query.scope : '';
  if (!scope) { res.status(400).json({ error: 'scope saknas' }); return; }
  const n = (await prisma.ignoredSuggestion.deleteMany({ where: { scope } })).count;
  res.json({ restored: n });
}));

// GET /api/admin/names/impact?name=&to= — vad ett namnbyte eller en radering rör.
adminRouter.get('/names/impact', asyncHandler(async (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name : '';
  if (!name.trim()) { res.status(400).json({ error: 'Namn saknas' }); return; }
  const to = typeof req.query.to === 'string' && req.query.to.trim() ? req.query.to : null;
  res.json({ from: await nameImpact(name), to: to ? await nameImpact(to.trim().toLowerCase()) : null });
}));

// POST /api/admin/names/rename { from, to } — byt namn överallt; finns målet slås de ihop.
adminRouter.post('/names/rename', asyncHandler(async (req, res) => {
  const body = z.object({ from: z.string().min(1).max(200), to: z.string().min(1).max(60) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  const fel = junkReason(body.data.to);
  if (fel) { res.status(400).json({ error: `Det nya namnet duger inte: ${fel}` }); return; }
  res.json(await renameIngredient(body.data.from, body.data.to, { clerkUserId: (req as AuthenticatedRequest).clerkUserId }));
}));

// POST /api/admin/names/batch { action, names, to? } — flera namn i en omgång:
// radera alla, eller slå ihop alla till ett namn (felstavningar, varianter).
adminRouter.post('/names/batch', asyncHandler(async (req, res) => {
  const body = z.object({
    action: z.enum(['delete', 'merge', 'hide', 'unhide']),
    names: z.array(z.string().min(1).max(500)).min(1).max(200),
    to: z.string().min(1).max(60).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  const actor = { clerkUserId: (req as AuthenticatedRequest).clerkUserId };
  if (body.data.action === 'hide') { res.json({ names: await hideIngredients(body.data.names, actor), staples: 0 }); return; }
  if (body.data.action === 'unhide') { res.json({ names: await unhideIngredients(body.data.names, actor), staples: 0 }); return; }
  if (body.data.action === 'merge') {
    const to = body.data.to?.trim();
    if (!to) { res.status(400).json({ error: 'Namn att slå ihop till saknas' }); return; }
    const fel = junkReason(to);
    if (fel) { res.status(400).json({ error: `Det nya namnet duger inte: ${fel}` }); return; }
    let staples = 0;
    for (const name of body.data.names) staples += (await renameIngredient(name, to, actor)).staples;
    res.json({ names: body.data.names.length, staples });
    return;
  }
  let staples = 0;
  for (const name of body.data.names) staples += (await deleteIngredient(name, actor)).staples;
  res.json({ names: body.data.names.length, staples });
}));

// POST /api/admin/names/delete { name } — ta bort ur poolen och basvarorna. Permanent.
adminRouter.post('/names/delete', asyncHandler(async (req, res) => {
  const body = z.object({ name: z.string().min(1).max(500) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  res.json(await deleteIngredient(body.data.name, { clerkUserId: (req as AuthenticatedRequest).clerkUserId }));
}));

// --- Adminsidan steg 4: städjobb (samma som städskripten) ---

// GET /api/admin/jobs — jobben som kan köras.
adminRouter.get('/jobs', (_req, res) => {
  res.json(CLEANUP_JOBS.map(({ id, title, description, usesAi }) => ({ id, title, description, usesAi })));
});

// POST /api/admin/jobs/:id/plan — förslagen, utan att ändra något.
adminRouter.post('/jobs/:id/plan', asyncHandler(async (req, res) => {
  const job = findJob(req.params.id);
  if (!job) { res.status(404).json({ error: 'Okänt jobb' }); return; }
  const plan = await job.plan();
  const ignored = await ignoredKeys(job.id);
  const rows = plan.rows.filter(r => !ignored.has(r.key));
  res.json({ total: rows.length, ignored: plan.rows.length - rows.length, rows: rows.slice(0, 500), note: plan.note ?? null });
}));

// POST /api/admin/jobs/:id/apply { rows: [{ key, to }] } — skriver de valda raderna.
// Jobbet kontrollerar varje rad själv; det klienten skickar är bara ett urval.
adminRouter.post('/jobs/:id/apply', asyncHandler(async (req, res) => {
  const job = findJob(req.params.id);
  if (!job) { res.status(404).json({ error: 'Okänt jobb' }); return; }
  const body = z.object({
    rows: z.array(z.object({ key: z.string().min(1).max(600), to: z.string().max(600) })).max(500),
    // Urbockade rader adminen inte vill se igen.
    ignore: z.array(z.string().min(1).max(600)).max(500).default([]),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  if (body.data.ignore.length) await prisma.ignoredSuggestion.createMany({ data: body.data.ignore.map(key => ({ scope: job.id, key })), skipDuplicates: true });
  const summary = body.data.rows.length ? await job.apply(body.data.rows, { clerkUserId: (req as AuthenticatedRequest).clerkUserId }) : '';
  const ignoredNote = body.data.ignore.length ? `${body.data.ignore.length} föreslås inte igen.` : '';
  res.json({ summary: [summary, ignoredNote].filter(Boolean).join(' ') });
  res.json({ summary });
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
