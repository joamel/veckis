import type { StoreCategory } from '@prisma/client';
import { parentForSub, SUB_TAXONOMY, tillSvenskEnhet, type SubCategory } from '@veckis/shared';
import { prisma } from '../db';
import { categorizeIngredient, kureratUndantag } from './categorizeIngredient';
import { duglingGlobalt, kanoniseraUtanCache } from './normalizeIngredients';
import { stripIngredient } from './stripIngredient';
import { delaAlternativ } from './alternativ';
import { bevararSkyddadeOrd } from './importMatchning';
import { serEngelsktUt, översättIngrediensnamn } from './translateIngredients';
import { junkReason, renameIngredient } from './nameCleanup';

/**
 * Städjobben på adminsidan — samma jobb som städskripten, men som
 * "förhandsvisa → välj rader → kör". Varje jobb har två halvor:
 *
 *   plan()  — räknar fram förslag utan att ändra något.
 *   apply() — skriver de rader man valt.
 *
 * apply() litar aldrig på det klienten skickar. Jobb med fasta regler räknar
 * om varje vald rad och skriver det reglerna säger; AI-jobben (där en ny plan
 * kan ge ett annat förslag) kontrollerar raden mot samma spärrar som
 * skripten. Varje körning loggas i AuditLog.
 */

export type JobRow = {
  /** Vilken tabell raden gäller — för visning och för apply. */
  table: string;
  /** Nyckeln apply använder: ett id, ett alias-raw eller ett namn. */
  key: string;
  /** Vad raden är, för en människa. */
  label: string;
  from: string;
  to: string;
  /** Varunamnet raden gäller, när den kan klassas på adminsidan. */
  name?: string;
  /** En förklaring till raden, för en människa. */
  note?: string;
};

export type JobPlan = { rows: JobRow[]; note?: string };

type Actor = { clerkUserId: string };

export type CleanupJob = {
  id: string;
  title: string;
  description: string;
  /** Planen frågar en språkmodell — tar tid och kostar en slant. */
  usesAi: boolean;
  plan(): Promise<JobPlan>;
  apply(rows: { key: string; to: string }[], actor: Actor): Promise<string>;
};

async function audit(actor: Actor, job: string, rows: number, summary: string) {
  await prisma.auditLog.create({
    data: {
      householdId: null, actorClerkUserId: actor.clerkUserId, action: 'admin.cleanup_job',
      targetType: 'job', targetId: job, targetName: job, metadata: { rows, summary },
    },
  });
}

// --- Enheter (fix-units) ---------------------------------------------------

const units: CleanupJob = {
  id: 'units',
  title: 'Svenska enheter',
  description: 'Varor i listor och basvaror med en icke-svensk enhet ("teaspoon", "cup") får den svenska ("tsk", "dl"), med mängden omräknad.',
  usesAi: false,
  async plan() {
    const [items, staples] = await Promise.all([
      prisma.shoppingItem.findMany({ where: { unit: { not: null } }, select: { id: true, name: true, quantity: true, unit: true } }),
      prisma.stapleItem.findMany({ where: { unit: { not: null } }, select: { id: true, name: true, defaultQuantity: true, unit: true } }),
    ]);
    const rows: JobRow[] = [];
    for (const v of items) {
      const sv = tillSvenskEnhet(v.quantity, v.unit);
      if (sv.unit !== v.unit) rows.push({ table: 'vara', key: `item:${v.id}`, label: v.name, from: `${v.quantity} ${v.unit}`, to: `${sv.quantity ?? v.quantity} ${sv.unit ?? ''}`.trim() });
    }
    for (const b of staples) {
      const sv = tillSvenskEnhet(b.defaultQuantity, b.unit);
      if (sv.unit !== b.unit) rows.push({ table: 'basvara', key: `staple:${b.id}`, label: b.name, from: `${b.defaultQuantity ?? '—'} ${b.unit}`, to: `${sv.quantity ?? b.defaultQuantity ?? '—'} ${sv.unit ?? ''}`.trim() });
    }
    return { rows };
  },
  async apply(rows, actor) {
    let n = 0;
    for (const { key } of rows) {
      const [kind, id] = key.split(':');
      if (kind === 'item') {
        const v = await prisma.shoppingItem.findUnique({ where: { id }, select: { quantity: true, unit: true } });
        if (!v) continue;
        const sv = tillSvenskEnhet(v.quantity, v.unit);
        if (sv.unit === v.unit) continue;
        await prisma.shoppingItem.update({ where: { id }, data: { unit: sv.unit, quantity: sv.quantity ?? v.quantity } });
        n++;
      } else if (kind === 'staple') {
        const b = await prisma.stapleItem.findUnique({ where: { id }, select: { defaultQuantity: true, unit: true } });
        if (!b) continue;
        const sv = tillSvenskEnhet(b.defaultQuantity, b.unit);
        if (sv.unit === b.unit) continue;
        await prisma.stapleItem.update({ where: { id }, data: { unit: sv.unit, defaultQuantity: sv.quantity ?? b.defaultQuantity } });
        n++;
      }
    }
    const summary = `${n} rader fick svensk enhet.`;
    await audit(actor, 'units', n, summary);
    return summary;
  },
};

// --- Kategorier som fastnat i Övrigt (repair-other-categories) --------------

/** Bästa kända kategori för ett namn, eller null när ingen vet. */
function betterCategory(name: string, subCategory?: string | null): StoreCategory | null {
  const exception = kureratUndantag(name);
  if (exception) return exception;
  if (subCategory && SUB_TAXONOMY[subCategory as SubCategory]) {
    const fromSub = parentForSub(subCategory as SubCategory);
    if (fromSub !== 'other') return fromSub as StoreCategory;
  }
  const fromName = categorizeIngredient(name);
  return fromName === 'other' ? null : fromName;
}

const categories: CleanupJob = {
  id: 'categories',
  title: 'Varor som fastnat i Övrigt',
  description: 'Namn i poolen, basvaror och varor i listor som står under Övrigt fast reglerna numera känner igen dem.',
  usesAi: false,
  async plan() {
    const [alias, staples, items] = await Promise.all([
      prisma.ingredientAlias.findMany({ where: { category: 'other' }, select: { raw: true, canonical: true } }),
      prisma.stapleItem.findMany({ where: { category: 'other' }, select: { name: true } }),
      prisma.shoppingItem.findMany({ where: { category: 'other', customCategory: null }, select: { id: true, name: true, subCategory: true } }),
    ]);
    const rows: JobRow[] = [];
    for (const a of alias) {
      if (!duglingGlobalt(a.canonical)) continue;
      const to = betterCategory(a.canonical);
      if (to) rows.push({ table: 'pool', key: `alias:${a.raw}`, label: a.canonical, from: 'other', to, name: a.canonical });
    }
    // EN rad per basvarunamn — ändringen gäller varje hushåll som har varan i Övrigt.
    const stapleCounts = new Map<string, number>();
    for (const s of staples) if (duglingGlobalt(s.name)) stapleCounts.set(s.name, (stapleCounts.get(s.name) ?? 0) + 1);
    for (const [name, count] of stapleCounts) {
      const to = betterCategory(name);
      if (to) rows.push({ table: 'basvara', key: `staple:${name}`, label: count > 1 ? `${name} (${count} hushåll)` : name, from: 'other', to, name });
    }
    for (const i of items) {
      const to = betterCategory(i.name, i.subCategory);
      if (to) rows.push({ table: 'vara', key: `item:${i.id}`, label: i.name, from: 'other', to, name: i.name });
    }
    return { rows };
  },
  async apply(rows, actor) {
    let n = 0;
    for (const { key } of rows) {
      const i = key.indexOf(':');
      const kind = key.slice(0, i);
      const id = key.slice(i + 1);
      if (kind === 'alias') {
        const a = await prisma.ingredientAlias.findUnique({ where: { raw: id }, select: { canonical: true, category: true } });
        const to = a && a.category === 'other' ? betterCategory(a.canonical) : null;
        if (to) { await prisma.ingredientAlias.update({ where: { raw: id }, data: { category: to } }); n++; }
      } else if (kind === 'staple') {
        const to = betterCategory(id);
        if (to) n += (await prisma.stapleItem.updateMany({ where: { name: id, category: 'other' }, data: { category: to } })).count;
      } else if (kind === 'item') {
        const it = await prisma.shoppingItem.findUnique({ where: { id }, select: { name: true, subCategory: true, category: true } });
        const to = it && it.category === 'other' ? betterCategory(it.name, it.subCategory) : null;
        if (to) { await prisma.shoppingItem.update({ where: { id }, data: { category: to } }); n++; }
      }
    }
    const summary = `${n} rader fick rätt kategori.`;
    await audit(actor, 'categories', n, summary);
    return summary;
  },
};

// --- Trasiga namn i poolen (clean-ingredient-aliases) -----------------------

const DELETE = 'RADERAS';

/** Vad ett trasigt namn i poolen ska bli: lagat, uppdelat i sina led, eller raderat. */
function repairAlias(canonical: string): string {
  const fixed = stripIngredient(canonical);
  if (duglingGlobalt(fixed)) return fixed;
  // "penne/fusilli": strängen är ingen vara, men leden är det — de lärs in var för sig.
  const parts = [...new Set(delaAlternativ(canonical).map(d => stripIngredient(d)))].filter(d => duglingGlobalt(d));
  return parts.length >= 2 ? parts.join(', ') : DELETE;
}

const aliases: CleanupJob = {
  id: 'aliases',
  title: 'Trasiga namn i poolen',
  description: 'Namn i den gemensamma poolen som inte duger som förslag ("kg potatis", "penne/fusilli"): lagas, delas i sina led eller raderas. Hittar också kortningar som tappat ett avgörande ord ("krossade tomater" → "tomat") och återställer dem. Kör ikapp vilka hushåll som sett varje namn.',
  usesAi: false,
  async plan() {
    const alias = await prisma.ingredientAlias.findMany({ select: { raw: true, canonical: true } });
    const rows: JobRow[] = alias
      .filter(a => !duglingGlobalt(a.canonical))
      .map(a => ({ table: 'pool', key: a.raw, label: a.canonical, from: a.canonical, to: repairAlias(a.canonical) }));
    // Modellen kortade förr utan spärr: "krossade tomater" → "tomat". Då pekar
    // varje burk på den färska tomaten. Tillbaka till det strippade namnet.
    for (const a of alias) {
      if (duglingGlobalt(a.canonical) && !bevararSkyddadeOrd(a.raw, a.canonical)) {
        const lost = a.raw.split(/\s+/).filter(w => !a.canonical.toLowerCase().includes(w.toLowerCase().slice(0, 5)));
        rows.push({
          table: 'pool', key: `skydd:${a.raw}`, label: a.raw, from: a.canonical, to: stripIngredient(a.raw),
          note: `Tolkas idag som "${a.canonical}" — tappade "${lost.join(' ')}", som avgör vilken vara det är.`,
        });
      }
    }
    return { rows };
  },
  async apply(rows, actor) {
    // Hushållsraderna ur recept och listor först (backfillen i skriptet) —
    // den skapar bara rader ur data som redan finns och tar aldrig bort något.
    const seen = new Map<string, Set<string>>();
    const add = (name: string, householdId: string) => {
      const key = name.toLowerCase().trim();
      if (!key) return;
      seen.set(key, (seen.get(key) ?? new Set()).add(householdId));
    };
    for (const r of await prisma.recipeIngredient.findMany({ select: { name: true, recipe: { select: { householdId: true } } } })) add(r.name, r.recipe.householdId);
    for (const i of await prisma.shoppingItem.findMany({ select: { name: true, list: { select: { householdId: true } } } })) add(i.name, i.list.householdId);
    const known = await prisma.ingredientAliasHousehold.findMany({ select: { raw: true, householdId: true } });
    const knownSet = new Set(known.map(k => `${k.raw}\u0000${k.householdId}`));
    const allAlias = await prisma.ingredientAlias.findMany({ select: { raw: true } });
    const backfill = allAlias.flatMap(a => [...(seen.get(a.raw) ?? [])].filter(h => !knownSet.has(`${a.raw}\u0000${h}`)).map(householdId => ({ raw: a.raw, householdId })));
    if (backfill.length) await prisma.ingredientAliasHousehold.createMany({ data: backfill, skipDuplicates: true });

    let fixed = 0, split = 0, deleted = 0;
    for (const { key: rowKey } of rows) {
      if (rowKey.startsWith('skydd:')) {
        const raw = rowKey.slice('skydd:'.length);
        const a = await prisma.ingredientAlias.findUnique({ where: { raw }, select: { canonical: true } });
        if (a && !bevararSkyddadeOrd(raw, a.canonical)) {
          await prisma.ingredientAlias.update({ where: { raw }, data: { canonical: stripIngredient(raw) } });
          fixed++;
        }
        continue;
      }
      const key = rowKey;
      const a = await prisma.ingredientAlias.findUnique({ where: { raw: key }, select: { canonical: true } });
      if (!a || duglingGlobalt(a.canonical)) continue;
      const to = repairAlias(a.canonical);
      if (to === DELETE) {
        await prisma.ingredientAliasHousehold.deleteMany({ where: { raw: key } });
        await prisma.ingredientAlias.delete({ where: { raw: key } });
        deleted++;
      } else if (to.includes(', ')) {
        const households = await prisma.ingredientAliasHousehold.findMany({ where: { raw: key }, select: { householdId: true } });
        for (const part of to.split(', ')) {
          if (!(await prisma.ingredientAlias.findUnique({ where: { raw: part } }))) {
            await prisma.ingredientAlias.create({ data: { raw: part, canonical: part, category: categorizeIngredient(part), seenCount: 1 } });
          }
          if (households.length) await prisma.ingredientAliasHousehold.createMany({ data: households.map(h => ({ raw: part, householdId: h.householdId })), skipDuplicates: true });
        }
        await prisma.ingredientAliasHousehold.deleteMany({ where: { raw: key } });
        await prisma.ingredientAlias.delete({ where: { raw: key } });
        split++;
      } else {
        await prisma.ingredientAlias.update({ where: { raw: key }, data: { canonical: to } });
        fixed++;
      }
    }
    const summary = `${backfill.length} hushållsrader ikapp, ${fixed} namn lagade, ${split} uppdelade, ${deleted} raderade.`;
    await audit(actor, 'aliases', rows.length, summary);
    return summary;
  },
};

// --- Receptens ordalydelse i varunamnen (clean-recipe-names) ----------------

/** Hur många namn modellen får per körning — så förhandsvisningen hinner klart. */
const AI_LIMIT = 120;
const AI_BATCH = 40;

/** Flerordsnamn som kan kortas. Alternativ ("falukorv eller …") rörs aldrig. */
function isShortenCandidate(canonical: string): boolean {
  if (/\s(?:eller|alt\.?|alternativt)\s/i.test(canonical)) return false;
  return canonical.trim().split(/\s+/).length >= 2;
}

/**
 * Sista spärren mot att modellen byter ut ett namn mot ett helt annat: ett
 * kortare namn måste dela en ordstam med originalet ("finrivet citronskal" →
 * "citronskal" ja, "färsk spenat" → "creme fraiche" nej).
 */
export function resemblesOriginal(original: string, suggestion: string): boolean {
  const stems = (s: string) => s.toLowerCase().split(/[^a-zåäöéèü0-9]+/).filter(o => o.length >= 3).map(o => o.slice(0, 4));
  const inOriginal = new Set(stems(original));
  return stems(suggestion).some(s => inOriginal.has(s));
}

/** Ett kortare namn som får skrivas: liknar originalet, tappar inget avgörande ord, är en vara. */
export function acceptableShortening(from: string, to: string): boolean {
  return !!to && to !== from && resemblesOriginal(from, to) && bevararSkyddadeOrd(from, to) && duglingGlobalt(to) && junkReason(to) === null;
}

const recipeNames: CleanupJob = {
  id: 'recipe-names',
  title: 'Receptens ordalydelse i varunamn',
  description: `Varunamn som bär receptets text ("ägg vispade", "kokt, svalt basmatiris") kortas till varan. Strippningen först, sedan en språkmodell för resten — högst ${AI_LIMIT} namn per körning.`,
  usesAi: true,
  async plan() {
    const alias = await prisma.ingredientAlias.findMany({ select: { canonical: true } });
    const candidates = [...new Set(alias.map(a => a.canonical).filter(isShortenCandidate))];
    const proposals = new Map<string, string>();
    const toAi: string[] = [];
    for (const name of candidates) {
      const stripped = stripIngredient(name);
      if (stripped && stripped !== name && acceptableShortening(name, stripped)) proposals.set(name, stripped);
      else toAi.push(name);
    }
    const asked = toAi.slice(0, AI_LIMIT);
    let failed = 0;
    for (let i = 0; i < asked.length; i += AI_BATCH) {
      const part = asked.slice(i, i + AI_BATCH);
      try {
        const out = await kanoniseraUtanCache(part);
        part.forEach((name, j) => {
          const to = (out[j] ?? name).toLowerCase().trim();
          if (acceptableShortening(name, to)) proposals.set(name, to);
        });
      } catch { failed += part.length; }
    }
    const rows = [...proposals].map(([from, to]) => ({ table: 'namn', key: from, label: from, from, to }));
    const notes = [
      toAi.length > AI_LIMIT ? `${toAi.length - AI_LIMIT} namn väntar till nästa körning.` : null,
      failed ? `${failed} namn kunde inte bedömas av modellen den här gången.` : null,
    ].filter(Boolean);
    return { rows, note: notes.join(' ') || undefined };
  },
  async apply(rows, actor) {
    let n = 0;
    for (const { key, to } of rows) {
      const target = to.toLowerCase().trim();
      if (!acceptableShortening(key, target)) continue;
      await renameIngredient(key, target, actor);
      n++;
    }
    const summary = `${n} namn kortade.`;
    await audit(actor, 'recipe-names', n, summary);
    return summary;
  },
};

// --- Engelska ingrediensnamn i sparade recept (clean-recipe-ingredients) ----

const recipeIngredients: CleanupJob = {
  id: 'recipe-ingredients',
  title: 'Engelska ingredienser i recept',
  description: `Recept importerade innan översättningen fungerade har kvar engelska ingrediensnamn. De översätts; originalet sparas så ↔-knappen fungerar. Enheterna rörs inte. Högst ${AI_LIMIT} namn per körning.`,
  usesAi: true,
  async plan() {
    const all = await prisma.recipeIngredient.findMany({ select: { id: true, name: true, recipe: { select: { title: true } } } });
    const english = all.filter(r => serEngelsktUt([r.name]));
    const unique = [...new Set(english.map(r => r.name))];
    const asked = unique.slice(0, AI_LIMIT);
    const map = new Map<string, string>();
    for (let i = 0; i < asked.length; i += AI_BATCH) {
      const part = asked.slice(i, i + AI_BATCH);
      const out = await översättIngrediensnamn(part);
      part.forEach((n, j) => {
        const sv = (out[j] ?? n).trim();
        if (sv && sv.toLowerCase() !== n.toLowerCase()) map.set(n, sv);
      });
    }
    const rows = english.filter(r => map.has(r.name)).map(r => ({ table: 'recept', key: r.id, label: `${r.recipe.title}: ${r.name}`, from: r.name, to: map.get(r.name) as string }));
    return { rows, note: unique.length > AI_LIMIT ? `${unique.length - AI_LIMIT} namn väntar till nästa körning.` : undefined };
  },
  async apply(rows, actor) {
    let n = 0;
    for (const { key, to } of rows) {
      const target = to.trim();
      if (!target || target.length > 80) continue;
      const r = await prisma.recipeIngredient.findUnique({ where: { id: key }, select: { name: true, originalName: true } });
      // Bara rader som fortfarande ser engelska ut — annars är de redan klara.
      if (!r || !serEngelsktUt([r.name])) continue;
      await prisma.recipeIngredient.update({
        where: { id: key },
        // originalName skrivs bara om det saknas: finns det är det källans ord.
        data: { name: target, ...(r.originalName ? {} : { originalName: r.name }) },
      });
      n++;
    }
    const summary = `${n} ingrediensrader översatta.`;
    await audit(actor, 'recipe-ingredients', n, summary);
    return summary;
  },
};

export const CLEANUP_JOBS: CleanupJob[] = [categories, units, aliases, recipeNames, recipeIngredients];

export function findJob(id: string): CleanupJob | undefined {
  return CLEANUP_JOBS.find(j => j.id === id);
}
