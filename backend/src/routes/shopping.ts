import { Router, Response } from 'express';
import { z } from 'zod';
import { StoreCategory, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { categorizeIngredient, kureratUndantag } from '../lib/categorizeIngredient';

/** Ett lagrat 'other' betyder "ingen vet", inte "kategorin är Övrigt" — den
 *  skillnaden avgör om ett sämre svar får slå ut ett bättre längre ned i
 *  kedjan. null gör att ?? går vidare till nästa källa. */
function känd(category: StoreCategory | null | undefined): StoreCategory | null {
  return category && category !== 'other' ? category : null;
}
import { learnIngredientAliases, getStoredCategory } from '../lib/normalizeIngredients';
import { stripIngredient } from '../lib/stripIngredient';
import { suggestMerge, resolveEquivalences, learnEquivalenceFromMerge, isPackagingUnit, loadConfirmedEquivalencesByName } from '../lib/smartMerge';
import { wsBroadcast } from '../lib/wsHub';
import { inferSubCategory, parentForSub, type SubCategory , tillSvenskEnhet } from '@veckis/shared';
import { sendPush, notifyActiveShopper } from '../lib/sendPush';
import { planFullUnmerge, findRoot } from '../lib/mergeLogic';
import { planAutoMerge } from '../lib/importDedupe';
import Anthropic from '@anthropic-ai/sdk';
import { tolkaInköpslista, tolkaEnRad } from '../lib/inkopstext';
import { matchaImportnamn, type MatchadVara } from '../lib/importMatchning';
import { normalizeIngredientNames } from '../lib/normalizeIngredients';
import { tolkaJsonSvar, InteJsonError, textUr } from '../lib/aiJson';
import { bokförAiKostnad } from '../lib/aiCost';
import { taFotokvot, MAX_FOTON_PER_MANAD } from '../lib/photoQuota';
import { parseTextLimiter } from '../lib/rateLimits';
import { delaUppDataUrl } from './recipes';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export const shoppingRouter = Router();

// Broadcast a per-list item change AND a lightweight household-level signal so
// the shopping overview (which isn't subscribed to per-list sockets) can update
// its counts live instead of only on tab focus.
function bcast(list: { id: string; householdId: string; actor?: string | null }, message: Record<string, unknown>) {
  // Stamp the per-list event with who triggered it so other clients editing the
  // same item can show "{name} ändrade ..." (L35). Falls back to undefined.
  wsBroadcast(list.id, { ...message, actor: list.actor ?? undefined });
  wsBroadcast(`household:${list.householdId}`, { type: 'shopping_list_updated', data: { listId: list.id } });
}

// Walk up the merge chain to find the visible root item
async function findMergeRoot(listId: string, itemId: string): Promise<string> {
  const all = await prisma.shoppingItem.findMany({
    where: { listId },
    select: { id: true, mergedIntoId: true },
  });
  return findRoot(all, itemId);
}

// BFS through a merge tree using pure logic, then apply DB updates.
async function fullyUnmerge(listId: string, rootId: string): Promise<{ leaves: string[]; containers: string[] }> {
  const all = await prisma.shoppingItem.findMany({
    where: { listId },
    select: { id: true, mergedIntoId: true },
  });
  const plan = planFullUnmerge(all, rootId);
  if (plan.restoreLeaves.length > 0) {
    await prisma.shoppingItem.updateMany({
      where: { id: { in: plan.restoreLeaves } },
      data: { mergedIntoId: null },
    });
  }
  if (plan.deleteContainers.length > 0) {
    await prisma.shoppingItem.deleteMany({ where: { id: { in: plan.deleteContainers } } });
  }
  return { leaves: plan.restoreLeaves, containers: plan.deleteContainers };
}

const categoryEnum = z.nativeEnum(StoreCategory);

const createListSchema = z.object({
  householdId: z.string(),
  name: z.string().min(1).max(100),
  emoji: z.string().max(8).nullable().optional(),
  storeId: z.string().optional(),
  isShared: z.boolean().default(true),
});

const addItemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().positive().default(1),
  unit: z.string().optional(),
  category: categoryEnum.default('other'),
  subCategory: z.string().nullable().optional(),
  customCategory: z.string().max(40).nullable().optional(),
  customSubCategory: z.string().max(40).nullable().optional(),
  note: z.string().optional(),
});

const updateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().nullable().optional(),
  category: categoryEnum.optional(),
  subCategory: z.string().nullable().optional(),
  customCategory: z.string().max(40).nullable().optional(),
  customSubCategory: z.string().max(40).nullable().optional(),
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
  return Object.assign(list, { actor: member.displayName });
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
  // Augment each list with all menuItemIds (visible + hidden under a merge container)
  const allItemMenuIds = await prisma.shoppingItem.findMany({
    where: { listId: { in: lists.map(l => l.id) }, menuItemId: { not: null } },
    select: { listId: true, menuItemId: true },
  });
  const linkedByList = new Map<string, string[]>();
  for (const r of allItemMenuIds) {
    if (!r.menuItemId) continue;
    if (!linkedByList.has(r.listId)) linkedByList.set(r.listId, []);
    linkedByList.get(r.listId)!.push(r.menuItemId);
  }
  res.json(lists.map(l => ({ ...l, linkedMenuItemIds: linkedByList.get(l.id) ?? [] })));
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

// PATCH /api/shopping/lists/:listId/shopper — sätt eller rensa "jag handlar"-
// presence på listan. Body: { memberId: string | null }. Broadcastas till
// hushållet så alla enheter ser uppdateringen direkt.
shoppingRouter.patch('/lists/:listId/shopper', requireAuth, asyncHandler(async (req, res) => {
  const list = await getListAndVerifyMember(req.params.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const body = z.object({ memberId: z.string().nullable() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  // Validera att memberId tillhör hushållet (om satt).
  let shopperName: string | null = null;
  if (body.data.memberId) {
    const member = await prisma.householdMember.findUnique({ where: { id: body.data.memberId } });
    if (!member || member.householdId !== list.householdId) {
      res.status(400).json({ error: 'Member not in this household' });
      return;
    }
    shopperName = member.displayName;
  }

  const updated = await prisma.shoppingList.update({
    where: { id: list.id },
    data: {
      activeShopperMemberId: body.data.memberId,
      activeShopperSince: body.data.memberId ? new Date() : null,
    },
  });
  const payload = {
    type: 'shopping_presence',
    data: {
      listId: updated.id,
      memberId: updated.activeShopperMemberId,
      since: updated.activeShopperSince?.toISOString() ?? null,
    },
  };
  // Broadcasta till båda kanalerna: hushållet (för list-översikten) + den
  // specifika listan (för list-detalj-sidan som är ansluten till list-WS).
  wsBroadcast(`household:${updated.householdId}`, payload);
  bcast(updated, payload);
  res.json({
    listId: updated.id,
    memberId: updated.activeShopperMemberId,
    since: updated.activeShopperSince,
  });

  // Push till övriga i hushållet när någon tar "Jag handlar".
  if (shopperName) {
    const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
    const members = await prisma.householdMember.findMany({
      where: { householdId: list.householdId },
      select: { clerkUserId: true },
    });
    const others = members
      .map(m => m.clerkUserId)
      .filter((id): id is string => !!id && id !== clerkUserId);
    if (others.length > 0) {
      void sendPush(others, 'shopperClaimed', {
        title: 'Handlar nu',
        body: `${shopperName} handlar från "${list.name}"`,
        data: { type: 'shopperClaimed', listId: list.id },
      });
    }
  }
}));

// PATCH /api/shopping/lists/:listId
shoppingRouter.patch('/lists/:listId', requireAuth, asyncHandler(async (req, res) => {
  const list = await getListAndVerifyMember(req.params.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const body = z.object({
    name: z.string().min(1).max(100).optional(),
    emoji: z.string().max(8).nullable().optional(),
    storeId: z.string().nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  await prisma.shoppingList.update({ where: { id: list.id }, data: body.data });
  // Hämta tillbaka med SAMMA filter som GET (mergedIntoId: null) så
  // hopslagna sub-items inte dyker upp som "duplicates" i frontend när
  // användaren byter butik/namn.
  const updated = await prisma.shoppingList.findUnique({
    where: { id: list.id },
    include: {
      items: {
        where: { mergedIntoId: null },
        orderBy: [{ isChecked: 'asc' }, { category: 'asc' }, { name: 'asc' }],
        include: { recipe: { select: { id: true, title: true } } },
      },
      store: true,
    },
  });
  res.json(updated);
}));

type ListaFörTillägg = NonNullable<Awaited<ReturnType<typeof prisma.shoppingList.findUnique>>>;

/**
 * Lägger en vara i en lista — kategori ur basvara/klassare, svensk enhet,
 * sammanslagning med en obockad rad med samma namn och enhet, broadcast.
 * Delas av enstaka tillägg och importen, så en importerad vara hamnar
 * exakt där samma vara hade hamnat om man skrivit in den.
 *
 * notifiera: "jag handlar"-pushen per vara. Importen skickar i stället EN
 * sammanfattande notis, annars blev det en push per rad.
 */
async function läggTillVara(
  list: ListaFörTillägg,
  data: z.infer<typeof addItemSchema>,
  clerkUserId: string,
  notifiera = true,
): Promise<{ item: Prisma.ShoppingItemGetPayload<object>; sammanslagen: boolean }> {

  // "1 dl havregryn" och "havregryn 1 dl" skrivet rakt i fältet: mängden ska
  // hamna i sitt fält, inte i namnet. Bara när anroparen INTE angett mängd
  // eller enhet — annars är det ett aktivt val (mängdarket, importen), och
  // en tolkning av namnet skulle skriva över det.
  const tolkad = data.quantity === 1 && !data.unit ? tolkaEnRad(data.name) : null;
  if (tolkad?.quantity) {
    data = { ...data, name: tolkad.name, quantity: tolkad.quantity, unit: tolkad.unit ?? undefined };
  }

  const normalizedName = stripIngredient(data.name);
  const staplePref = await prisma.stapleItem.findUnique({
    where: { householdId_name: { householdId: list.householdId, name: normalizedName } },
    select: { category: true, subCategory: true },
  });
  // Track usage so the most-added staples surface as "dina vanligaste".
  if (staplePref) {
    prisma.stapleItem.update({
      where: { householdId_name: { householdId: list.householdId, name: normalizedName } },
      data: { usageCount: { increment: 1 } },
    }).catch(() => {});
  }
  // SubCategory är källan till sanning i 2-nivå-taxonomin. Auto-infer från
  // namnet om kallaren inte angav. Category härleds från sub:ens defaultParent
  // — kallaren kan override:a via data.category om de redan vet.
  // Hushålls-lokal placering (egen parent/underkategori) → hoppa över auto-
  // inferens av standard-sub OCH den globala inlärningen; det är rena lokala
  // etiketter som inte ska påverka cross-household-datan.
  const isLocalPlacement = !!(data.customCategory || data.customSubCategory);
  // Hushållets egen basvara går före auto-inferensen. inferSubCategory är en
  // gissning på namnet, och en gissning ska aldrig slå ett val någon gjort för
  // hand — det var precis vad som hände: satte man kategori i basvaru-editorn
  // ignorerades den tyst för varje namn som råkade ha en underkategori
  // ("aubergine", "bröd"), medan namn utan ("avokado", "bacon") respekterades.
  // Utifrån såg det ut som att ändringen slog igenom ibland och ibland inte.
  const inferredSub = isLocalPlacement
    ? (data.subCategory ?? null)
    : (data.subCategory ?? staplePref?.subCategory ?? inferSubCategory(normalizedName));
  const subCategory = inferredSub ?? null;
  const category = data.category !== 'other'
    ? data.category
    // Basvaran FÖRE underkategorin, av samma skäl som ovan: har hushållet sagt
    // "bacon hör till chark" ska en inferens om namnet inte flytta tillbaka den.
    // Ordningen: hushållets eget val, sedan underkategorin, sedan det globala
    // aliaset, sist nyckelordsklassaren.
    //
    // 'other' räknas INTE som ett svar någonstans i kedjan — annars vann ett
    // tomt "vet inte" över ett korrekt svar längre ned, och varan hamnade under
    // Övrigt trots att klassaren kände igen namnet.
    : känd(staplePref?.category)
      // Kurerade undantag före underkategorin: underkategorin är gissad ur
      // namnet, undantaget är skrivet för hand av någon som sett varan hamna
      // fel ("lingon köps frysta" väger tyngre än "lingon är ett bär").
      // Samma ordning som städskriptet, annars säger de emot varandra.
      ?? kureratUndantag(normalizedName)
      ?? (subCategory ? känd(parentForSub(subCategory as SubCategory)) : null)
      ?? känd(await getStoredCategory(normalizedName))
      ?? categorizeIngredient(normalizedName);

  // Sista spärren mot icke-svenska enheter i en inköpslista. Vägen hit kan
  // vara ett sökförslag vars basvara ärvt "teaspoon" från ett engelskt recept,
  // eller en klient som skickar något oväntat. Receptet behåller källans ord —
  // listan ska gå att läsa i butiken.
  const svensk = tillSvenskEnhet(data.quantity, data.unit);

  // Dubblettsökningen använder den KONVERTERADE enheten. Annars matchade "tsk"
  // inte en befintlig rad med "teaspoon", och samma vara blev två rader som
  // dessutom såg identiska ut för användaren.
  const existing = await prisma.shoppingItem.findFirst({
    where: {
      listId: list.id,
      name: { equals: normalizedName, mode: 'insensitive' },
      unit: svensk.unit,
      isChecked: false,
      mergedIntoId: null,
    },
  });

  if (existing) {
    const item = await prisma.shoppingItem.update({
      where: { id: existing.id },
      // Den konverterade mängden, så "0,75 teaspoon" läggs till som 0,75 tsk
      // och inte som 0,75 av något annat.
      data: { quantity: existing.quantity + (svensk.quantity ?? 1) },
    });
    if (!isLocalPlacement) learnIngredientAliases([{ name: normalizedName, category }], list.householdId).catch(() => {});
    if (notifiera) notifyActiveShopper(list, clerkUserId, item.name).catch(() => {});
    bcast(list, { type: 'item_updated', data: item });
    return { item, sammanslagen: true };
  }

  const item = await prisma.shoppingItem.create({
    data: {
      listId: list.id,
      ...data,
      quantity: svensk.quantity ?? data.quantity,
      unit: svensk.unit,
      name: normalizedName,
      category,
      subCategory,
      addedBy: clerkUserId,
    },
  });

  if (!isLocalPlacement) learnIngredientAliases([{ name: normalizedName, category }], list.householdId).catch(() => {});
  if (notifiera) notifyActiveShopper(list, clerkUserId, item.name).catch(() => {});
  bcast(list, { type: 'item_added', data: item });
  return { item, sammanslagen: false };
}

// POST /api/shopping/lists/:listId/items
shoppingRouter.post('/lists/:listId/items', requireAuth, asyncHandler(async (req, res) => {
  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  const list = await getListAndVerifyMember(req.params.listId, clerkUserId, res);
  if (!list) return;

  const body = addItemSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const { item, sammanslagen } = await läggTillVara(list, body.data, clerkUserId);
  res.status(sammanslagen ? 200 : 201).json(item);
}));

/**
 * Tolkade rader → namn hushållet känner igen. Se importMatchning.ts: egna
 * basvaror först (stavfel), AI-kanonisering sedan (varumärken, omskrivningar).
 * Utan det blev varje importerad lista en hög nya varor vid sidan av dem
 * hushållet redan hade: "Mozarella", "Arla standardmjölk", "kanel, malen".
 */
async function matchaMotHushallet(householdId: string, varor: { name: string; quantity: number | null; unit: string | null }[]): Promise<MatchadVara[]> {
  const basvaror = await prisma.stapleItem.findMany({
    where: { householdId },
    select: { name: true },
  });
  return matchaImportnamn(varor, basvaror.map(b => b.name), normalizeIngredientNames);
}

// POST /api/shopping/parse-text
// Inklistrad lista → varor att granska. Radtolkningen är regelbaserad
// (inkopstext.ts); AI används bara för att känna igen namn.
shoppingRouter.post('/parse-text', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ text: z.string().min(1).max(100000), householdId: z.string() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'Ingen text' }); return; }
  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: body.data.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }
  const { varor, kapad } = tolkaInköpslista(body.data.text);
  res.json({ items: await matchaMotHushallet(body.data.householdId, varor), kapad });
}));

const INGA_VAROR_I_BILD = 'Hittade inga varor i bilden. Prova en skarpare bild där hela listan syns.';
const FOTOKVOT_SLUT = `Du har tolkat ${MAX_FOTON_PER_MANAD} foton den här månaden, vilket är taket. Klistra in listan som text så länge, eller vänta till nästa månad.`;

// POST /api/shopping/parse-photo
// Foto av en lista (ofta handskriven) → varor att granska. Samma modell och
// samma månadskvot som receptfotona — handstil är det svåra, och det är den
// modellen som klarar receptlappar.
shoppingRouter.post('/parse-photo', parseTextLimiter, requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ imageBase64: z.string().min(1), householdId: z.string() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: 'Ingen bild' }); return; }
  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: body.data.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }
  if (!anthropic) { res.status(503).json({ error: 'AI-tolkning inte tillgänglig' }); return; }

  const kvot = await taFotokvot((req as AuthenticatedRequest).clerkUserId);
  if (!kvot.tillåtet) { res.status(429).json({ error: FOTOKVOT_SLUT }); return; }

  const bild = delaUppDataUrl(body.data.imageBase64);
  let tolkat: { rader?: unknown };
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      // Modellen SKRIVER AV raderna och markerar bara överstrykning och
      // rubriker — tolkningen av mängd och enhet gör samma kod som för
      // inklistrad text. Första versionen bad modellen ge färdiga varor och
      // hoppa över det den inte kunde läsa; den tappade då läsbara rader
      // ("bröd", "smör") helt, fast den skrev av dem rätt när den bara fick
      // skriva av.
      system: `Du skriver av inköpslistor från foton — oftast handskrivna lappar, ibland skärmbilder eller tryckta listor, på svenska.
Returnera ENBART giltig JSON utan förklaringar eller markdown-kodblock:
{ "rader": [{ "text": "mjölk 2 l", "overstruken": false, "rubrik": false }] }

Regler:
- Skriv av VARJE rad på listan, i ordning, exakt som den står — med mängder och enheter.
- Hoppa aldrig över en rad. Är den svårläst: skriv din bästa läsning.
- overstruken: true om raden är överstruken eller avbockad, annars false.
- rubrik: true för sådant som inte är en vara — rubriker ("Handla", "Mejeri:"), datum, butiksnamn. Annars false.
- Ser du ingen lista: { "rader": [] }.`,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: bild.mediaType, data: bild.base64 } },
          { type: 'text', text: 'Skriv av inköpslistan på bilden.' },
        ],
      }],
    });
    await bokförAiKostnad('claude-sonnet-5', msg.usage);
    tolkat = tolkaJsonSvar(textUr(msg)) as typeof tolkat;
  } catch (err) {
    if (err instanceof InteJsonError) { res.status(422).json({ error: INGA_VAROR_I_BILD }); return; }
    const errMsg = err instanceof Error ? err.message : 'AI-anropet misslyckades';
    console.error('Shopping photo parsing error:', errMsg);
    res.status(422).json({ error: errMsg });
    return;
  }

  // Allt från modellen är osäkert tills det validerats — fel typ ger ett tomt
  // värde, inte ett kraschat svar. Kvar blir raderna som är varor; de tolkas
  // som en inklistrad lista.
  const text = (Array.isArray(tolkat.rader) ? tolkat.rader : [])
    .map(r => r as { text?: unknown; overstruken?: unknown; rubrik?: unknown })
    .filter(r => typeof r?.text === 'string' && r.overstruken !== true && r.rubrik !== true)
    .map(r => (r.text as string).trim())
    .join('\n');
  const { varor, kapad } = tolkaInköpslista(text);
  if (varor.length === 0) { res.status(422).json({ error: INGA_VAROR_I_BILD }); return; }
  res.json({ items: await matchaMotHushallet(body.data.householdId, varor), kapad });
}));

// POST /api/shopping/lists/:listId/items/bulk
// Importen: flera varor på en gång, i ordning (inte parallellt — två rader
// med samma namn ska slås ihop, och parallellt hade de tävlat om samma rad).
shoppingRouter.post('/lists/:listId/items/bulk', requireAuth, asyncHandler(async (req, res) => {
  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  const list = await getListAndVerifyMember(req.params.listId, clerkUserId, res);
  if (!list) return;

  const body = z.object({ items: z.array(addItemSchema).min(1).max(100) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const items = [];
  for (const vara of body.data.items) {
    const { item } = await läggTillVara(list, vara, clerkUserId, false);
    items.push(item);
  }
  notifyActiveShopper(list, clerkUserId, `${items.length} varor`).catch(() => {});
  res.status(201).json({ items });
}));

// DELETE /api/shopping/lists/:listId/items  (clear all items, keep the list)
shoppingRouter.delete('/lists/:listId/items', requireAuth, asyncHandler(async (req, res) => {
  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  const list = await getListAndVerifyMember(req.params.listId, clerkUserId, res);
  if (!list) return;
  await prisma.shoppingItem.deleteMany({ where: { listId: list.id } });
  // Rensa "jag handlar"-presence när listan töms (annars hänger den kvar
  // visuellt fast inget finns att handla).
  if (list.activeShopperMemberId) {
    await prisma.shoppingList.update({
      where: { id: list.id },
      data: { activeShopperMemberId: null, activeShopperSince: null },
    });
    const clearPayload = {
      type: 'shopping_presence',
      data: { listId: list.id, memberId: null, since: null },
    };
    wsBroadcast(`household:${list.householdId}`, clearPayload);
    bcast(list, clearPayload);
  }
  bcast(list, { type: 'list_cleared' });
  res.status(204).send();

  // Notify the rest of the household that the active list was cleared.
  const members = await prisma.householdMember.findMany({
    where: { householdId: list.householdId },
    select: { clerkUserId: true },
  });
  const others = members
    .map(m => m.clerkUserId)
    .filter((id): id is string => !!id && id !== clerkUserId);
  if (others.length > 0) {
    void sendPush(others, 'listCleared', {
      title: 'Inköpslista rensad',
      body: `"${list.name}" har rensats`,
      data: { type: 'listCleared', listId: list.id },
    });
  }
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
    // Kategorin skrivs AVSIKTLIGT inte till den globala IngredientAlias längre.
    //
    // Den skrivningen var last-write-wins: ett hushålls tryck ändrade kategorin
    // för alla andra, omedelbart. Alternativet var en konsensusregel med röster
    // och tröskel — maskineri för när man inte kan kurera. Men den kurerade
    // sanningen finns redan i categorizeIngredient + SUB_TAXONOMY, och två
    // hushåll som tycker lika är inte statistik utan två datapunkter ur en
    // mycket korrelerad population. Man behöver inte rösta om att bacon är chark.
    //
    // Kategori = kurerad. Namn = inlärt (learnIngredientAliases lever kvar, den
    // datan är genuint användbar). Hushållets val = lokalt, och vinner alltid.

    // Spegla valet i hushållets basvara. Utan det sa de två vägarna emot
    // varandra: redigerade man varan i listan skrevs varan och det globala
    // aliaset, men inte basvaran — som sedan vann vid nästa tillägg och
    // flyttade tillbaka varan. Ren lokal placering (egen kategori) speglas
    // inte, den hör till just den varan.
    if (!item.customCategory && !item.customSubCategory) {
      // upsert, inte updateMany: finns ingen basvara med namnet uppdaterade
      // updateMany noll rader utan att säga något, och valet var borta vid
      // nästa tillägg. Varan kunde ha kommit från ett recept eller ett
      // sökförslag och aldrig ha blivit en basvara.
      prisma.stapleItem.upsert({
        where: { householdId_name: { householdId: list.householdId, name: item.name } },
        create: {
          householdId: list.householdId,
          name: item.name,
          category: data.category as StoreCategory,
          subCategory: item.subCategory,
        },
        update: { category: data.category as StoreCategory, subCategory: item.subCategory },
      }).catch(() => {});
    }
  }

  bcast(list, { type: 'item_updated', data: item });
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
  bcast(list, { type: 'item_updated', data: item });
  res.json(item);
}));

// POST /api/shopping/merge-suggestion — smart förslag för dubblettdialogen.
// Kombinerar förpacknings-ekvivalenser (UnitEquivalence: seed/AI/user-lärda)
// med volym-/masskonvertering: "1 paket + 390 g krossade tomater" → 2 paket.
// Ingen AI-nyckel/timeout/okänd vara → { suggestion: null } (klienten
// behåller sin naiva prefill).
shoppingRouter.post('/merge-suggestion', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ itemIds: z.array(z.string()).min(2) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const items = await prisma.shoppingItem.findMany({ where: { id: { in: body.data.itemIds } } });
  if (items.length !== body.data.itemIds.length) {
    res.status(404).json({ error: 'Some items not found' });
    return;
  }
  const listId = items[0].listId;
  if (items.some(i => i.listId !== listId)) {
    res.status(400).json({ error: 'All items must belong to the same list' });
    return;
  }
  const list = await getListAndVerifyMember(listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  // Kanoniska namnvarianter: strippat + ev. inlärt alias (cache-only — ingen
  // extra AI-hopp för namnet här).
  const stripped = stripIngredient(items[0].name);
  const alias = await prisma.ingredientAlias.findUnique({ where: { raw: stripped } });
  const names = [...new Set([stripped, alias?.canonical].filter((n): n is string => !!n))];

  const packagingUnits = [...new Set(
    items.map(i => (i.unit ?? '').toLowerCase().trim()).filter(u => isPackagingUnit(u))
  )];

  const equivalences = await resolveEquivalences(names, packagingUnits, 4000);
  const suggestion = suggestMerge(items.map(i => ({ quantity: i.quantity, unit: i.unit })), equivalences);
  res.json({ suggestion });
}));

// POST /api/shopping/items/merge — create a new synthetic merge container,
// hide all source items under it. On delete/unmerge the container disappears
// and the originals re-emerge intact.
shoppingRouter.post('/items/merge', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    sourceIds: z.array(z.string()).min(2),
    name: z.string().min(1),
    quantity: z.number().positive(),
    unit: z.string().nullable().optional(),
    category: categoryEnum,
  }).safeParse(req.body);
  if (!body.success) {
    console.error('merge body parse failed:', JSON.stringify(req.body), body.error.flatten());
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  const sources = await prisma.shoppingItem.findMany({
    where: { id: { in: body.data.sourceIds } },
  });
  if (sources.length !== body.data.sourceIds.length) {
    res.status(404).json({ error: 'Some source items not found' });
    return;
  }
  const listId = sources[0].listId;
  if (sources.some(s => s.listId !== listId)) {
    res.status(400).json({ error: 'All items must belong to the same list' });
    return;
  }

  const list = await getListAndVerifyMember(listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;

  const container = await prisma.$transaction(async (tx) => {
    const created = await tx.shoppingItem.create({
      data: {
        listId,
        name: body.data.name,
        quantity: body.data.quantity,
        unit: body.data.unit ?? null,
        category: body.data.category,
        addedBy: clerkUserId,
      },
      include: { recipe: { select: { id: true, title: true } } },
    });
    await tx.shoppingItem.updateMany({
      where: { id: { in: body.data.sourceIds }, listId },
      data: { mergedIntoId: created.id },
    });
    return created;
  });

  // Inlärning: promota/demota förpacknings-ekvivalenser utifrån vad användaren
  // faktiskt valde (fire-and-forget — får aldrig blockera eller fälla merge:n).
  {
    const strippedName = stripIngredient(sources[0].name);
    prisma.ingredientAlias.findUnique({ where: { raw: strippedName } })
      .then(alias => learnEquivalenceFromMerge(
        sources.map(s => ({ name: s.name, quantity: s.quantity, unit: s.unit })),
        { name: body.data.name, quantity: body.data.quantity, unit: body.data.unit },
        [...new Set([strippedName, alias?.canonical].filter((n): n is string => !!n))],
      ))
      .catch(() => {});
  }

  bcast(list, { type: 'item_added', data: container });
  for (const id of body.data.sourceIds) {
    bcast(list, { type: 'item_deleted', data: { id } });
  }
  res.json(container);
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
    rootsToUnmerge.add(await findMergeRoot(list.id, m.id));
  }
  const restoredIds: string[] = [];
  const removedContainerIds: string[] = [];
  for (const rootId of rootsToUnmerge) {
    const { leaves, containers } = await fullyUnmerge(list.id, rootId);
    restoredIds.push(...leaves);
    removedContainerIds.push(...containers);
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
    bcast(list, { type: 'item_deleted', data: { id } });
  }
  // Containers that got unmerged are also gone — tell clients
  for (const id of removedContainerIds) {
    bcast(list, { type: 'item_deleted', data: { id } });
  }

  // Broadcast survivors as added (formerly hidden items now visible)
  const deletedIds = new Set([...deleted.map(d => d.id), ...removedContainerIds]);
  const survivors = await prisma.shoppingItem.findMany({
    where: { id: { in: restoredIds.filter(id => !deletedIds.has(id)) } },
    include: { recipe: { select: { id: true, title: true } } },
  });
  for (const s of survivors) {
    bcast(list, { type: 'item_added', data: s });
  }

  // After unmerging, restored survivors may once again share name+unit with other
  // visible items. Re-run auto-merge so 3-egg → remove-1 → 2-egg merges cleanly.
  const visible = await prisma.shoppingItem.findMany({
    where: { listId: list.id, isChecked: false, mergedIntoId: null },
  });
  // Fas 2: bekräftad förpackningskunskap låter auto-merge slå ihop över
  // enhetsfamiljer (1 paket + 390 g → 2 paket). Aldrig rå-AI här.
  const confirmedEq = await loadConfirmedEquivalencesByName(visible.map(v => stripIngredient(v.name)));
  const groups = planAutoMerge(
    visible.map(v => ({
      id: v.id, name: v.name, unit: v.unit, quantity: v.quantity,
      menuItemId: v.menuItemId, mergedIntoId: v.mergedIntoId,
      isChecked: v.isChecked, category: v.category as string,
    })),
    (s) => stripIngredient(s),
    confirmedEq,
  );
  for (const group of groups) {
    const container = await prisma.shoppingItem.create({
      data: {
        listId: list.id,
        name: group.name,
        quantity: group.totalQty,
        unit: group.unit,
        category: group.category as never,
        addedBy: (req as AuthenticatedRequest).clerkUserId,
      },
    });
    await prisma.shoppingItem.updateMany({
      where: { id: { in: group.ids } },
      data: { mergedIntoId: container.id },
    });
    bcast(list, { type: 'item_added', data: container });
    for (const id of group.ids) {
      bcast(list, { type: 'item_deleted', data: { id } });
    }
    // Tell clients to show "Slog ihop N {namn}" so the merge isn't silent.
    bcast(list, { type: 'items_auto_merged', data: { name: group.name, count: group.ids.length } });
  }

  res.status(204).send();
}));

// DELETE /api/shopping/items/:itemId
shoppingRouter.delete('/items/:itemId', requireAuth, asyncHandler(async (req, res) => {
  const existing = await prisma.shoppingItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  const list = await getListAndVerifyMember(existing.listId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!list) return;

  // If this is a merge container (has children), delete the whole group — don't restore leaves.
  // Restoring would be confusing: the user deleted a merged item and expects everything gone.
  const hasChildren = await prisma.shoppingItem.findFirst({ where: { mergedIntoId: existing.id }, select: { id: true } });
  if (hasChildren) {
    const all = await prisma.shoppingItem.findMany({ where: { listId: existing.listId }, select: { id: true, mergedIntoId: true } });
    const groupIds: string[] = [existing.id];
    let frontier = [existing.id];
    while (frontier.length > 0) {
      const children = all.filter(x => x.mergedIntoId && frontier.includes(x.mergedIntoId)).map(x => x.id);
      groupIds.push(...children);
      frontier = children;
    }
    await prisma.shoppingItem.deleteMany({ where: { id: { in: groupIds } } });
    bcast(list, { type: 'item_deleted', data: { id: existing.id } });
    res.status(204).send();
    return;
  }

  await prisma.shoppingItem.delete({ where: { id: existing.id } });
  bcast(list, { type: 'item_deleted', data: { id: existing.id } });
  res.status(204).send();
}));
