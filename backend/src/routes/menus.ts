import { Router } from 'express';
import { z } from 'zod';
import { WeekDay, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { normalizeIngredientNames, getStoredCategory } from '../lib/normalizeIngredients';
import { categorizeIngredient } from '../lib/categorizeIngredient';
import { stripIngredient } from '../lib/stripIngredient';
import { wsBroadcast } from '../lib/wsHub';

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
    data: { ...body.data, createdBy: (req as AuthenticatedRequest).clerkUserId } as Prisma.WeekMenuItemUncheckedCreateInput,
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
      menuItemId: z.string().optional(),
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

  // Normalize ingredient names (strips prep instructions, canonicalizes synonyms)
  const rawNames = body.data.ingredients.map(i => i.name);
  const normalizedNames = await normalizeIngredientNames(rawNames);
  const ingredients = body.data.ingredients.map((ing, i) => ({
    ...ing,
    name: normalizedNames[i] ?? ing.name,
  }));

  // Deduplicate within batch: same name+unit+menuItemId → sum quantities
  const deduped = new Map<string, typeof ingredients[0]>();
  for (const ing of ingredients) {
    const key = `${ing.name.toLowerCase().trim()}|${(ing.unit ?? '').toLowerCase().trim()}|${ing.menuItemId ?? ing.recipeId}`;
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

  // Merge with existing unchecked items in the list.
  // Normalize existing item names via stripIngredient so stale names (e.g. "klyftor vitlök")
  // match against canonicalized incoming names ("vitlök").
  // Items with a menuItemId only merge with existing items sharing the same menuItemId.
  // Items without a menuItemId merge by canonical name+unit (legacy behaviour).
  const existingItems = await prisma.shoppingItem.findMany({
    where: { listId: list.id, isChecked: false, mergedIntoId: null },
  });
  const existingByMenuItemKey = new Map<string, typeof existingItems[0]>();
  const existingByNameUnit = new Map<string, typeof existingItems[0]>();
  for (const ei of existingItems) {
    const resolvedName = stripIngredient(ei.name);
    const unitKey = (ei.unit ?? '').toLowerCase().trim();
    if (ei.menuItemId) {
      existingByMenuItemKey.set(`${resolvedName}|${unitKey}|${ei.menuItemId}`, ei);
    } else {
      existingByNameUnit.set(`${resolvedName}|${unitKey}`, ei);
    }
  }

  const toCreate: typeof sorted = [];
  const toUpdate: { id: string; quantity: number; name: string }[] = [];
  for (const ing of sorted) {
    const nameUnit = `${ing.name.toLowerCase().trim()}|${(ing.unit ?? '').toLowerCase().trim()}`;
    if (ing.menuItemId) {
      const match = existingByMenuItemKey.get(`${nameUnit}|${ing.menuItemId}`);
      if (match) {
        toUpdate.push({ id: match.id, quantity: match.quantity + (ing.quantity ?? 1), name: ing.name });
      } else {
        toCreate.push(ing);
      }
    } else {
      const match = existingByNameUnit.get(nameUnit);
      if (match) {
        toUpdate.push({ id: match.id, quantity: match.quantity + (ing.quantity ?? 1), name: ing.name });
      } else {
        toCreate.push(ing);
      }
    }
  }

  // Resolve categories — check stored user overrides before keyword fallback
  const toCreateWithCategory = await Promise.all(
    toCreate.map(async ing => ({
      ...ing,
      resolvedCategory: ing.category === 'other'
        ? (await getStoredCategory(ing.name) ?? categorizeIngredient(ing.name))
        : ing.category,
    }))
  );

  const [updatedItems, createdItems] = await Promise.all([
    // Update quantity AND name (canonicalizes stale names like "klyftor vitlök" → "vitlök")
    Promise.all(toUpdate.map(u => prisma.shoppingItem.update({ where: { id: u.id }, data: { quantity: u.quantity, name: u.name } }))),
    toCreateWithCategory.length > 0
      ? prisma.shoppingItem.createManyAndReturn({
          data: toCreateWithCategory.map(ing => ({
            listId: list.id,
            name: ing.name,
            quantity: ing.quantity ?? 1,
            unit: ing.unit,
            category: ing.resolvedCategory as never,
            addedBy: clerkUserId,
            recipeId: ing.recipeId,
            menuItemId: ing.menuItemId ?? null,
          })),
        })
      : Promise.resolve([]),
  ]);
  for (const item of updatedItems) {
    wsBroadcast(list.id, { type: 'item_updated', data: item });
  }
  for (const item of createdItems) {
    wsBroadcast(list.id, { type: 'item_added', data: item });
  }
  res.status(201).json([...updatedItems, ...createdItems]);
}));
