import { Router } from 'express';
import { z } from 'zod';
import { StoreCategory, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { categorizeIngredient } from '../lib/categorizeIngredient';
import { basvaruskrivning } from '../lib/basvaruval';
import { COMMON_INGREDIENTS } from '../lib/commonIngredients';
import { duglingGlobalt } from '../lib/normalizeIngredients';
import { delaAlternativ } from '../lib/alternativ';
import { normalizeUnit } from '@veckis/shared';
import { wsListUpdate } from '../lib/wsHub';

export const staplesRouter = Router();

// Ett namn måste ha setts av minst så här många DISTINKTA hushåll (se
// IngredientAliasHousehold i schemat) innan det föreslås för ANDRA hushåll.
//
// Höjd från 1 till 2 inför den öppna testomgången (2026-09-19). Med 1 syntes
// varje enskilt hushålls stavfel och udda varor direkt för alla andra, vilket
// var acceptabelt medan testarna var en handfull kända personer och inte är
// det längre.
const MIN_HOUSEHOLDS_FOR_GLOBAL_SUGGESTION = 2;

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
    // INGEN default här. Skillnaden mellan "anroparen valde inget" och
    // "anroparen valde Övrigt" måste överleva hit — med en default gick den
    // förlorad, och varje tillägg av en vara såg ut som ett aktivt val.
    category: categoryEnum.optional(),
    subCategory: z.string().max(60).nullable().optional(),
    unit: z.string().max(50).nullable().optional(),
    defaultQuantity: z.number().positive().nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const normalizedName = body.data.name.toLowerCase();
  // Enheten lagras i EN skriven form, annars lär hushållet sig "förpackning"
  // för en vara och "förp" för nästa.
  if (body.data.unit !== undefined) body.data.unit = normalizeUnit(body.data.unit);

  // Valde anroparen en kategori, eller skickade den bara med varan?
  //
  // Appen anropar den här rutten vid VARJE tillägg av en vara, utan kategori
  // när användaren inte valt någon. Förut blev det 'other' via zod-defaulten,
  // tolkades som "kör klassaren", och resultatet skrevs in i update — så ett
  // handgjort val skrevs över av en gissning nästa gång varan lades till.
  // subCategory nollställdes samtidigt. Enheten klarade sig bara för att
  // undefined lämnas ifred av Prisma, vilket är varför enheten satt kvar
  // medan kategorin studsade tillbaka.
  // Beslutet ligger i basvaruval.ts med tester — det har gått fel förr.
  const skrivning = basvaruskrivning(body.data, categorizeIngredient(normalizedName));
  const category = skrivning.skapa.category;
  const subCategory = skrivning.skapa.subCategory;

  // "gurka och tomat" är TVÅ basvaror, inte en. Utan det här blev hela
  // strängen en egen basvara i hushållet och dök upp bland sökförslagen —
  // den globala poolen delade redan leden (learnIngredientAliases), så de två
  // sidorna sa olika saker. Samma regel gäller alternativ: "nötfärs alt.
  // vegofärs" lärs som två varor man kan söka på var för sig. Varans namn i
  // LISTAN rörs aldrig — där står texten kvar, valet tillhör den som handlar.
  const delar = delaAlternativ(normalizedName);
  const namnAttSkriva = delar.length > 1 ? delar : [normalizedName];

  const skrivna = [];
  for (const namn of namnAttSkriva) {
    skrivna.push(await prisma.stapleItem.upsert({
      where: { householdId_name: { householdId: body.data.householdId, name: namn } },
      create: { ...body.data, name: namn, category, subCategory } as Prisma.StapleItemUncheckedCreateInput,
      update: {
        ...skrivning.uppdatera,
        unit: body.data.unit,
        defaultQuantity: body.data.defaultQuantity,
      },
    }));
  }
  const staple = skrivna[0];

  // Ändringen ska synas NU, inte först nästa gång varan läggs till. Varor med
  // samma namn i hushållets öppna listor flyttas med, och varje lista får en
  // WS-broadcast så den som står i affären ser raden byta sektion direkt.
  //
  // Varor med egen lokal placering (customCategory/customSubCategory) lämnas
  // ifred: det är ett uttryckligt val på just den varan och ska inte skrivas
  // över av ett val på basvaran. Avbockade varor rörs inte heller — de är
  // redan i kundvagnen och att flytta dem bara får högen att hoppa.
  // Bara ett VAL får flytta varor som redan ligger i listorna. Anropet som
  // följer med varje tillägg bär ingen kategori, och när den gissades fram
  // flyttade den tillbaka precis de varor användaren nyss flyttat — samma
  // gissning som skrev över basvaran ovan, fast synlig mitt i handlingen.
  const berörda = skrivning.fårFlyttaVaror ? await prisma.shoppingItem.findMany({
    where: {
      name: normalizedName,
      isChecked: false,
      customCategory: null,
      customSubCategory: null,
      list: { householdId: body.data.householdId, completedAt: null },
      NOT: { AND: [{ category }, { subCategory }] },
    },
    select: { id: true, listId: true },
  }) : [];

  if (berörda.length > 0) {
    await prisma.shoppingItem.updateMany({
      where: { id: { in: berörda.map(i => i.id) } },
      data: { category, subCategory },
    });
    const uppdaterade = await prisma.shoppingItem.findMany({
      where: { id: { in: berörda.map(i => i.id) } },
    });
    for (const item of uppdaterade) {
      wsListUpdate(item.listId, body.data.householdId, { type: 'item_updated', data: item });
    }
  }

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

  // Filtrera bort trasiga legacy-alias där en mängd fastnat först i namnet
  // ("kg potatis", "400g ost") — de ska aldrig dyka upp som förslag. Nya alias
  // stoppas redan av samma predikat på skriv-sidan; det här skyddar mot rader
  // som redan ligger i DB och mot att de två sidorna glider isär.
  const cleanAliases = eligibleAliases.filter(a => duglingGlobalt(a.canonical) && !hiddenNames.has(a.canonical.toLowerCase()));
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
