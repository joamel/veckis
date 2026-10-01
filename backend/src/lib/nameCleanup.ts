import { prisma } from '../db';
import { ärSammaVara } from './likhet';
import { duglingGlobalt } from './normalizeIngredients';
import { categorizeIngredient } from './categorizeIngredient';
import { COMMON_INGREDIENTS } from './commonIngredients';
import { stadaMangdprefix } from './mangdprefix';
import { curatedKey } from './curatedOverrides';
import { reloadCuratedOverrides } from './curatedOverridesDb';

/**
 * Varunamnen i den gemensamma poolen (IngredientAlias.canonical) och i
 * hushållens basvaror: hitta skräp, mängder i namnet och stavningsvarianter,
 * och byt namn eller radera. Delas av adminsidan och städskripten
 * (clean-junk-names, clean-duplicates, clean-all-names), så de två aldrig
 * säger olika saker.
 */

/** Ett varunamn på fler än så här många ord är ingen vara. Fem räcker för
 *  "rimmat sidfläsk i tunna skivor"; ett receptstycke har trettio. */
const MAX_WORDS = 6;
/** Och längre än så här är det en mening, oavsett ordräkning. */
const MAX_CHARS = 60;

/**
 * Varför ett namn inte är ett varunamn alls — eller null om det kan vara ett.
 * Skrapning och AI-tolkning har lämnat hela receptstycken, HTML-entiteter och
 * instruktionsmeningar efter sig. Gissar med flit försiktigt.
 */
export function junkReason(name: string): string | null {
  const n = name.trim();
  if (n.length === 0) return 'tomt namn';
  // HTML-entiteter betyder att texten aldrig avkodades vid skrapningen.
  if (/&[a-z]+;|&#\d+;|&amp/i.test(n)) return 'HTML-entitet i namnet';
  if (n.length > MAX_CHARS) return `längre än ${MAX_CHARS} tecken`;
  if (n.split(/\s+/).length > MAX_WORDS) return `fler än ${MAX_WORDS} ord`;
  // Kolon mitt i är nästan alltid en rubrik ur ett recept: "sås: 2 dl grädde".
  if (/:/.test(n)) return 'kolon — ser ut som en receptrubrik';
  // Flera mängdangivelser i samma sträng = en ingredienslista, inte en vara.
  if ((n.match(/\d+\s*(g|kg|dl|ml|l|msk|tsk|krm|st)\b/gi) ?? []).length >= 2) return 'flera mängder i samma namn';
  return null;
}

export type WeightedName = { namn: string; vikt: number };

/** Namn ur den kurerade varulistan — det starkaste beviset på att stavningen
 *  är den rätta. Utan det vann "havregry" över "havregryn", eftersom båda
 *  matchar samma nyckelord och stavfelet råkar vara kortare. */
const CURATED_NAMES = new Set(COMMON_INGREDIENTS.map(i => i.name));

/**
 * Rangordnar vilken variant som ska bli målnamnet. Lägst tal vinner.
 *
 * Bara att ta den mest sedda räckte inte: "g fast potatis" och "fast potatis"
 * hade setts lika ofta, och den med måttenheten kvar vann på en slump. Och
 * mellan "kycklingfilé" och "kycklingfiléer" vill man ha singularen.
 */
function rank(v: WeightedName): [number, number, number, number, number] {
  const n = v.namn.toLowerCase().trim();
  return [
    duglingGlobalt(v.namn) ? 0 : 1,                       // aldrig ett namn som inte duger
    v.namn === n ? 0 : 1,                                 // gemener är konventionen ("Choklad" → "choklad")
    CURATED_NAMES.has(n) ? 0 : 1,                         // står den i varulistan är stavningen rätt
    categorizeIngredient(v.namn) === 'other' ? 1 : 0,     // känt namn före okänt
    -v.vikt,                                              // därefter det mest sedda
  ];
}

export function betterTarget(a: WeightedName, b: WeightedName): number {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
  return a.namn.length - b.namn.length; // sist: det kortare namnet
}

/** Grupperar varor som är samma vara; först i varje grupp är målnamnet.
 *  O(n²) — listan är några hundra rader, och ett enkelt svar som går att läsa
 *  slår ett snabbt som inte gör det. */
export function variantGroups(names: WeightedName[]): WeightedName[][] {
  const rest = [...names].sort(betterTarget);
  const groups: WeightedName[][] = [];
  while (rest.length > 0) {
    const base = rest.shift() as WeightedName;
    const group = [base];
    for (let i = rest.length - 1; i >= 0; i--) {
      if (ärSammaVara(base.namn, rest[i].namn)) group.push(...rest.splice(i, 1));
    }
    if (group.length > 1) {
      // Basen kan ha hamnat först på grund av vikten, men en senare variant
      // kan vara ett bättre mål — sortera om gruppen med samma regler.
      group.sort(betterTarget);
      groups.push(group);
    }
  }
  return groups;
}

/** Alla varunamn, med hur ofta de setts (alias + basvaror som EN lista). */
export async function allNames(): Promise<WeightedName[]> {
  const weights = new Map<string, number>();
  const add = (name: string, weight: number) => {
    const n = name.trim();
    if (n) weights.set(n, (weights.get(n) ?? 0) + weight);
  };
  for (const a of await prisma.ingredientAlias.findMany({ select: { canonical: true, seenCount: true } })) add(a.canonical, a.seenCount);
  for (const s of await prisma.stapleItem.findMany({ select: { name: true, usageCount: true } })) add(s.name, 1 + s.usageCount);
  return [...weights].map(([namn, vikt]) => ({ namn, vikt }));
}

export type NameSuggestion =
  | { name: string; weight: number; action: 'delete'; reason: string }
  | { name: string; weight: number; action: 'rename'; to: string; reason: string };

/** Det skripten föreslår, samlat: skräp att radera, mängder att lyfta ur namnet, varianter att slå ihop. */
export function suggestNameCleanup(names: WeightedName[]): NameSuggestion[] {
  const out: NameSuggestion[] = [];
  const handled = new Set<string>();
  for (const { namn, vikt } of names) {
    const junk = junkReason(namn);
    if (junk) { out.push({ name: namn, weight: vikt, action: 'delete', reason: junk }); handled.add(namn); continue; }
    const prefix = stadaMangdprefix(namn);
    if (prefix.åtgärd === 'radera') { out.push({ name: namn, weight: vikt, action: 'delete', reason: prefix.varför }); handled.add(namn); }
    else if (prefix.åtgärd === 'byt') { out.push({ name: namn, weight: vikt, action: 'rename', to: prefix.till, reason: 'mängd i namnet' }); handled.add(namn); }
  }
  for (const [target, ...variants] of variantGroups(names.filter(n => !handled.has(n.namn)))) {
    for (const v of variants) out.push({ name: v.namn, weight: v.vikt, action: 'rename', to: target.namn, reason: `variant av "${target.namn}"` });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/** Vad ett namnbyte eller en radering rör — utan att ändra något. */
export async function nameImpact(rawName: string) {
  const name = rawName.trim();
  const [aliasRows, staples] = await Promise.all([
    prisma.ingredientAlias.count({ where: { canonical: name } }),
    prisma.stapleItem.findMany({ where: { name }, select: { householdId: true } }),
  ]);
  return { name, aliasRows, staples: staples.length, households: new Set(staples.map(s => s.householdId)).size };
}

type Actor = { clerkUserId: string; name?: string | null };

async function audit(actor: Actor, action: string, target: string, metadata: object) {
  await prisma.auditLog.create({
    data: { householdId: null, actorClerkUserId: actor.clerkUserId, actorName: actor.name ?? null, action, targetType: 'ingredient', targetId: target, targetName: target, metadata },
  });
}

/**
 * Byter namn på en vara överallt i poolen och basvarorna. Aliasets nycklar
 * (raw) står kvar och pekar nu på det nya namnet — så en gammal stavning
 * fortsätter att tolkas rätt. Har ett hushåll redan det nya namnet slås
 * basvarorna ihop i stället för att krocka. En handskriven klassning följer
 * med om det nya namnet inte har en egen. Varor i inköpslistor rörs inte.
 */
export async function renameIngredient(rawFrom: string, rawTo: string, actor: Actor) {
  const from = rawFrom.trim();
  const to = rawTo.trim().toLowerCase();
  if (!from || !to || from === to) return { aliasRows: 0, staples: 0, merged: 0 };
  const aliasRows = (await prisma.ingredientAlias.updateMany({ where: { canonical: from }, data: { canonical: to } })).count;
  let staples = 0;
  let merged = 0;
  for (const s of await prisma.stapleItem.findMany({ where: { name: from } })) {
    const existing = await prisma.stapleItem.findUnique({ where: { householdId_name: { householdId: s.householdId, name: to } } });
    if (existing) {
      await prisma.stapleItem.update({ where: { id: existing.id }, data: { usageCount: existing.usageCount + s.usageCount } });
      await prisma.stapleItem.delete({ where: { id: s.id } });
      merged++;
    } else {
      await prisma.stapleItem.update({ where: { id: s.id }, data: { name: to } });
    }
    staples++;
  }
  const fromKey = curatedKey(from);
  const override = await prisma.curatedCategory.findUnique({ where: { name: fromKey } });
  if (override && !(await prisma.curatedCategory.findUnique({ where: { name: to } }))) {
    await prisma.curatedCategory.create({ data: { name: to, category: override.category, subCategory: override.subCategory, updatedBy: actor.clerkUserId } });
    await prisma.curatedCategory.delete({ where: { name: fromKey } });
    await reloadCuratedOverrides();
  }
  await audit(actor, 'admin.rename_ingredient', from, { from, to, aliasRows, staples, merged });
  return { aliasRows, staples, merged };
}

/**
 * Döljer namn för andra hushåll: de föreslås aldrig globalt, inte heller om de
 * lärs in igen. Hushåll som har namnet som basvara behåller det — basvarorna är
 * hushållets egna. För riktiga varor man inte vill sprida; skräp raderas i stället.
 */
export async function hideIngredients(rawNames: string[], actor: Actor) {
  const names = [...new Set(rawNames.map(n => n.toLowerCase().trim()).filter(Boolean))];
  for (const name of names) {
    await prisma.hiddenGlobalName.upsert({ where: { name }, create: { name, hiddenBy: actor.clerkUserId }, update: {} });
    await audit(actor, 'admin.hide_ingredient', name, { name });
  }
  return names.length;
}

export async function unhideIngredients(rawNames: string[], actor: Actor) {
  const names = [...new Set(rawNames.map(n => n.toLowerCase().trim()).filter(Boolean))];
  const n = (await prisma.hiddenGlobalName.deleteMany({ where: { name: { in: names } } })).count;
  for (const name of names) await audit(actor, 'admin.unhide_ingredient', name, { name });
  return n;
}

/** Tar bort ett namn ur poolen OCH alla hushålls basvaror — för skräp som inte är en vara. Permanent. */
export async function deleteIngredient(rawName: string, actor: Actor) {
  const name = rawName.trim();
  const raws = (await prisma.ingredientAlias.findMany({ where: { canonical: name }, select: { raw: true } })).map(a => a.raw);
  if (raws.length) {
    await prisma.ingredientAliasHousehold.deleteMany({ where: { raw: { in: raws } } });
    await prisma.ingredientAlias.deleteMany({ where: { raw: { in: raws } } });
  }
  const staples = (await prisma.stapleItem.deleteMany({ where: { name } })).count;
  await audit(actor, 'admin.delete_ingredient', name, { name, aliasRows: raws.length, staples });
  return { aliasRows: raws.length, staples };
}
