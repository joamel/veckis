import { Router, Response } from 'express';
import { z } from 'zod';
import { StoreCategory } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

export const shoppingRouter = Router();

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
    data: { ...body.data, createdBy: (req as AuthenticatedRequest).clerkUserId },
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
    include: { items: { orderBy: { createdAt: 'asc' } }, store: true },
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
    include: { items: { orderBy: [{ isChecked: 'asc' }, { category: 'asc' }] }, store: true },
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

// POST /api/shopping/lists/:listId/items
shoppingRouter.post('/lists/:listId/items', requireAuth, asyncHandler(async (req, res) => {
  const list = await getListAndVerifyMember(req.params.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const body = addItemSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const item = await prisma.shoppingItem.create({
    data: { listId: list.id, ...body.data, addedBy: (req as AuthenticatedRequest).clerkUserId },
  });
  res.status(201).json(item);
}));

// PATCH /api/shopping/items/:itemId
shoppingRouter.patch('/items/:itemId', requireAuth, asyncHandler(async (req, res) => {
  const existing = await prisma.shoppingItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  const list = await getListAndVerifyMember(existing.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const body = updateItemSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const item = await prisma.shoppingItem.update({ where: { id: existing.id }, data: body.data });
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
  res.json(item);
}));

// DELETE /api/shopping/items/:itemId
shoppingRouter.delete('/items/:itemId', requireAuth, asyncHandler(async (req, res) => {
  const existing = await prisma.shoppingItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  const list = await getListAndVerifyMember(existing.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  await prisma.shoppingItem.delete({ where: { id: existing.id } });
  res.status(204).send();
}));
