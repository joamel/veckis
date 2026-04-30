import { Router } from 'express';
import { z } from 'zod';
import { WeekDay } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

export const menusRouter = Router();

const weekDayEnum = z.nativeEnum(WeekDay);

const createMenuItemSchema = z.object({
  householdId: z.string(),
  recipeId: z.string(),
  day: weekDayEnum.nullable().default(null),
  weekYear: z.number().int(),
  weekNumber: z.number().int().min(1).max(53),
  note: z.string().max(500).nullable().optional(),
});

// GET /api/menus?householdId=&weekYear=&weekNumber=
menusRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { householdId, weekYear, weekNumber } = req.query;
  if (typeof householdId !== 'string') { res.status(400).json({ error: 'Missing householdId' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  const where: Record<string, unknown> = { householdId };
  if (weekYear) where.weekYear = parseInt(String(weekYear), 10);
  if (weekNumber) where.weekNumber = parseInt(String(weekNumber), 10);

  const items = await prisma.weekMenuItem.findMany({
    where,
    include: { recipe: { include: { ingredients: true } } },
    orderBy: [{ weekYear: 'asc' }, { weekNumber: 'asc' }, { day: 'asc' }],
  });
  res.json(items);
}));

// POST /api/menus
menusRouter.post('/', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = createMenuItemSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const recipe = await prisma.recipe.findUnique({ where: { id: body.data.recipeId } });
  if (!recipe || recipe.householdId !== body.data.householdId) {
    res.status(404).json({ error: 'Recipe not found' }); return;
  }

  const item = await prisma.weekMenuItem.create({
    data: { ...body.data, createdBy: (req as AuthenticatedRequest).clerkUserId },
    include: { recipe: { include: { ingredients: true } } },
  });
  res.status(201).json(item);
}));

// PATCH /api/menus/:itemId
menusRouter.patch('/:itemId', requireAuth, asyncHandler(async (req, res) => {
  const item = await prisma.weekMenuItem.findUnique({ where: { id: req.params.itemId } });
  if (!item) { res.status(404).json({ error: 'Menu item not found' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: item.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  const body = z.object({
    day: weekDayEnum.nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const updated = await prisma.weekMenuItem.update({
    where: { id: item.id },
    data: body.data,
    include: { recipe: { include: { ingredients: true } } },
  });
  res.json(updated);
}));

// DELETE /api/menus/:itemId
menusRouter.delete('/:itemId', requireAuth, asyncHandler(async (req, res) => {
  const item = await prisma.weekMenuItem.findUnique({ where: { id: req.params.itemId } });
  if (!item) { res.status(404).json({ error: 'Menu item not found' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: item.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  await prisma.weekMenuItem.delete({ where: { id: item.id } });
  res.status(204).send();
}));

// POST /api/menus/to-shopping — transfer selected ingredients to a shopping list
menusRouter.post('/to-shopping', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    listId: z.string(),
    ingredients: z.array(z.object({
      name: z.string().min(1),
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      category: z.string().default('other'),
      recipeId: z.string(),
    })),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const list = await prisma.shoppingList.findUnique({ where: { id: body.data.listId } });
  if (!list) { res.status(404).json({ error: 'Shopping list not found' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: list.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;

  // Deduplicate: same name+unit → sum quantities
  const deduped = new Map<string, typeof body.data.ingredients[0]>();
  for (const ing of body.data.ingredients) {
    const key = `${ing.name.toLowerCase().trim()}|${(ing.unit ?? '').toLowerCase().trim()}`;
    if (deduped.has(key)) {
      const existing = deduped.get(key)!;
      existing.quantity = (existing.quantity ?? 1) + (ing.quantity ?? 1);
    } else {
      deduped.set(key, { ...ing });
    }
  }

  // Sort by list store's categoryOrder (or default)
  const store = list.storeId ? await prisma.store.findUnique({ where: { id: list.storeId } }) : null;
  const categoryOrder: string[] = store?.categoryOrder?.length
    ? store.categoryOrder
    : ['fruit_veg','meat_fish','dairy_eggs','bread_bakery','frozen','canned_dry','snacks_sweets','beverages','cleaning','personal_care','other'];

  const sorted = [...deduped.values()].sort((a, b) => {
    const ai = categoryOrder.indexOf(a.category ?? 'other');
    const bi = categoryOrder.indexOf(b.category ?? 'other');
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const items = await prisma.shoppingItem.createManyAndReturn({
    data: sorted.map(ing => ({
      listId: list.id,
      name: ing.name,
      quantity: ing.quantity ?? 1,
      unit: ing.unit,
      category: ing.category as never,
      addedBy: clerkUserId,
      recipeId: ing.recipeId,
    })),
  });
  res.status(201).json(items);
}));
