import { Router } from 'express';
import { z } from 'zod';
import { StoreCategory, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { categorizeIngredient } from '../lib/categorizeIngredient';
import { COMMON_INGREDIENTS } from '../lib/commonIngredients';
import { startsWithUnit } from '../lib/stripIngredient';

export const staplesRouter = Router();

// Under betan (pålitliga testare, litet urval) vill vi noll friktion för att
// nya ingredienser ska synas globalt — sätt till 1 så ingen filtrering sker.
// Höj till 2 (kräver ≥2 DISTINKTA hushåll, se IngredientAliasHousehold i
// schemat) efter den riktiga lanseringen, när enstaka hushålls
// stavfel/udda varor annars skulle läcka till alla andra direkt.
const MIN_HOUSEHOLDS_FOR_GLOBAL_SUGGESTION = 1;

const categoryEnum = z.nativeEnum(StoreCategory);

// GET /api/staples?householdId=
staplesRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { householdId } = req.query;
  if (typeof householdId !== 'string') { res.status(400).json({ error: 'Missing householdId' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member' }); return; }

  const staples = await prisma.stapleItem.findMany({
    where: { householdId },
    orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
  });
  res.json(staples);
}));

// POST /api/staples — upsert by name
staplesRouter.post('/', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = z.object({
    householdId: z.string(),
    name: z.string().min(1).max(200),
    category: categoryEnum.default('other'),
    unit: z.string().max(50).nullable().optional(),
    defaultQuantity: z.number().positive().nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const normalizedName = body.data.name.toLowerCase();
  const category = body.data.category === 'other'
    ? categorizeIngredient(normalizedName)
    : body.data.category;

  const staple = await prisma.stapleItem.upsert({
    where: { householdId_name: { householdId: body.data.householdId, name: normalizedName } },
    create: { ...body.data, name: normalizedName, category } as Prisma.StapleItemUncheckedCreateInput,
    update: { category, unit: body.data.unit, defaultQuantity: body.data.defaultQuantity },
  });
  res.status(201).json(staple);
}));

// GET /api/staples/suggestions — canonical ingredient names for autocomplete
staplesRouter.get('/suggestions', requireAuth, asyncHandler(async (req, res) => {
  const { householdId } = req.query;
  if (typeof householdId !== 'string') { res.status(400).json({ error: 'Missing householdId' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member' }); return; }

  const [aliases, hidden] = await Promise.all([
    prisma.ingredientAlias.findMany({
      distinct: ['canonical'],
      select: { raw: true, canonical: true, category: true },
      orderBy: { seenCount: 'desc' },
      take: 500,
    }),
    prisma.hiddenSuggestion.findMany({ where: { householdId }, select: { name: true } }),
  ]);

  // Global tröskel: kräv att minst N distinkta hushåll sett namnet innan det
  // syns för ANDRA hushåll (se konstanten ovan). No-op medan tröskeln är 1 —
  // frågan körs bara när den faktiskt filtrerar bort något.
  const eligibleAliases = MIN_HOUSEHOLDS_FOR_GLOBAL_SUGGESTION > 1
    ? await (async () => {
        const counts = await prisma.ingredientAliasHousehold.groupBy({
          by: ['raw'],
          where: { raw: { in: aliases.map(a => a.raw) } },
          _count: { householdId: true },
        });
        const countByRaw = new Map(counts.map(c => [c.raw, c._count.householdId]));
        return aliases.filter(a => (countByRaw.get(a.raw) ?? 0) >= MIN_HOUSEHOLDS_FOR_GLOBAL_SUGGESTION);
      })()
    : aliases;

  // Per-hushåll dolda förslag (långtryck → "ta bort förslag") filtreras bort ur
  // bägge källorna. Global IngredientAlias rörs inte — bara det här hushållet
  // slutar se namnet.
  const hiddenNames = new Set(hidden.map(h => h.name.toLowerCase()));

  // Filtrera bort trasiga legacy-alias där en måttenhet fastnat först i namnet
  // ("kg potatis") — de ska aldrig dyka upp som förslag. Nya alias stoppas redan
  // i stripIngredient, det här skyddar mot rader som redan finns i DB.
  const cleanAliases = eligibleAliases.filter(a => !startsWithUnit(a.canonical) && !hiddenNames.has(a.canonical.toLowerCase()));
  const aliasNames = new Set(cleanAliases.map(a => a.canonical.toLowerCase()));
  const common = COMMON_INGREDIENTS.filter(c => !aliasNames.has(c.name.toLowerCase()) && !hiddenNames.has(c.name.toLowerCase()));

  res.json([
    ...cleanAliases.map(a => ({ name: a.canonical, category: a.category as string })),
    ...common.map(c => ({ name: c.name, category: c.category as string })),
  ]);
}));

// POST /api/staples/hide-suggestion — dölj ett sök-/ingrediensförslag för hushållet
// (långtryck → "ta bort förslag"). Namnet normaliseras lowercase; upsert gör det
// idempotent så dubbeltryck inte kraschar.
staplesRouter.post('/hide-suggestion', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = z.object({
    householdId: z.string(),
    name: z.string().min(1).max(200),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const name = body.data.name.toLowerCase();
  const hidden = await prisma.hiddenSuggestion.upsert({
    where: { householdId_name: { householdId: body.data.householdId, name } },
    create: { householdId: body.data.householdId, name },
    update: {},
  });
  res.status(201).json(hidden);
}));

// DELETE /api/staples/hide-suggestion — ångra: visa förslaget igen för hushållet.
staplesRouter.delete('/hide-suggestion', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = z.object({
    householdId: z.string(),
    name: z.string().min(1).max(200),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const name = body.data.name.toLowerCase();
  await prisma.hiddenSuggestion.deleteMany({ where: { householdId: body.data.householdId, name } });
  res.status(204).send();
}));

// DELETE /api/staples/:stapleId
staplesRouter.delete('/:stapleId', requireAuth, asyncHandler(async (req, res) => {
  const staple = await prisma.stapleItem.findUnique({ where: { id: req.params.stapleId } });
  if (!staple) { res.status(404).json({ error: 'Not found' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: staple.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member' }); return; }

  await prisma.stapleItem.delete({ where: { id: staple.id } });
  res.status(204).send();
}));
