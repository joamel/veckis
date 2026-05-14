import { Router, Response } from 'express';
import { z } from 'zod';
import { StoreCategory, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { categorizeIngredient } from '../lib/categorizeIngredient';
import { learnIngredientAliases, getStoredCategory, storeIngredientCategory } from '../lib/normalizeIngredients';
import { stripIngredient } from '../lib/stripIngredient';
import { wsBroadcast } from '../lib/wsHub';

export const shoppingRouter = Router();

// Walk up the merge chain to find the visible root item
async function findMergeRoot(itemId: string): Promise<string> {
  let currentId = itemId;
  while (true) {
    const item = await prisma.shoppingItem.findUnique({
      where: { id: currentId },
      select: { mergedIntoId: true },
    });
    if (!item?.mergedIntoId) return currentId;
    currentId = item.mergedIntoId;
  }
}

// Recursively restore all descendants of rootId (set mergedIntoId = null on them)
async function fullyUnmerge(rootId: string): Promise<string[]> {
  const restored: string[] = [];
  const children = await prisma.shoppingItem.findMany({
    where: { mergedIntoId: rootId },
    select: { id: true },
  });
  for (const child of children) {
    await prisma.shoppingItem.update({ where: { id: child.id }, data: { mergedIntoId: null } });
    restored.push(child.id);
    const deeper = await fullyUnmerge(child.id);
    restored.push(...deeper);
  }
  return restored;
}

const categoryEnum = z.nativeEnum(StoreCategory);

const createListSchema = z.object({
  householdId: z.string(),
  name: z.string().min(1).max(100),
  storeId: z.string().optional(),
  isShared: z.boolean().default(true),
});

const addItemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().positive().default(1),
  unit: z.string().optional(),
  category: categoryEnum.default('other'),
  note: z.string().optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().nullable().optional(),
  category: categoryEnum.optional(),
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
  return list;
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
  res.json(lists);
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

// PATCH /api/shopping/lists/:listId
shoppingRouter.patch('/lists/:listId', requireAuth, asyncHandler(async (req, res) => {
  const list = await getListAndVerifyMember(req.params.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const body = z.object({
    name: z.string().min(1).max(100).optional(),
    storeId: z.string().nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const updated = await prisma.shoppingList.update({
    where: { id: list.id },
    data: body.data,
    include: { items: { include: { recipe: { select: { id: true, title: true } } } }, store: true },
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
  const category = body.data.category === 'other'
    ? (staplePref?.category ?? await getStoredCategory(normalizedName) ?? categorizeIngredient(normalizedName))
    : body.data.category;

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
    wsBroadcast(list.id, { type: 'item_updated', data: item });
    res.status(200).json(item);
    return;
  }

  const item = await prisma.shoppingItem.create({
    data: { listId: list.id, ...body.data, name: normalizedName, category, addedBy: (req as AuthenticatedRequest).clerkUserId },
  });

  learnIngredientAliases([{ name: normalizedName, category }]).catch(() => {});
  wsBroadcast(list.id, { type: 'item_added', data: item });
  res.status(201).json(item);
}));

// DELETE /api/shopping/lists/:listId/items  (clear all items, keep the list)
shoppingRouter.delete('/lists/:listId/items', requireAuth, asyncHandler(async (req, res) => {
  const list = await getListAndVerifyMember(req.params.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;
  await prisma.shoppingItem.deleteMany({ where: { listId: list.id } });
  wsBroadcast(list.id, { type: 'list_cleared' });
  res.status(204).send();
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

  wsBroadcast(list.id, { type: 'item_updated', data: item });
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
  wsBroadcast(existing.listId, { type: 'item_updated', data: item });
  res.json(item);
}));

// POST /api/shopping/items/merge — soft-merge: keep one item, hide others by setting mergedIntoId
shoppingRouter.post('/items/merge', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    keepId: z.string(),
    removeIds: z.array(z.string()).min(1),
    name: z.string().min(1).optional(),
    quantity: z.number().positive().optional(),
    unit: z.string().nullable().optional(),
    category: categoryEnum.optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const keep = await prisma.shoppingItem.findUnique({ where: { id: body.data.keepId } });
  if (!keep) { res.status(404).json({ error: 'Keep item not found' }); return; }

  const list = await getListAndVerifyMember(keep.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const updateData: Prisma.ShoppingItemUpdateInput = {};
  if (body.data.name !== undefined) updateData.name = body.data.name;
  if (body.data.quantity !== undefined) updateData.quantity = body.data.quantity;
  if (body.data.unit !== undefined) updateData.unit = body.data.unit;
  if (body.data.category !== undefined) updateData.category = body.data.category;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.shoppingItem.update({
      where: { id: keep.id },
      data: updateData,
      include: { recipe: { select: { id: true, title: true } } },
    });
    await tx.shoppingItem.updateMany({
      where: { id: { in: body.data.removeIds }, listId: list.id },
      data: { mergedIntoId: keep.id },
    });
    return u;
  });

  wsBroadcast(list.id, { type: 'item_updated', data: updated });
  for (const id of body.data.removeIds) {
    wsBroadcast(list.id, { type: 'item_deleted', data: { id } });
  }
  res.json(updated);
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
    rootsToUnmerge.add(await findMergeRoot(m.id));
  }
  const restoredIds: string[] = [];
  for (const rootId of rootsToUnmerge) {
    const restored = await fullyUnmerge(rootId);
    restoredIds.push(...restored);
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
    wsBroadcast(list.id, { type: 'item_deleted', data: { id } });
  }

  // Broadcast survivors as added (formerly hidden items now visible)
  const deletedIds = new Set(deleted.map(d => d.id));
  const survivors = await prisma.shoppingItem.findMany({
    where: { id: { in: restoredIds.filter(id => !deletedIds.has(id)) } },
    include: { recipe: { select: { id: true, title: true } } },
  });
  for (const s of survivors) {
    wsBroadcast(list.id, { type: 'item_added', data: s });
  }

  res.status(204).send();
}));

// DELETE /api/shopping/items/:itemId
shoppingRouter.delete('/items/:itemId', requireAuth, asyncHandler(async (req, res) => {
  const existing = await prisma.shoppingItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  const list = await getListAndVerifyMember(existing.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  // If this is a visible merged item, fully unmerge its tree first so children survive
  const rootId = await findMergeRoot(existing.id);
  let restoredIds: string[] = [];
  if (rootId === existing.id) {
    restoredIds = await fullyUnmerge(existing.id);
  }

  await prisma.shoppingItem.delete({ where: { id: existing.id } });
  wsBroadcast(list.id, { type: 'item_deleted', data: { id: existing.id } });

  if (restoredIds.length > 0) {
    const survivors = await prisma.shoppingItem.findMany({
      where: { id: { in: restoredIds } },
      include: { recipe: { select: { id: true, title: true } } },
    });
    for (const s of survivors) {
      wsBroadcast(list.id, { type: 'item_added', data: s });
    }
  }
  res.status(204).send();
}));
