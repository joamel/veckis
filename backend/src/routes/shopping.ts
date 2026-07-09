import { Router, Response } from 'express';
import { z } from 'zod';
import { StoreCategory, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { categorizeIngredient } from '../lib/categorizeIngredient';
import { learnIngredientAliases, getStoredCategory, storeIngredientCategory } from '../lib/normalizeIngredients';
import { stripIngredient } from '../lib/stripIngredient';
import { suggestMerge, resolveEquivalences, learnEquivalenceFromMerge, isPackagingUnit, loadConfirmedEquivalencesByName } from '../lib/smartMerge';
import { wsBroadcast } from '../lib/wsHub';
import { inferSubCategory, parentForSub, type SubCategory } from '@veckis/shared';
import { sendPush, notifyActiveShopper } from '../lib/sendPush';
import { planFullUnmerge, findRoot } from '../lib/mergeLogic';
import { planAutoMerge } from '../lib/importDedupe';

export const shoppingRouter = Router();

// Broadcast a per-list item change AND a lightweight household-level signal so
// the shopping overview (which isn't subscribed to per-list sockets) can update
// its counts live instead of only on tab focus.
function bcast(list: { id: string; householdId: string; actor?: string | null }, message: Record<string, unknown>) {
  // Stamp the per-list event with who triggered it so other clients editing the
  // same item can show "{name} ändrade ..." (L35). Falls back to undefined.
  wsBroadcast(list.id, { ...message, actor: list.actor ?? undefined });
  wsBroadcast(`household:${list.householdId}`, { type: 'shopping_list_updated', data: { listId: list.id } });
}

// Walk up the merge chain to find the visible root item
async function findMergeRoot(listId: string, itemId: string): Promise<string> {
  const all = await prisma.shoppingItem.findMany({
    where: { listId },
    select: { id: true, mergedIntoId: true },
  });
  return findRoot(all, itemId);
}

// BFS through a merge tree using pure logic, then apply DB updates.
async function fullyUnmerge(listId: string, rootId: string): Promise<{ leaves: string[]; containers: string[] }> {
  const all = await prisma.shoppingItem.findMany({
    where: { listId },
    select: { id: true, mergedIntoId: true },
  });
  const plan = planFullUnmerge(all, rootId);
  if (plan.restoreLeaves.length > 0) {
    await prisma.shoppingItem.updateMany({
      where: { id: { in: plan.restoreLeaves } },
      data: { mergedIntoId: null },
    });
  }
  if (plan.deleteContainers.length > 0) {
    await prisma.shoppingItem.deleteMany({ where: { id: { in: plan.deleteContainers } } });
  }
  return { leaves: plan.restoreLeaves, containers: plan.deleteContainers };
}

const categoryEnum = z.nativeEnum(StoreCategory);

const createListSchema = z.object({
  householdId: z.string(),
  name: z.string().min(1).max(100),
  emoji: z.string().max(8).nullable().optional(),
  storeId: z.string().optional(),
  isShared: z.boolean().default(true),
});

const addItemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().positive().default(1),
  unit: z.string().optional(),
  category: categoryEnum.default('other'),
  subCategory: z.string().nullable().optional(),
  note: z.string().optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().nullable().optional(),
  category: categoryEnum.optional(),
  subCategory: z.string().nullable().optional(),
  customCategory: z.string().max(40).nullable().optional(),
  note: z.string().nullable().optional(),
});

async function getListAndVerifyMember(listId: string, clerkUserId: string, res: Response) {
  const list = await prisma.shoppingList.findUnique({ where: { id: listId } });
  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return null;
  }
  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: list.householdId, clerkUserId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member of this household' });
    return null;
  }
  return Object.assign(list, { actor: member.displayName });
}

// POST /api/shopping/lists
shoppingRouter.post('/lists', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = createListSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const list = await prisma.shoppingList.create({
    data: { ...body.data, createdBy: (req as AuthenticatedRequest).clerkUserId } as Prisma.ShoppingListUncheckedCreateInput,
    include: { items: true, store: true },
  });
  res.status(201).json(list);
}));

// GET /api/shopping/lists?householdId=
shoppingRouter.get('/lists', requireAuth, asyncHandler(async (req, res) => {
  const { householdId } = req.query;
  if (typeof householdId !== 'string') { res.status(400).json({ error: 'Missing householdId' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  const lists = await prisma.shoppingList.findMany({
    where: { householdId, completedAt: null },
    include: { items: { where: { mergedIntoId: null }, orderBy: { createdAt: 'asc' }, include: { recipe: { select: { id: true, title: true } } } }, store: true },
    orderBy: { createdAt: 'desc' },
  });
  // Augment each list with all menuItemIds (visible + hidden under a merge container)
  const allItemMenuIds = await prisma.shoppingItem.findMany({
    where: { listId: { in: lists.map(l => l.id) }, menuItemId: { not: null } },
    select: { listId: true, menuItemId: true },
  });
  const linkedByList = new Map<string, string[]>();
  for (const r of allItemMenuIds) {
    if (!r.menuItemId) continue;
    if (!linkedByList.has(r.listId)) linkedByList.set(r.listId, []);
    linkedByList.get(r.listId)!.push(r.menuItemId);
  }
  res.json(lists.map(l => ({ ...l, linkedMenuItemIds: linkedByList.get(l.id) ?? [] })));
}));

// GET /api/shopping/lists/:listId
shoppingRouter.get('/lists/:listId', requireAuth, asyncHandler(async (req, res) => {
  const list = await getListAndVerifyMember(req.params.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const full = await prisma.shoppingList.findUnique({
    where: { id: list.id },
    include: { items: { where: { mergedIntoId: null }, orderBy: [{ isChecked: 'asc' }, { category: 'asc' }, { name: 'asc' }], include: { recipe: { select: { id: true, title: true } } } }, store: true },
  });
  res.json(full);
}));

// PATCH /api/shopping/lists/:listId/complete
shoppingRouter.patch('/lists/:listId/complete', requireAuth, asyncHandler(async (req, res) => {
  const list = await getListAndVerifyMember(req.params.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const updated = await prisma.shoppingList.update({
    where: { id: list.id },
    data: { completedAt: new Date() },
  });
  res.json(updated);
}));

// DELETE /api/shopping/lists/:listId
shoppingRouter.delete('/lists/:listId', requireAuth, asyncHandler(async (req, res) => {
  const list = await getListAndVerifyMember(req.params.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  await prisma.shoppingList.delete({ where: { id: list.id } });
  res.status(204).send();
}));

// PATCH /api/shopping/lists/:listId/shopper — sätt eller rensa "jag handlar"-
// presence på listan. Body: { memberId: string | null }. Broadcastas till
// hushållet så alla enheter ser uppdateringen direkt.
shoppingRouter.patch('/lists/:listId/shopper', requireAuth, asyncHandler(async (req, res) => {
  const list = await getListAndVerifyMember(req.params.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const body = z.object({ memberId: z.string().nullable() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  // Validera att memberId tillhör hushållet (om satt).
  let shopperName: string | null = null;
  if (body.data.memberId) {
    const member = await prisma.householdMember.findUnique({ where: { id: body.data.memberId } });
    if (!member || member.householdId !== list.householdId) {
      res.status(400).json({ error: 'Member not in this household' });
      return;
    }
    shopperName = member.displayName;
  }

  const updated = await prisma.shoppingList.update({
    where: { id: list.id },
    data: {
      activeShopperMemberId: body.data.memberId,
      activeShopperSince: body.data.memberId ? new Date() : null,
    },
  });
  const payload = {
    type: 'shopping_presence',
    data: {
      listId: updated.id,
      memberId: updated.activeShopperMemberId,
      since: updated.activeShopperSince?.toISOString() ?? null,
    },
  };
  // Broadcasta till båda kanalerna: hushållet (för list-översikten) + den
  // specifika listan (för list-detalj-sidan som är ansluten till list-WS).
  wsBroadcast(`household:${updated.householdId}`, payload);
  bcast(updated, payload);
  res.json({
    listId: updated.id,
    memberId: updated.activeShopperMemberId,
    since: updated.activeShopperSince,
  });

  // Push till övriga i hushållet när någon tar "Jag handlar".
  if (shopperName) {
    const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
    const members = await prisma.householdMember.findMany({
      where: { householdId: list.householdId },
      select: { clerkUserId: true },
    });
    const others = members
      .map(m => m.clerkUserId)
      .filter((id): id is string => !!id && id !== clerkUserId);
    if (others.length > 0) {
      void sendPush(others, 'shopperClaimed', {
        title: 'Handlar nu',
        body: `${shopperName} handlar från "${list.name}"`,
        data: { type: 'shopperClaimed', listId: list.id },
      });
    }
  }
}));

// PATCH /api/shopping/lists/:listId
shoppingRouter.patch('/lists/:listId', requireAuth, asyncHandler(async (req, res) => {
  const list = await getListAndVerifyMember(req.params.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const body = z.object({
    name: z.string().min(1).max(100).optional(),
    emoji: z.string().max(8).nullable().optional(),
    storeId: z.string().nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  await prisma.shoppingList.update({ where: { id: list.id }, data: body.data });
  // Hämta tillbaka med SAMMA filter som GET (mergedIntoId: null) så
  // hopslagna sub-items inte dyker upp som "duplicates" i frontend när
  // användaren byter butik/namn.
  const updated = await prisma.shoppingList.findUnique({
    where: { id: list.id },
    include: {
      items: {
        where: { mergedIntoId: null },
        orderBy: [{ isChecked: 'asc' }, { category: 'asc' }, { name: 'asc' }],
        include: { recipe: { select: { id: true, title: true } } },
      },
      store: true,
    },
  });
  res.json(updated);
}));

// POST /api/shopping/lists/:listId/items
shoppingRouter.post('/lists/:listId/items', requireAuth, asyncHandler(async (req, res) => {
  const list = await getListAndVerifyMember(req.params.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const body = addItemSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const normalizedName = stripIngredient(body.data.name);
  const staplePref = await prisma.stapleItem.findUnique({
    where: { householdId_name: { householdId: list.householdId, name: normalizedName } },
    select: { category: true },
  });
  // Track usage so the most-added staples surface as "dina vanligaste".
  if (staplePref) {
    prisma.stapleItem.update({
      where: { householdId_name: { householdId: list.householdId, name: normalizedName } },
      data: { usageCount: { increment: 1 } },
    }).catch(() => {});
  }
  // SubCategory är källan till sanning i 2-nivå-taxonomin. Auto-infer från
  // namnet om kallaren inte angav. Category härleds från sub:ens defaultParent
  // — kallaren kan override:a via body.data.category om de redan vet.
  const inferredSub = body.data.subCategory ?? inferSubCategory(normalizedName);
  const subCategory = inferredSub ?? null;
  const category = body.data.category !== 'other'
    ? body.data.category
    : subCategory
      ? parentForSub(subCategory as SubCategory)
      : (staplePref?.category ?? await getStoredCategory(normalizedName) ?? categorizeIngredient(normalizedName));

  // If an unchecked item with the same name+unit already exists, increment its quantity
  const existing = await prisma.shoppingItem.findFirst({
    where: {
      listId: list.id,
      name: { equals: normalizedName, mode: 'insensitive' },
      unit: body.data.unit ?? null,
      isChecked: false,
      mergedIntoId: null,
    },
  });

  if (existing) {
    const item = await prisma.shoppingItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + (body.data.quantity ?? 1) },
    });
    learnIngredientAliases([{ name: normalizedName, category }]).catch(() => {});
    notifyActiveShopper(list, (req as AuthenticatedRequest).clerkUserId, item.name).catch(() => {});
    bcast(list, { type: 'item_updated', data: item });
    res.status(200).json(item);
    return;
  }

  const item = await prisma.shoppingItem.create({
    data: { listId: list.id, ...body.data, name: normalizedName, category, subCategory, addedBy: (req as AuthenticatedRequest).clerkUserId },
  });

  learnIngredientAliases([{ name: normalizedName, category }]).catch(() => {});
  notifyActiveShopper(list, (req as AuthenticatedRequest).clerkUserId, item.name).catch(() => {});
  bcast(list, { type: 'item_added', data: item });
  res.status(201).json(item);
}));

// DELETE /api/shopping/lists/:listId/items  (clear all items, keep the list)
shoppingRouter.delete('/lists/:listId/items', requireAuth, asyncHandler(async (req, res) => {
  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  const list = await getListAndVerifyMember(req.params.listId, clerkUserId, res);
  if (!list) return;
  await prisma.shoppingItem.deleteMany({ where: { listId: list.id } });
  // Rensa "jag handlar"-presence när listan töms (annars hänger den kvar
  // visuellt fast inget finns att handla).
  if (list.activeShopperMemberId) {
    await prisma.shoppingList.update({
      where: { id: list.id },
      data: { activeShopperMemberId: null, activeShopperSince: null },
    });
    const clearPayload = {
      type: 'shopping_presence',
      data: { listId: list.id, memberId: null, since: null },
    };
    wsBroadcast(`household:${list.householdId}`, clearPayload);
    bcast(list, clearPayload);
  }
  bcast(list, { type: 'list_cleared' });
  res.status(204).send();

  // Notify the rest of the household that the active list was cleared.
  const members = await prisma.householdMember.findMany({
    where: { householdId: list.householdId },
    select: { clerkUserId: true },
  });
  const others = members
    .map(m => m.clerkUserId)
    .filter((id): id is string => !!id && id !== clerkUserId);
  if (others.length > 0) {
    void sendPush(others, 'listCleared', {
      title: 'Inköpslista rensad',
      body: `"${list.name}" har rensats`,
      data: { type: 'listCleared', listId: list.id },
    });
  }
}));

// PATCH /api/shopping/items/:itemId
shoppingRouter.patch('/items/:itemId', requireAuth, asyncHandler(async (req, res) => {
  const existing = await prisma.shoppingItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  const list = await getListAndVerifyMember(existing.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const body = updateItemSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const data = { ...body.data };
  if (data.name) data.name = data.name.toLowerCase();
  const item = await prisma.shoppingItem.update({ where: { id: existing.id }, data });

  if (data.category && data.category !== existing.category) {
    storeIngredientCategory(item.name, data.category as StoreCategory).catch(() => {});
  }

  bcast(list, { type: 'item_updated', data: item });
  res.json(item);
}));

// PATCH /api/shopping/items/:itemId/check
shoppingRouter.patch('/items/:itemId/check', requireAuth, asyncHandler(async (req, res) => {
  const existing = await prisma.shoppingItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  const list = await getListAndVerifyMember(existing.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const body = z.object({ checked: z.boolean() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  const item = await prisma.shoppingItem.update({
    where: { id: existing.id },
    data: { isChecked: body.data.checked, checkedBy: body.data.checked ? clerkUserId : null },
  });
  bcast(list, { type: 'item_updated', data: item });
  res.json(item);
}));

// POST /api/shopping/merge-suggestion — smart förslag för dubblettdialogen.
// Kombinerar förpacknings-ekvivalenser (UnitEquivalence: seed/AI/user-lärda)
// med volym-/masskonvertering: "1 paket + 390 g krossade tomater" → 2 paket.
// Ingen AI-nyckel/timeout/okänd vara → { suggestion: null } (klienten
// behåller sin naiva prefill).
shoppingRouter.post('/merge-suggestion', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ itemIds: z.array(z.string()).min(2) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const items = await prisma.shoppingItem.findMany({ where: { id: { in: body.data.itemIds } } });
  if (items.length !== body.data.itemIds.length) {
    res.status(404).json({ error: 'Some items not found' });
    return;
  }
  const listId = items[0].listId;
  if (items.some(i => i.listId !== listId)) {
    res.status(400).json({ error: 'All items must belong to the same list' });
    return;
  }
  const list = await getListAndVerifyMember(listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  // Kanoniska namnvarianter: strippat + ev. inlärt alias (cache-only — ingen
  // extra AI-hopp för namnet här).
  const stripped = stripIngredient(items[0].name);
  const alias = await prisma.ingredientAlias.findUnique({ where: { raw: stripped } });
  const names = [...new Set([stripped, alias?.canonical].filter((n): n is string => !!n))];

  const packagingUnits = [...new Set(
    items.map(i => (i.unit ?? '').toLowerCase().trim()).filter(u => isPackagingUnit(u))
  )];

  const equivalences = await resolveEquivalences(names, packagingUnits, 4000);
  const suggestion = suggestMerge(items.map(i => ({ quantity: i.quantity, unit: i.unit })), equivalences);
  res.json({ suggestion });
}));

// POST /api/shopping/items/merge — create a new synthetic merge container,
// hide all source items under it. On delete/unmerge the container disappears
// and the originals re-emerge intact.
shoppingRouter.post('/items/merge', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    sourceIds: z.array(z.string()).min(2),
    name: z.string().min(1),
    quantity: z.number().positive(),
    unit: z.string().nullable().optional(),
    category: categoryEnum,
  }).safeParse(req.body);
  if (!body.success) {
    console.error('merge body parse failed:', JSON.stringify(req.body), body.error.flatten());
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  const sources = await prisma.shoppingItem.findMany({
    where: { id: { in: body.data.sourceIds } },
  });
  if (sources.length !== body.data.sourceIds.length) {
    res.status(404).json({ error: 'Some source items not found' });
    return;
  }
  const listId = sources[0].listId;
  if (sources.some(s => s.listId !== listId)) {
    res.status(400).json({ error: 'All items must belong to the same list' });
    return;
  }

  const list = await getListAndVerifyMember(listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;

  const container = await prisma.$transaction(async (tx) => {
    const created = await tx.shoppingItem.create({
      data: {
        listId,
        name: body.data.name,
        quantity: body.data.quantity,
        unit: body.data.unit ?? null,
        category: body.data.category,
        addedBy: clerkUserId,
      },
      include: { recipe: { select: { id: true, title: true } } },
    });
    await tx.shoppingItem.updateMany({
      where: { id: { in: body.data.sourceIds }, listId },
      data: { mergedIntoId: created.id },
    });
    return created;
  });

  // Inlärning: promota/demota förpacknings-ekvivalenser utifrån vad användaren
  // faktiskt valde (fire-and-forget — får aldrig blockera eller fälla merge:n).
  {
    const strippedName = stripIngredient(sources[0].name);
    prisma.ingredientAlias.findUnique({ where: { raw: strippedName } })
      .then(alias => learnEquivalenceFromMerge(
        sources.map(s => ({ name: s.name, quantity: s.quantity, unit: s.unit })),
        { name: body.data.name, quantity: body.data.quantity, unit: body.data.unit },
        [...new Set([strippedName, alias?.canonical].filter((n): n is string => !!n))],
      ))
      .catch(() => {});
  }

  bcast(list, { type: 'item_added', data: container });
  for (const id of body.data.sourceIds) {
    bcast(list, { type: 'item_deleted', data: { id } });
  }
  res.json(container);
}));

// DELETE /api/shopping/lists/:listId/items/by-menu-item/:menuItemId
shoppingRouter.delete('/lists/:listId/items/by-menu-item/:menuItemId', requireAuth, asyncHandler(async (req, res) => {
  const list = await getListAndVerifyMember(req.params.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const matched = await prisma.shoppingItem.findMany({
    where: { listId: list.id, menuItemId: req.params.menuItemId },
    select: { id: true, mergedIntoId: true },
  });

  // Find every merge root touched by this delete and fully unmerge them
  const rootsToUnmerge = new Set<string>();
  for (const m of matched) {
    rootsToUnmerge.add(await findMergeRoot(list.id, m.id));
  }
  const restoredIds: string[] = [];
  const removedContainerIds: string[] = [];
  for (const rootId of rootsToUnmerge) {
    const { leaves, containers } = await fullyUnmerge(list.id, rootId);
    restoredIds.push(...leaves);
    removedContainerIds.push(...containers);
  }

  // Now delete all items with this menuItemId (originals + visible parents that came from this rätt)
  const deleted = await prisma.shoppingItem.findMany({
    where: { listId: list.id, menuItemId: req.params.menuItemId },
    select: { id: true },
  });
  await prisma.shoppingItem.deleteMany({
    where: { listId: list.id, menuItemId: req.params.menuItemId },
  });
  for (const { id } of deleted) {
    bcast(list, { type: 'item_deleted', data: { id } });
  }
  // Containers that got unmerged are also gone — tell clients
  for (const id of removedContainerIds) {
    bcast(list, { type: 'item_deleted', data: { id } });
  }

  // Broadcast survivors as added (formerly hidden items now visible)
  const deletedIds = new Set([...deleted.map(d => d.id), ...removedContainerIds]);
  const survivors = await prisma.shoppingItem.findMany({
    where: { id: { in: restoredIds.filter(id => !deletedIds.has(id)) } },
    include: { recipe: { select: { id: true, title: true } } },
  });
  for (const s of survivors) {
    bcast(list, { type: 'item_added', data: s });
  }

  // After unmerging, restored survivors may once again share name+unit with other
  // visible items. Re-run auto-merge so 3-egg → remove-1 → 2-egg merges cleanly.
  const visible = await prisma.shoppingItem.findMany({
    where: { listId: list.id, isChecked: false, mergedIntoId: null },
  });
  // Fas 2: bekräftad förpackningskunskap låter auto-merge slå ihop över
  // enhetsfamiljer (1 paket + 390 g → 2 paket). Aldrig rå-AI här.
  const confirmedEq = await loadConfirmedEquivalencesByName(visible.map(v => stripIngredient(v.name)));
  const groups = planAutoMerge(
    visible.map(v => ({
      id: v.id, name: v.name, unit: v.unit, quantity: v.quantity,
      menuItemId: v.menuItemId, mergedIntoId: v.mergedIntoId,
      isChecked: v.isChecked, category: v.category as string,
    })),
    (s) => stripIngredient(s),
    confirmedEq,
  );
  for (const group of groups) {
    const container = await prisma.shoppingItem.create({
      data: {
        listId: list.id,
        name: group.name,
        quantity: group.totalQty,
        unit: group.unit,
        category: group.category as never,
        addedBy: (req as AuthenticatedRequest).clerkUserId,
      },
    });
    await prisma.shoppingItem.updateMany({
      where: { id: { in: group.ids } },
      data: { mergedIntoId: container.id },
    });
    bcast(list, { type: 'item_added', data: container });
    for (const id of group.ids) {
      bcast(list, { type: 'item_deleted', data: { id } });
    }
    // Tell clients to show "Slog ihop N {namn}" so the merge isn't silent.
    bcast(list, { type: 'items_auto_merged', data: { name: group.name, count: group.ids.length } });
  }

  res.status(204).send();
}));

// DELETE /api/shopping/items/:itemId
shoppingRouter.delete('/items/:itemId', requireAuth, asyncHandler(async (req, res) => {
  const existing = await prisma.shoppingItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  const list = await getListAndVerifyMember(existing.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  // If this is a merge container (has children), delete the whole group — don't restore leaves.
  // Restoring would be confusing: the user deleted a merged item and expects everything gone.
  const hasChildren = await prisma.shoppingItem.findFirst({ where: { mergedIntoId: existing.id }, select: { id: true } });
  if (hasChildren) {
    const all = await prisma.shoppingItem.findMany({ where: { listId: existing.listId }, select: { id: true, mergedIntoId: true } });
    const groupIds: string[] = [existing.id];
    let frontier = [existing.id];
    while (frontier.length > 0) {
      const children = all.filter(x => x.mergedIntoId && frontier.includes(x.mergedIntoId)).map(x => x.id);
      groupIds.push(...children);
      frontier = children;
    }
    await prisma.shoppingItem.deleteMany({ where: { id: { in: groupIds } } });
    bcast(list, { type: 'item_deleted', data: { id: existing.id } });
    res.status(204).send();
    return;
  }

  await prisma.shoppingItem.delete({ where: { id: existing.id } });
  bcast(list, { type: 'item_deleted', data: { id: existing.id } });
  res.status(204).send();
}));
