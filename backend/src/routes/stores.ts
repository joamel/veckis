import { Router } from 'express';
import { z } from 'zod';
import { StoreCategory } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

export const storesRouter = Router();

const categoryEnum = z.nativeEnum(StoreCategory);
const categoryOrderSchema = z.array(categoryEnum);
const customCategoriesSchema = z.array(z.string().min(1).max(40)).max(40);
const expandedSubsSchema = z.array(z.string().min(1).max(40)).max(100);

const createStoreSchema = z.object({
  householdId: z.string(),
  name: z.string().min(1).max(100),
  categoryOrder: categoryOrderSchema.optional(),
  customCategories: customCategoriesSchema.optional(),
  expandedSubs: expandedSubsSchema.optional(),
});

const updateStoreSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  categoryOrder: categoryOrderSchema.optional(),
  customCategories: customCategoriesSchema.optional(),
  expandedSubs: expandedSubsSchema.optional(),
});

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
  });
  res.json(stores);
}));

// POST /api/stores
storesRouter.post('/', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = createStoreSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const store = await prisma.store.create({
    data: {
      householdId: body.data.householdId,
      name: body.data.name,
      categoryOrder: body.data.categoryOrder ?? (Object.values(StoreCategory) as StoreCategory[]),
    },
  });
  res.status(201).json(store);
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

  const updated = await prisma.store.update({ where: { id: store.id }, data: body.data });
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
