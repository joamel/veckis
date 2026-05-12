import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db';
import { stripIngredient } from './stripIngredient';
import type { StoreCategory } from '@prisma/client';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const SYSTEM_PROMPT = `Du är ett system som normaliserar svenska matvarunamn till sin enklaste kanoniska form för en inköpslista.
Regler:
- Ta bort tillagningsbeskrivningar (hackad, riven, fryst, skalad, strimlad etc.)
- Ta bort portionsdeskriptorer (klyftor, skivor, blad, kvistar etc.)
- Förenkla sammansatta ord till basform (vitlöksklyftor → vitlök, laxfilé → lax, kycklingbröst → kyckling)
- Singularis av pluraler (tomater → tomat, morötter → morot, gurkor → gurka)
- Mjölktyper → mjölk (standardmjölk → mjölk, lättmjölk → mjölk), men behåll äkta alternativ (kokosmjölk, havremjölk)
- Behåll specifika ingredienser separata om de är genuint olika (smör ≠ margarin, vitlök ≠ lök)
- Returnera ENBART ett JSON-array med kanoniska namn i exakt samma ordning som indata, inga förklaringar.

Exempel:
Input: ["vitlöksklyftor","riven parmesanost","färsk basilika","standardmjölk","körsbärstomater","kycklingfilé"]
Output: ["vitlök","parmesanost","basilika","mjölk","tomat","kyckling"]`;

async function aiNormalizeNames(strippedNames: string[]): Promise<string[]> {
  if (!anthropic || strippedNames.length === 0) return strippedNames;
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Input: ${JSON.stringify(strippedNames)}\nOutput:`,
      }],
      system: SYSTEM_PROMPT,
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
    const parsed = JSON.parse(text) as string[];
    if (!Array.isArray(parsed) || parsed.length !== strippedNames.length) return strippedNames;
    return parsed.map((n, i) => (typeof n === 'string' && n.length > 0 ? n.toLowerCase().trim() : strippedNames[i]));
  } catch {
    return strippedNames;
  }
}

export async function normalizeIngredientNames(names: string[]): Promise<string[]> {
  if (names.length === 0) return [];

  // Step 1: rule-based stripping gives us the cache key
  const stripped = names.map(n => stripIngredient(n));

  // Step 2: batch cache lookup — key is the stripped name
  const uniqueStripped = [...new Set(stripped)];
  const cachedRows = await prisma.ingredientAlias.findMany({
    where: { raw: { in: uniqueStripped } },
  });
  const cacheMap = new Map(cachedRows.map(r => [r.raw, r.canonical]));

  // Step 3: find which stripped names are not yet in cache
  const uncached = uniqueStripped.filter(s => !cacheMap.has(s));

  // Step 4: AI call for uncached names (single batch request)
  if (uncached.length > 0) {
    const aiResults = await aiNormalizeNames(uncached);

    // Step 5: persist new cache entries (only when AI changed something)
    const newEntries = uncached
      .map((raw, i) => ({ raw, canonical: aiResults[i] }))
      .filter(e => e.raw !== e.canonical && e.canonical.length > 0);

    if (newEntries.length > 0) {
      await prisma.$transaction(
        newEntries.map(e =>
          prisma.ingredientAlias.upsert({
            where: { raw: e.raw },
            create: { raw: e.raw, canonical: e.canonical, seenCount: 1 },
            update: { canonical: e.canonical, seenCount: { increment: 1 } },
          })
        )
      ).catch(() => {});
    }

    // Add to in-memory map for this request
    uncached.forEach((s, i) => cacheMap.set(s, aiResults[i]));
  }

  // Step 6: resolve final canonical names
  return stripped.map(s => cacheMap.get(s) ?? s);
}

export async function getStoredCategory(name: string): Promise<StoreCategory | null> {
  const alias = await prisma.ingredientAlias.findUnique({ where: { raw: name } });
  return (alias?.category as StoreCategory | undefined) ?? null;
}

export async function storeIngredientCategory(name: string, category: StoreCategory): Promise<void> {
  await prisma.ingredientAlias.upsert({
    where: { raw: name },
    create: { raw: name, canonical: name, category, seenCount: 1 },
    update: { category },
  }).catch(() => {});
}

export async function learnIngredientAliases(
  ingredients: Array<{ name: string; category?: StoreCategory }>
): Promise<void> {
  if (ingredients.length === 0) return;

  const pairs = ingredients
    .map(i => ({ raw: i.name.toLowerCase().trim(), canonical: stripIngredient(i.name), category: i.category ?? 'other' as StoreCategory }))
    .filter(p => p.raw !== p.canonical && p.raw.length > 0);

  if (pairs.length === 0) return;

  await prisma.$transaction(
    pairs.map(p =>
      prisma.ingredientAlias.upsert({
        where: { raw: p.raw },
        create: { raw: p.raw, canonical: p.canonical, category: p.category, seenCount: 1 },
        update: { seenCount: { increment: 1 } },
      })
    )
  );
}
