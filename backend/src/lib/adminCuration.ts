import type { StoreCategory } from '@prisma/client';
import { parentForSub, type SubCategory } from '@veckis/shared';
import { prisma } from '../db';
import { categorizeIngredient, categorizeWithStored, curatedSubCategory, explainCategory } from './categorizeIngredient';
import { curatedKey } from './curatedOverrides';
import { reloadCuratedOverrides } from './curatedOverridesDb';
import { duglingGlobalt } from './normalizeIngredients';
import { COMMON_INGREDIENTS } from './commonIngredients';

/**
 * Adminsidans klassning: läs hur ett namn klassas idag, se vad en ändring
 * skulle påverka, och tillämpa den. Skrivningen går till CuratedCategory —
 * kurerat, inte inlärt — och loggas i AuditLog med det gamla värdet.
 */

export type ClassifyReport = {
  name: string;
  category: StoreCategory;
  subCategory: string | null;
  /** Vilken regel som gav kategorin (se explainCategory). */
  source: string;
  /** Adminens handskrivna klassning, om en finns. */
  override: { category: StoreCategory; subCategory: string | null; updatedAt: string } | null;
  /** Hushåll med varan som basvara, och vad de som VALT något valde. */
  households: number;
  choices: { category: string; households: number }[];
  /** Obockade varor i öppna listor med det här namnet. */
  openItems: number;
};

export async function classifyReport(rawName: string): Promise<ClassifyReport> {
  const name = curatedKey(rawName);
  const [{ category, source }, override, staples, openItems] = await Promise.all([
    Promise.resolve(explainCategory(name)),
    prisma.curatedCategory.findUnique({ where: { name } }),
    prisma.stapleItem.findMany({ where: { name }, select: { category: true, categoryChosen: true } }),
    prisma.shoppingItem.count({ where: { name, isChecked: false, mergedIntoId: null, list: { completedAt: null } } }),
  ]);
  const tally = new Map<string, number>();
  for (const s of staples) if (s.categoryChosen !== false) tally.set(s.category, (tally.get(s.category) ?? 0) + 1);
  return {
    name,
    category,
    subCategory: curatedSubCategory(name),
    source,
    override: override ? { category: override.category, subCategory: override.subCategory, updatedAt: override.updatedAt.toISOString() } : null,
    households: staples.length,
    choices: [...tally].map(([c, households]) => ({ category: c, households })).sort((a, b) => b.households - a.households),
    openItems,
  };
}

export type CurationInput = { name: string; category: StoreCategory; subCategory: string | null };

export function validateCuration(input: CurationInput): string | null {
  if (!curatedKey(input.name)) return 'Namn saknas';
  if (input.subCategory) {
    let parent: string;
    try { parent = parentForSub(input.subCategory as SubCategory); } catch { return 'Okänd underkategori'; }
    if (!parent) return 'Okänd underkategori';
    if (parent !== input.category) return 'Underkategorin hör inte till kategorin';
  }
  return null;
}

/** Vad en klassning skulle ändra — utan att ändra något. */
export async function curationImpact(input: CurationInput) {
  const name = curatedKey(input.name);
  const [guessedStaples, chosenStaples, items] = await Promise.all([
    prisma.stapleItem.count({ where: { name, categoryChosen: { not: true } } }),
    prisma.stapleItem.findMany({ where: { name, categoryChosen: true }, select: { householdId: true, category: true } }),
    movableItems(name, input),
  ]);
  return {
    name,
    before: { category: categorizeIngredient(name), subCategory: curatedSubCategory(name) },
    after: { category: input.category, subCategory: input.subCategory },
    /** Basvaror med en gissad kategori — får den nya. */
    guessedStaples,
    /** Hushåll som själva valt en kategori — deras val gäller fortfarande. */
    chosenStaples: chosenStaples.length,
    chosenDiffering: chosenStaples.filter(s => s.category !== input.category).length,
    /** Obockade varor i öppna listor som flyttas om man väljer det. */
    itemsToMove: items.length,
  };
}

/**
 * Varor som flyttas: obockade, i öppna listor, med namnet, i ett hushåll som
 * INTE själv valt kategori för varan, och som inte redan ligger rätt.
 */
async function movableItems(name: string, input: CurationInput) {
  const chosen = await prisma.stapleItem.findMany({ where: { name, categoryChosen: true }, select: { householdId: true } });
  const chosenHouseholds = chosen.map(c => c.householdId);
  return prisma.shoppingItem.findMany({
    where: {
      name,
      isChecked: false,
      mergedIntoId: null,
      list: { completedAt: null, householdId: { notIn: chosenHouseholds } },
      NOT: { AND: [{ category: input.category }, { subCategory: input.subCategory }] },
    },
    select: { id: true, listId: true },
  });
}

export async function applyCuration(input: CurationInput, actor: { clerkUserId: string; name?: string | null }, moveItems: boolean) {
  const name = curatedKey(input.name);
  const before = await prisma.curatedCategory.findUnique({ where: { name } });
  const items = moveItems ? await movableItems(name, input) : [];
  await prisma.$transaction([
    prisma.curatedCategory.upsert({
      where: { name },
      create: { name, category: input.category, subCategory: input.subCategory, updatedBy: actor.clerkUserId },
      update: { category: input.category, subCategory: input.subCategory, updatedBy: actor.clerkUserId },
    }),
    // Gissade basvaror får den nya kategorin, så den lagrade och den visade
    // säger samma sak. Hushållens egna val rörs inte.
    prisma.stapleItem.updateMany({ where: { name, categoryChosen: { not: true } }, data: { category: input.category, categoryChosen: false } }),
    ...(items.length ? [prisma.shoppingItem.updateMany({
      where: { id: { in: items.map(i => i.id) } },
      data: { category: input.category, subCategory: input.subCategory },
    })] : []),
    prisma.auditLog.create({
      data: {
        householdId: null,
        actorClerkUserId: actor.clerkUserId,
        actorName: actor.name ?? null,
        action: 'admin.curate_category',
        targetType: 'ingredient',
        targetId: name,
        targetName: name,
        metadata: {
          before: before ? { category: before.category, subCategory: before.subCategory } : null,
          after: { category: input.category, subCategory: input.subCategory },
          itemsMoved: items.length,
        },
      },
    }),
  ]);
  await reloadCuratedOverrides();
  return { name, itemsMoved: items.length, itemIds: items.map(i => i.id) };
}

/** Tar bort en handskriven klassning; klassaren går tillbaka till sina egna regler. Varor flyttas inte. */
export async function removeCuration(rawName: string, actor: { clerkUserId: string; name?: string | null }) {
  const name = curatedKey(rawName);
  const before = await prisma.curatedCategory.findUnique({ where: { name } });
  if (!before) return false;
  await prisma.$transaction([
    prisma.curatedCategory.delete({ where: { name } }),
    prisma.auditLog.create({
      data: {
        householdId: null,
        actorClerkUserId: actor.clerkUserId,
        actorName: actor.name ?? null,
        action: 'admin.curate_category_remove',
        targetType: 'ingredient',
        targetId: name,
        targetName: name,
        metadata: { before: { category: before.category, subCategory: before.subCategory } },
      },
    }),
  ]);
  await reloadCuratedOverrides();
  // Gissade basvaror följer klassaren igen.
  await prisma.stapleItem.updateMany({ where: { name, categoryChosen: { not: true } }, data: { category: categorizeIngredient(name) } });
  return true;
}

/**
 * Riktiga varor som bara ETT hushåll har använt (minst minSeen gånger) och som
 * inte finns i den kurerade listan — kandidater till COMMON_INGREDIENTS, så de
 * syns för alla trots tröskeln på två hushåll. Samma som curate:candidates.
 */
export async function curateCandidates(minSeen = 3) {
  const counts = await prisma.ingredientAliasHousehold.groupBy({ by: ['raw'], _count: { householdId: true } });
  const households = new Map(counts.map(c => [c.raw, c._count.householdId]));
  const alias = await prisma.ingredientAlias.findMany({
    where: { seenCount: { gte: minSeen } },
    orderBy: { seenCount: 'desc' },
    select: { raw: true, canonical: true, category: true, seenCount: true },
  });
  const curated = new Set(COMMON_INGREDIENTS.map(c => c.name));
  const seen = new Set<string>();
  return alias
    .filter(a => {
      const key = a.canonical.toLowerCase();
      if (seen.has(key) || curated.has(key)) return false;
      if ((households.get(a.raw) ?? 0) !== 1) return false;
      if (!duglingGlobalt(a.canonical)) return false;
      seen.add(key);
      return true;
    })
    .map(a => {
      const klassad = categorizeIngredient(a.canonical);
      return { name: a.canonical, seenCount: a.seenCount, category: klassad !== 'other' ? klassad : a.category };
    });
}

/**
 * Varunamn utan underkategori, mest sedda först. Underkategorin är det som
 * avgör placeringen (huvudkategorin följer av den), så det är de här som
 * behöver en regel eller en klassning. Visar vart de faktiskt hamnar idag:
 * under en kategori ur det sparade aliaset, eller i Övrigt.
 */
export async function namesWithoutSubCategory() {
  const alias = await prisma.ingredientAlias.findMany({ select: { canonical: true, category: true, seenCount: true } });
  const byName = new Map<string, { seen: number; stored: string | null }>();
  for (const a of alias) {
    const name = a.canonical.toLowerCase().trim();
    if (!duglingGlobalt(name)) continue;
    const prev = byName.get(name);
    byName.set(name, { seen: (prev?.seen ?? 0) + a.seenCount, stored: prev?.stored && prev.stored !== 'other' ? prev.stored : a.category });
  }
  return [...byName]
    .filter(([name]) => curatedSubCategory(name) === null)
    .map(([name, v]) => ({ name, seenCount: v.seen, category: categorizeWithStored(name, v.stored) }))
    .sort((a, b) => b.seenCount - a.seenCount);
}

/** Hushåll skapade sedan ett datum, och hur mycket de hunnit göra. Samma som new-households. */
export async function newHouseholds(since: Date) {
  const households = await prisma.household.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      _count: { select: { members: true, recipes: true, shoppingLists: true, weekMenuItems: true } },
    },
  });
  const rows = [];
  for (const h of households) {
    const items = await prisma.shoppingItem.count({ where: { list: { householdId: h.id } } });
    rows.push({
      createdAt: h.createdAt.toISOString(),
      members: h._count.members,
      recipes: h._count.recipes,
      lists: h._count.shoppingLists,
      items,
      menuItems: h._count.weekMenuItems,
    });
  }
  return rows;
}
