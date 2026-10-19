import { Router } from 'express';
import { z } from 'zod';
import { StoreCategory } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest, ärAppAdmin } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { positionForPostcode, searchSharedStores, type SharedStoreRow } from '../lib/sharedStores';
import { eventsForSuggestion, learnInnerOrder, MIN_TRIPS, sectionKeyFor, suggestStoreOrder, TRIP_GAP_MS, applySuggestedOrder } from '../lib/storeOrderSuggestion';
import { findOrderSeed } from '../lib/storeOrderSeedDb';

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
// Egna underkategorier ("cs:<parentKey>:<etikett>") togs bort 2026-09-30 —
// underkategorier är alltid standard. En äldre klient kan fortfarande skicka
// sådana nycklar (och customSubs, som z.object tyst skalar bort); de filtreras
// här så de aldrig sparas igen.
const withoutCustomSubs = (keys: string[]) => keys.filter(k => !k.startsWith('cs:'));
const expandedSubsSchema = z.array(z.string().min(1).max(120)).max(100).transform(withoutCustomSubs);
const subOrderSchema = z.array(z.string().min(1).max(120)).max(100).transform(withoutCustomSubs).optional();
// Kan även innehålla fritt placerade underkategorier ("s:<sub>" — blandad ordning).
const parentOrderSchema = z.array(z.string().min(1).max(120)).max(100).transform(withoutCustomSubs).optional();
// Kategori-ihopslagning: { sourceCategory: targetKey }. Källan måste vara en
// riktig StoreCategory (bara standard-kategorier kan slås ihop bort, samma
// begränsning som "dölj"); målet kan vara valfri parentOrder-nyckel (standard
// ELLER "c:<egen kategori>").
const categoryMergeSchema = z.record(categoryEnum, z.string().min(1).max(60)).optional();
// Butikens egna namn på kategorier och rubriker: { StoreCategory | "c:<rubrik>": namn }.
// Bara rubriken — varans kategori är densamma i alla butiker.
const categoryLabelsSchema = z.record(z.string().min(1).max(60), z.string().min(1).max(40)).refine(r => Object.keys(r).length <= 60).optional();

const createStoreSchema = z.object({
  householdId: z.string(),
  name: z.string().min(1).max(100),
  sharedStoreId: z.string().max(40).nullable().optional(),
  categoryOrder: categoryOrderSchema.optional(),
  customCategories: customCategoriesSchema.optional(),
  expandedSubs: expandedSubsSchema.optional(),
  subOrder: subOrderSchema,
  parentOrder: parentOrderSchema,
  categoryMerge: categoryMergeSchema,
});

const updateStoreSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  categoryOrder: categoryOrderSchema.optional(),
  customCategories: customCategoriesSchema.optional(),
  expandedSubs: expandedSubsSchema.optional(),
  subOrder: subOrderSchema,
  parentOrder: parentOrderSchema,
  categoryMerge: categoryMergeSchema,
  categoryLabels: categoryLabelsSchema,
  // Koppling till butiksbanken; null = egen butik.
  sharedStoreId: z.string().max(40).nullable().optional(),
  // Förslag på kategoriordning på/av för hela hushållet.
  orderSuggestions: z.boolean().optional(),
  // Förslaget används direkt, utan att godkännas.
  orderAutoApply: z.boolean().optional(),
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


type StoreRow = NonNullable<Awaited<ReturnType<typeof prisma.store.findUnique>>>;

/** Butikens sektionsordning; tom parentOrder härleds som i appen. */
function effectiveParentOrder(store: StoreRow): string[] {
  return store.parentOrder.length
    ? store.parentOrder
    : [...store.categoryOrder, ...((store.customCategories as string[] | null) ?? []).map(c => `c:${c}`)];
}

/** Förslag på sektionsordning ur hushållets och andras bockar (steg 4). */
async function computeOrderSuggestion(store: StoreRow, relaxed: boolean) {
  const parentOrder = effectiveParentOrder(store);
  const categoryMerge = (store.categoryMerge ?? {}) as Record<string, string>;
  const select = { storeId: true, shopperKey: true, checkedAt: true, bulk: true, category: true, subCategory: true, customCategory: true } as const;
  const own = await prisma.shoppingCheckEvent.findMany({ where: { storeId: store.id }, select });
  const otherStores = store.sharedStoreId
    ? await prisma.store.findMany({ where: { sharedStoreId: store.sharedStoreId, id: { not: store.id } }, select: { id: true } })
    : [];
  const others = otherStores.length
    ? await prisma.shoppingCheckEvent.findMany({ where: { storeId: { in: otherStores.map(s => s.id) }, customCategory: null }, select })
    : [];
  const { events, otherHouseholds } = eventsForSuggestion(own, others);
  const toSection = (e: typeof own[number] & { own?: boolean }) => ({ shopperKey: e.shopperKey, checkedAt: e.checkedAt, bulk: e.bulk, own: e.own, section: sectionKeyFor(e, { parentOrder, categoryMerge }) });
  const suggestion = store.orderSuggestions || relaxed
    ? suggestStoreOrder(events.map(toSection), parentOrder, new Date(), relaxed ? { minPairTrips: 1 } : {})
    : { trips: 0, order: parentOrder, changed: false, known: 0, moves: [] };
  // Hushållets egna handlingar, så appen kan säga hur mycket som är era.
  const ownTrips = suggestStoreOrder(own.map(toSection), parentOrder, new Date()).trips;
  const lastOwnCheck = own.reduce<Date | null>((m, e) => (!m || e.checkedAt > m ? e.checkedAt : m), null);
  return { suggestion, parentOrder, ownTrips, otherHouseholds, lastOwnCheck };
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

  // En butik ur banken startar i den ordning andra sorterat liknande butiker,
  // inte i standardordningen — om ingen ordning skickats med.
  const seed = body.data.sharedStoreId && !body.data.categoryOrder && !body.data.parentOrder
    ? await findOrderSeed(body.data.sharedStoreId, body.data.householdId)
    : null;

  const store = await prisma.store.create({
    data: {
      householdId: body.data.householdId,
      name: body.data.name,
      categoryOrder: seed?.order ?? body.data.categoryOrder ?? (Object.values(StoreCategory) as StoreCategory[]),
      ...(seed ? { parentOrder: seed.order, orderSource: seed.level, orderSeedLabel: seed.label } : {}),
      sharedStoreId: body.data.sharedStoreId ?? null,
    },
    include: { sharedStore: { select: { id: true, name: true, chain: true, street: true, postcode: true, city: true, postalCity: true } } },
  });
  res.status(201).json(store);
}));

// GET /api/stores/:storeId/order-suggestion — föreslagen sektionsordning ur
// bockarna i butiken (steg 4, se lib/storeOrderSuggestion.ts): hushållets
// egna, och — för en butik ur butiksbanken — andra hushålls i samma butik
// (bara standardkategorier, och bara när minst två andra hushåll bidrar).
storesRouter.get('/:storeId/order-suggestion', requireAuth, asyncHandler(async (req, res) => {
  const store = await prisma.store.findUnique({ where: { id: req.params.storeId } });
  if (!store) { res.status(404).json({ error: 'Store not found' }); return; }
  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: store.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  // Testläget (?relaxed=1) gäller bara appadmin: ett förslag ur en enda
  // handling, så flödet går att prova innan det går ut till alla.
  const relaxed = req.query.relaxed === '1' && ärAppAdmin((req as AuthenticatedRequest).clerkUserId);
  const { suggestion, ownTrips, otherHouseholds } = await computeOrderSuggestion(store, relaxed);
  res.json({ ...suggestion, ownTrips, otherHouseholds, minTrips: MIN_TRIPS });
}));

// POST /api/stores/:storeId/auto-order — "Ändra automatiskt": används när en
// lista i butiken öppnas. Finns ett förslag används det direkt, och svaret
// innehåller ordningen före, så appen kan erbjuda Ångra. Aldrig mitt i en
// handling (bockar inom TRIP_GAP_MS) — då skulle sektionerna hoppa under
// tiden man går. Ett ångrat förslag används inte igen förrän bockarna säger
// något annat.
storesRouter.post('/:storeId/auto-order', requireAuth, asyncHandler(async (req, res) => {
  const store = await prisma.store.findUnique({ where: { id: req.params.storeId } });
  if (!store) { res.status(404).json({ error: 'Store not found' }); return; }
  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: store.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }
  if (!store.orderSuggestions || !store.orderAutoApply) { res.json({ applied: false }); return; }

  const { suggestion, parentOrder, lastOwnCheck } = await computeOrderSuggestion(store, false);
  const suggestedKey = JSON.stringify(suggestion.order);
  const midTrip = lastOwnCheck && Date.now() - lastOwnCheck.getTime() < TRIP_GAP_MS;
  if (!suggestion.changed || midTrip || store.orderAutoUndone === suggestedKey) { res.json({ applied: false }); return; }

  const next = applySuggestedOrder(parentOrder, suggestion.order);
  const updated = await prisma.store.update({
    where: { id: store.id },
    data: { parentOrder: next, orderSource: 'custom', orderSeedLabel: null },
    include: { sharedStore: { select: { id: true, name: true, chain: true, street: true, postcode: true, city: true, postalCity: true } } },
  });
  res.json({ applied: true, previousOrder: parentOrder, suggestedOrder: suggestion.order, moves: suggestion.moves, store: updated });
}));

// POST /api/stores/:storeId/auto-order/undo { previousOrder, suggestedOrder }
// — ångrar ett automatiskt byte och minns förslaget, så det inte kommer
// tillbaka vid nästa öppning.
storesRouter.post('/:storeId/auto-order/undo', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    previousOrder: z.array(z.string().min(1).max(120)).max(100).transform(withoutCustomSubs),
    suggestedOrder: z.array(z.string().min(1).max(120)).max(100),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  const store = await prisma.store.findUnique({ where: { id: req.params.storeId } });
  if (!store) { res.status(404).json({ error: 'Store not found' }); return; }
  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: store.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }
  const updated = await prisma.store.update({
    where: { id: store.id },
    data: { parentOrder: body.data.previousOrder, orderAutoUndone: JSON.stringify(body.data.suggestedOrder) },
    include: { sharedStore: { select: { id: true, name: true, chain: true, street: true, postcode: true, city: true, postalCity: true } } },
  });
  res.json(updated);
}));

// GET /api/stores/:storeId/inner-order — ordningen INOM sektionerna (under-
// kategorier och varor) ur hushållets EGNA bockar i butiken. Används direkt i
// listan, utan förslag: ett fel här kostar några steg i samma gång. Andra
// hushålls bockar tas aldrig med — varunamn säger mer om ett hushåll än
// kategorier gör.
storesRouter.get('/:storeId/inner-order', requireAuth, asyncHandler(async (req, res) => {
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
  const own = await prisma.shoppingCheckEvent.findMany({
    where: { storeId: store.id },
    select: { shopperKey: true, checkedAt: true, bulk: true, category: true, subCategory: true, customCategory: true, itemName: true },
  });
  res.json(learnInnerOrder(own.map(e => ({ ...e, section: sectionKeyFor(e, { parentOrder, categoryMerge }) })), new Date()));
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
  // En sparad ordning är hushållets egen — raden i listan slutar kalla den
  // standard- eller startordning.
  const orderChanged = body.data.parentOrder !== undefined || body.data.categoryOrder !== undefined;
  // En egen butik som kopplas till banken får startordningen, om hushållet
  // inte redan har sorterat den själv.
  const seed = body.data.sharedStoreId && !orderChanged && store.orderSource === 'default'
    ? await findOrderSeed(body.data.sharedStoreId, store.householdId)
    : null;
  const updated = await prisma.store.update({
    where: { id: store.id },
    data: {
      ...body.data,
      ...(orderChanged ? { orderSource: 'custom', orderSeedLabel: null } : {}),
      ...(seed ? { categoryOrder: seed.order, parentOrder: seed.order, orderSource: seed.level, orderSeedLabel: seed.label } : {}),
    },
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
