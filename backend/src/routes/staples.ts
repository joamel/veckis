import { Router } from 'express';
import { z } from 'zod';
import { StoreCategory, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { categorizeIngredient, categorizeWithStored, curatedSubCategory } from '../lib/categorizeIngredient';
import { effectiveStapleCategory } from '../lib/stapleChoice';
import { basvaruskrivning } from '../lib/basvaruval';
import { COMMON_INGREDIENTS } from '../lib/commonIngredients';
import { duglingGlobalt } from '../lib/normalizeIngredients';
import { delaAlternativ } from '../lib/alternativ';
import { stripIngredient } from '../lib/stripIngredient';
import { resolveInventoryNames } from '../lib/inventoryNames';
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

// Tak för hur många globala namn som skickas. Hela listan följer med varje
// gång en inköpslista öppnas och sökindexet byggs om i appen, så den ska inte
// växa fritt — men taket räknas EFTER tröskeln, så bara namn som redan klarat
// den konkurrerar om platserna (annars trängde ensamma namn ut riktiga).
const MAX_GLOBAL_SUGGESTIONS = 2000;

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
  // En gissad kategori visas som den kurerade — appen grupperar sökrutan och
  // kategoriväljaren efter den här, och en gammal gissning ("kakao" → Bröd)
  // lade annars varan i fel kategori där också.
  // Underkategorin likaså: hushållets val, annars den kurerade (adminsidans
  // klassning först) — så kategoriväljaren i appen följer samma regler.
  res.json(staples.map(s => ({ ...s, category: effectiveStapleCategory(s), subCategory: s.subCategory ?? curatedSubCategory(s.name) })));
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
      create: { ...body.data, name: namn, category, subCategory, categoryChosen: skrivning.skapa.categoryChosen } as Prisma.StapleItemUncheckedCreateInput,
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
  // Avbockade varor rörs inte — de är
  // redan i kundvagnen och att flytta dem bara får högen att hoppa.
  // Bara ett VAL får flytta varor som redan ligger i listorna. Anropet som
  // följer med varje tillägg bär ingen kategori, och när den gissades fram
  // flyttade den tillbaka precis de varor användaren nyss flyttat — samma
  // gissning som skrev över basvaran ovan, fast synlig mitt i handlingen.
  const berörda = skrivning.fårFlyttaVaror ? await prisma.shoppingItem.findMany({
    where: {
      name: normalizedName,
      isChecked: false,
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

  // Tröskeln i själva frågan: annars hämtas de 500 mest sedda namnen först och
  // filtreras efteråt, så namn längre ner i listan når aldrig andra hushåll.
  const eligibleRaws = MIN_HOUSEHOLDS_FOR_GLOBAL_SUGGESTION > 1
    ? (await prisma.ingredientAliasHousehold.groupBy({
        by: ['raw'],
        having: { householdId: { _count: { gte: MIN_HOUSEHOLDS_FOR_GLOBAL_SUGGESTION } } },
      })).map(r => r.raw)
    : null;

  const [cleanAliasRows, hidden] = await Promise.all([
    prisma.ingredientAlias.findMany({
      where: eligibleRaws ? { raw: { in: eligibleRaws } } : undefined,
      distinct: ['canonical'],
      select: { raw: true, canonical: true, category: true },
      orderBy: { seenCount: 'desc' },
      take: MAX_GLOBAL_SUGGESTIONS,
    }),
    prisma.hiddenSuggestion.findMany({ where: { householdId }, select: { name: true } }),
  ]);
  const eligibleAliases = cleanAliasRows;
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
  // Namn som klassats på adminsidan är granskade — de föreslås för alla, som
  // den kurerade listan, även om bara ett hushåll använt dem.
  const commonNames = new Set(common.map(c => c.name.toLowerCase()));
  const curated = (await prisma.curatedCategory.findMany({ select: { name: true, category: true, subCategory: true } }))
    .filter(k => !aliasNames.has(k.name) && !commonNames.has(k.name) && !hiddenNames.has(k.name));

  res.json([
    // Aliasets kategori föddes med klassarens gissning på sin tid; den
    // kurerade kedjan (underkategorin före aliaset) avgör vad som visas.
    ...cleanAliases.map(a => ({ name: a.canonical, category: categorizeWithStored(a.canonical, a.category) as string, subCategory: curatedSubCategory(a.canonical) })),
    ...common.map(c => ({ name: c.name, category: c.category as string, subCategory: curatedSubCategory(c.name) })),
    ...curated.map(k => ({ name: k.name, category: k.category as string, subCategory: curatedSubCategory(k.name) })),
  ]);
}));

// POST /api/staples/resolve — kanoniskt namn och kategori för inventeringens
// rader, med hushållets egna val först. Se lib/inventoryNames.ts.
staplesRouter.post('/resolve', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = z.object({
    householdId: z.string(),
    names: z.array(z.string().min(1).max(200)).max(500),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const stripped = [...new Set(body.data.names.map(n => stripIngredient(n)))];
  const aliasRows = await prisma.ingredientAlias.findMany({
    where: { raw: { in: stripped } },
    select: { raw: true, canonical: true, category: true },
  });
  const aliases = new Map(aliasRows.map(a => [a.raw, { canonical: a.canonical, category: a.category }]));
  const lookup = [...new Set([...stripped, ...aliasRows.map(a => a.canonical)])];
  const staples = await prisma.stapleItem.findMany({
    where: { householdId: body.data.householdId, name: { in: lookup } },
    select: { name: true, category: true, categoryChosen: true },
  });
  // Bara hushållets VAL — en gissad kategori får den kurerade kedjan avgöra.
  const own = new Map(staples.filter(s => s.categoryChosen !== false).map(s => [s.name, s.category]));

  res.json(resolveInventoryNames(body.data.names, aliases, own));
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
