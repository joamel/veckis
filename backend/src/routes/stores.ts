import { Router } from 'express';
import { z } from 'zod';
import { StoreCategory } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { positionForPostcode, searchSharedStores, type SharedStoreRow } from '../lib/sharedStores';
import { sectionKeyFor, suggestStoreOrder } from '../lib/storeOrderSuggestion';

export const storesRouter = Router();

// Butiksbanken i minnet: ~3 400 rader, läses om en gång i timmen. Sökningen
// görs i JS med den rena funktionen i lib/sharedStores.ts — enklare och
// snabbare än att uttrycka ordsökning i valfri ordning plus avstånd i SQL.
let bankCache: { rows: Array<SharedStoreRow & { id: string }>; at: number } | null = null;
async function butiksbank(): Promise<Array<SharedStoreRow & { id: string }>> {
  if (bankCache && Date.now() - bankCache.at < 60 * 60 * 1000) return bankCache.rows;
  const rows = await prisma.sharedStore.findMany({
    select: { id: true, osmId: true, name: true, chain: true, street: true, postcode: true, city: true, postalCity: true, lat: true, lon: true },
  });
  bankCache = { rows, at: Date.now() };
  return rows;
}

const categoryEnum = z.nativeEnum(StoreCategory);
const categoryOrderSchema = z.array(categoryEnum);
const customCategoriesSchema = z.array(z.string().min(1).max(40)).max(40);
const expandedSubsSchema = z.array(z.string().min(1).max(40)).max(100);
// Längre max än expandedSubs — innehåller samma "cs:<parentKey>:<label>"-
// kodning för egna, dolda subs (parentKey kan självt vara upp till 60 tecken).
const subOrderSchema = z.array(z.string().min(1).max(120)).max(100).optional();
// Egna underkategorier: parentKey (StoreCategory eller "c:<egen kategori>") → etiketter.
const customSubsSchema = z.record(z.string().min(1).max(60), z.array(z.string().min(1).max(40)).max(60)).optional();
// Kan även innehålla fritt placerade underkategorier ("s:<sub>",
// "cs:<parentKey>:<etikett>" — blandad ordning), därför samma gränser som subOrder.
const parentOrderSchema = z.array(z.string().min(1).max(120)).max(100).optional();
// Kategori-ihopslagning: { sourceCategory: targetKey }. Källan måste vara en
// riktig StoreCategory (bara standard-kategorier kan slås ihop bort, samma
// begränsning som "dölj"); målet kan vara valfri parentOrder-nyckel (standard
// ELLER "c:<egen kategori>").
const categoryMergeSchema = z.record(categoryEnum, z.string().min(1).max(60)).optional();

const createStoreSchema = z.object({
  householdId: z.string(),
  name: z.string().min(1).max(100),
  sharedStoreId: z.string().max(40).nullable().optional(),
  categoryOrder: categoryOrderSchema.optional(),
  customCategories: customCategoriesSchema.optional(),
  expandedSubs: expandedSubsSchema.optional(),
  subOrder: subOrderSchema,
  customSubs: customSubsSchema,
  parentOrder: parentOrderSchema,
  categoryMerge: categoryMergeSchema,
});

const updateStoreSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  categoryOrder: categoryOrderSchema.optional(),
  customCategories: customCategoriesSchema.optional(),
  expandedSubs: expandedSubsSchema.optional(),
  subOrder: subOrderSchema,
  customSubs: customSubsSchema,
  parentOrder: parentOrderSchema,
  categoryMerge: categoryMergeSchema,
  // Koppling till butiksbanken; null = egen butik.
  sharedStoreId: z.string().max(40).nullable().optional(),
});

const searchSchema = z.object({
  q: z.string().max(100).optional(),
  postcode: z.string().max(10).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
});

/**
 * Finns bankbutiken redan i hushållet? Databasen spärrar dubbletter också
 * (unikt index), men då blir felet obegripligt — här får appen veta vilken
 * butik det gäller, så den kan öppna den i stället.
 */
async function redanKopplad(householdId: string, sharedStoreId: string, utomStoreId?: string) {
  return prisma.store.findFirst({
    where: { householdId, sharedStoreId, ...(utomStoreId ? { id: { not: utomStoreId } } : {}) },
    select: { id: true, name: true },
  });
}

// GET /api/stores/bank?q=&postcode=&lat=&lon= — sök i butiksbanken.
// Position (från webbläsaren) går före postnummer. Svaret anger källan, som
// ODbL kräver att appen visar.
storesRouter.get('/bank', requireAuth, asyncHandler(async (req, res) => {
  const p = searchSchema.safeParse(req.query);
  if (!p.success) { res.status(400).json({ error: p.error.flatten() }); return; }
  const rows = await butiksbank();
  const near = p.data.lat != null && p.data.lon != null
    ? { lat: p.data.lat, lon: p.data.lon }
    : p.data.postcode ? positionForPostcode(p.data.postcode, rows) : null;
  const hits = searchSharedStores(rows, { q: p.data.q, near, limit: 20 });
  res.json({ stores: hits, attribution: '© OpenStreetMap-bidragsgivare' });
}));

// GET /api/stores?householdId=
storesRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { householdId } = req.query;
  if (typeof householdId !== 'string') { res.status(400).json({ error: 'Missing householdId' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  const stores = await prisma.store.findMany({
    where: { householdId },
    orderBy: { createdAt: 'asc' },
    include: { sharedStore: { select: { id: true, name: true, chain: true, street: true, postcode: true, city: true, postalCity: true } } },
  });
  res.json(stores);
}));

// POST /api/stores
storesRouter.post('/', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = createStoreSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  if (body.data.sharedStoreId) {
    const finns = await redanKopplad(body.data.householdId, body.data.sharedStoreId);
    if (finns) { res.status(409).json({ error: 'already_linked', store: finns }); return; }
  }

  const store = await prisma.store.create({
    data: {
      householdId: body.data.householdId,
      name: body.data.name,
      categoryOrder: body.data.categoryOrder ?? (Object.values(StoreCategory) as StoreCategory[]),
      sharedStoreId: body.data.sharedStoreId ?? null,
    },
    include: { sharedStore: { select: { id: true, name: true, chain: true, street: true, postcode: true, city: true, postalCity: true } } },
  });
  res.status(201).json(store);
}));

// GET /api/stores/:storeId/order-suggestion — föreslagen sektionsordning ur
// hushållets egna bockar i butiken (steg 4, se lib/storeOrderSuggestion.ts).
// Bara den här butikens händelser: att räkna ihop flera hushåll i samma
// gemensamma butik kräver att datadelningen deklarerats i Play Console först.
storesRouter.get('/:storeId/order-suggestion', requireAuth, asyncHandler(async (req, res) => {
  const store = await prisma.store.findUnique({ where: { id: req.params.storeId } });
  if (!store) { res.status(404).json({ error: 'Store not found' }); return; }
  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: store.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  const parentOrder = store.parentOrder.length
    ? store.parentOrder
    : [...store.categoryOrder, ...((store.customCategories as string[] | null) ?? []).map(c => `c:${c}`)];
  const categoryMerge = (store.categoryMerge ?? {}) as Record<string, string>;
  const events = await prisma.shoppingCheckEvent.findMany({
    where: { storeId: store.id },
    select: { shopperKey: true, checkedAt: true, bulk: true, category: true, subCategory: true, customCategory: true, customSubCategory: true },
  });
  const suggestion = suggestStoreOrder(
    events.map(e => ({ shopperKey: e.shopperKey, checkedAt: e.checkedAt, bulk: e.bulk, section: sectionKeyFor(e, { parentOrder, categoryMerge }) })),
    parentOrder,
    new Date(),
  );
  res.json(suggestion);
}));

// PATCH /api/stores/:storeId
storesRouter.patch('/:storeId', requireAuth, asyncHandler(async (req, res) => {
  const store = await prisma.store.findUnique({ where: { id: req.params.storeId } });
  if (!store) { res.status(404).json({ error: 'Store not found' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: store.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  const body = updateStoreSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  if (body.data.sharedStoreId) {
    const finns = await prisma.sharedStore.findUnique({ where: { id: body.data.sharedStoreId }, select: { id: true } });
    if (!finns) { res.status(400).json({ error: 'Okänd butik i butiksbanken' }); return; }
    const annan = await redanKopplad(store.householdId, body.data.sharedStoreId, store.id);
    if (annan) { res.status(409).json({ error: 'already_linked', store: annan }); return; }
  }
  const updated = await prisma.store.update({
    where: { id: store.id },
    data: body.data,
    include: { sharedStore: { select: { id: true, name: true, chain: true, street: true, postcode: true, city: true, postalCity: true } } },
  });
  res.json(updated);
}));

// DELETE /api/stores/:storeId (admin only)
storesRouter.delete('/:storeId', requireAuth, asyncHandler(async (req, res) => {
  const store = await prisma.store.findUnique({ where: { id: req.params.storeId } });
  if (!store) { res.status(404).json({ error: 'Store not found' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: store.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member || member.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return; }

  await prisma.store.delete({ where: { id: store.id } });
  res.status(204).send();
}));
