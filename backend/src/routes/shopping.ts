import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';

export const shoppingRouter = Router();

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
  category: z.string().default('other'),
  note: z.string().optional(),
});

// POST /api/shopping/lists
shoppingRouter.post('/lists', requireAuth, requireHouseholdMember, async (req, res) => {
  const body = createListSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  const list = await prisma.shoppingList.create({
    data: {
      ...body.data,
      createdBy: (req as AuthenticatedRequest).clerkUserId,
    },
  });
  res.status(201).json(list);
});

// GET /api/shopping/lists?householdId=
shoppingRouter.get('/lists', requireAuth, async (req, res) => {
  const { householdId } = req.query;
  if (typeof householdId !== 'string') {
    res.status(400).json({ error: 'Missing householdId' });
    return;
  }

  const lists = await prisma.shoppingList.findMany({
    where: { householdId, completedAt: null },
    include: { items: true, store: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(lists);
});

// POST /api/shopping/lists/:listId/items
shoppingRouter.post('/lists/:listId/items', requireAuth, async (req, res) => {
  const body = addItemSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  const item = await prisma.shoppingItem.create({
    data: {
      listId: req.params.listId,
      ...body.data,
      category: body.data.category as never,
      addedBy: (req as AuthenticatedRequest).clerkUserId,
    },
  });
  res.status(201).json(item);
});

// PATCH /api/shopping/items/:itemId/check
shoppingRouter.patch('/items/:itemId/check', requireAuth, async (req, res) => {
  const { checked } = req.body as { checked: boolean };
  const item = await prisma.shoppingItem.update({
    where: { id: req.params.itemId },
    data: {
      isChecked: checked,
      checkedBy: checked ? (req as AuthenticatedRequest).clerkUserId : null,
    },
  });
  res.json(item);
});
