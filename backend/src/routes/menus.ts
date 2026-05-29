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
import { planIncomingMatch, planAutoMerge } from '../lib/importDedupe';

export const menusRouter = Router();

// Bump each recipe's lifetime usage counter by how many times it appears in the
// batch (for "most used" sorting). Fire-and-forget.
async function bumpTimesUsed(items: { recipeId: string }[]): Promise<void> {
  const tally = new Map<string, number>();
  for (const it of items) tally.set(it.recipeId, (tally.get(it.recipeId) ?? 0) + 1);
  await Promise.all(
    [...tally].map(([recipeId, n]) =>
      prisma.recipe.update({ where: { id: recipeId }, data: { timesUsed: { increment: n } } }).catch(() => {})),
  );
}

const weekDayEnum = z.nativeEnum(WeekDay);

const createMenuItemSchema = z.object({
  householdId: z.string(),
  recipeId: z.string(),
  day: weekDayEnum.nullable().default(null),
  weekYear: z.number().int(),
  weekNumber: z.number().int().min(1).max(53),
  note: z.string().max(500).nullable().optional(),
  servings: z.number().int().positive().nullable().optional(),
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
// Notify the household that a week's menu changed so other devices refresh the
// affected week live (L35 follow-up: menu had no realtime at all).
function bcastMenu(householdId: string, weekYear: number, weekNumber: number) {
  wsBroadcast(`household:${householdId}`, { type: 'menu_updated', data: { weekYear, weekNumber } });
}

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
  // Lifetime usage counter for "most used" sorting (never decremented).
  prisma.recipe.update({ where: { id: item.recipeId }, data: { timesUsed: { increment: 1 } } }).catch(() => {});
  bcastMenu(item.householdId, item.weekYear, item.weekNumber);
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
    servings: z.number().int().positive().nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const updated = await prisma.weekMenuItem.update({
    where: { id: item.id },
    data: body.data,
    include: { recipe: { include: { ingredients: true } } },
  });
  bcastMenu(updated.householdId, updated.weekYear, updated.weekNumber);
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
  bcastMenu(item.householdId, item.weekYear, item.weekNumber);
  res.status(204).send();
}));

// POST /api/menus/copy — copy all menu items from one ISO week to another
menusRouter.post('/copy', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    householdId: z.string(),
    fromWeekYear: z.number().int(),
    fromWeekNumber: z.number().int().min(1).max(53),
    toWeekYear: z.number().int(),
    toWeekNumber: z.number().int().min(1).max(53),
    overwrite: z.boolean().default(false),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: body.data.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  const source = await prisma.weekMenuItem.findMany({
    where: {
      householdId: body.data.householdId,
      weekYear: body.data.fromWeekYear,
      weekNumber: body.data.fromWeekNumber,
    },
  });
  if (source.length === 0) {
    res.status(404).json({ error: 'Källveckan har inga planerade rätter' });
    return;
  }

  if (body.data.overwrite) {
    await prisma.weekMenuItem.deleteMany({
      where: {
        householdId: body.data.householdId,
        weekYear: body.data.toWeekYear,
        weekNumber: body.data.toWeekNumber,
      },
    });
  }

  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  const created = await prisma.weekMenuItem.createManyAndReturn({
    data: source.map(s => ({
      householdId: body.data.householdId,
      recipeId: s.recipeId,
      day: s.day,
      weekYear: body.data.toWeekYear,
      weekNumber: body.data.toWeekNumber,
      note: s.note,
      createdBy: clerkUserId,
    })),
  });
  await bumpTimesUsed(created);
  bcastMenu(body.data.householdId, body.data.toWeekYear, body.data.toWeekNumber);
  res.status(201).json({ copied: created.length, items: created });
}));

// --- Menu templates (save a week's menu, apply to any week) ---

async function verifyMember(householdId: string, clerkUserId: string): Promise<boolean> {
  const m = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId, clerkUserId } },
  });
  return !!m;
}

// GET /api/menus/templates?householdId=
menusRouter.get('/templates', requireAuth, asyncHandler(async (req, res) => {
  const householdId = String(req.query.householdId ?? '');
  if (!householdId) { res.status(400).json({ error: 'Missing householdId' }); return; }
  if (!await verifyMember(householdId, (req as AuthenticatedRequest).clerkUserId)) {
    res.status(403).json({ error: 'Not a member of this household' }); return;
  }
  const templates = await prisma.menuTemplate.findMany({
    where: { householdId },
    orderBy: { createdAt: 'desc' },
    include: { items: { include: { recipe: { select: { id: true, title: true } } } } },
  });
  res.json(templates);
}));

// POST /api/menus/templates — snapshot a week's menu into a named template
menusRouter.post('/templates', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = z.object({
    householdId: z.string(),
    name: z.string().min(1).max(100),
    weekYear: z.number().int(),
    weekNumber: z.number().int().min(1).max(53),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const source = await prisma.weekMenuItem.findMany({
    where: { householdId: body.data.householdId, weekYear: body.data.weekYear, weekNumber: body.data.weekNumber },
  });
  if (source.length === 0) { res.status(404).json({ error: 'Veckan har inga planerade rätter att spara' }); return; }

  const template = await prisma.menuTemplate.create({
    data: {
      householdId: body.data.householdId,
      name: body.data.name,
      createdBy: (req as AuthenticatedRequest).clerkUserId,
      items: { create: source.map(s => ({ recipeId: s.recipeId, day: s.day })) },
    },
    include: { items: { include: { recipe: { select: { id: true, title: true } } } } },
  });
  res.status(201).json(template);
}));

// POST /api/menus/templates/:templateId/apply — create week menu items from a template
menusRouter.post('/templates/:templateId/apply', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    weekYear: z.number().int(),
    weekNumber: z.number().int().min(1).max(53),
    overwrite: z.boolean().default(false),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const template = await prisma.menuTemplate.findUnique({
    where: { id: req.params.templateId },
    include: { items: true },
  });
  if (!template) { res.status(404).json({ error: 'Mall hittades inte' }); return; }
  if (!await verifyMember(template.householdId, (req as AuthenticatedRequest).clerkUserId)) {
    res.status(403).json({ error: 'Not a member of this household' }); return;
  }

  if (body.data.overwrite) {
    await prisma.weekMenuItem.deleteMany({
      where: { householdId: template.householdId, weekYear: body.data.weekYear, weekNumber: body.data.weekNumber },
    });
  }

  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  const created = await prisma.weekMenuItem.createManyAndReturn({
    data: template.items.map(it => ({
      householdId: template.householdId,
      recipeId: it.recipeId,
      day: it.day,
      weekYear: body.data.weekYear,
      weekNumber: body.data.weekNumber,
      createdBy: clerkUserId,
    })),
  });
  await bumpTimesUsed(created);
  bcastMenu(template.householdId, body.data.weekYear, body.data.weekNumber);
  res.status(201).json({ applied: created.length });
}));

// DELETE /api/menus/templates/:templateId
menusRouter.delete('/templates/:templateId', requireAuth, asyncHandler(async (req, res) => {
  const template = await prisma.menuTemplate.findUnique({ where: { id: req.params.templateId } });
  if (!template) { res.status(404).json({ error: 'Mall hittades inte' }); return; }
  if (!await verifyMember(template.householdId, (req as AuthenticatedRequest).clerkUserId)) {
    res.status(403).json({ error: 'Not a member of this household' }); return;
  }
  await prisma.menuTemplate.delete({ where: { id: template.id } });
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

  // Use the pure helper for phase-1 matching. See importDedupe.test.ts for the
  // exact merging rules across the user scenarios.
  const existingItems = await prisma.shoppingItem.findMany({
    where: { listId: list.id },
  });
  const parentIds = new Set(existingItems.map(e => e.mergedIntoId).filter((x): x is string => !!x));
  const matchPlan = planIncomingMatch(
    sorted.map(ing => ({
      name: ing.name,
      unit: ing.unit,
      quantity: ing.quantity,
      menuItemId: ing.menuItemId ?? null,
      category: ing.category,
    })),
    existingItems.map(e => ({
      id: e.id,
      name: e.name,
      unit: e.unit,
      quantity: e.quantity,
      menuItemId: e.menuItemId,
      mergedIntoId: e.mergedIntoId,
      isChecked: e.isChecked,
      category: e.category as string,
      hasChildren: parentIds.has(e.id),
    })),
    (s) => stripIngredient(s),
  );
  const toUpdate = matchPlan.toUpdate;
  // Re-attach the original ingredient objects so we keep recipeId etc. for create.
  const toCreate = matchPlan.toCreate.map(p =>
    sorted.find(s => s.name === p.name && s.unit === p.unit && (s.menuItemId ?? null) === (p.menuItemId ?? null) && (s.quantity ?? 1) === (p.quantity ?? 1))!
  );

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

  // Auto-soft-merge using the pure planner so behavior matches importDedupe tests.
  const visible = await prisma.shoppingItem.findMany({
    where: { listId: list.id, isChecked: false, mergedIntoId: null },
  });
  const mergeGroups = planAutoMerge(
    visible.map(v => ({
      id: v.id,
      name: v.name,
      unit: v.unit,
      quantity: v.quantity,
      menuItemId: v.menuItemId,
      mergedIntoId: v.mergedIntoId,
      isChecked: v.isChecked,
      category: v.category as string,
    })),
    (s) => stripIngredient(s),
  );
  for (const group of mergeGroups) {
    const container = await prisma.shoppingItem.create({
      data: {
        listId: list.id,
        name: group.name,
        quantity: group.totalQty,
        unit: group.unit,
        category: group.category as never,
        addedBy: clerkUserId,
      },
    });
    await prisma.shoppingItem.updateMany({
      where: { id: { in: group.ids } },
      data: { mergedIntoId: container.id },
    });
    wsBroadcast(list.id, { type: 'item_added', data: container });
    for (const id of group.ids) {
      wsBroadcast(list.id, { type: 'item_deleted', data: { id } });
    }
  }

  res.status(201).json([...updatedItems, ...createdItems]);
}));
