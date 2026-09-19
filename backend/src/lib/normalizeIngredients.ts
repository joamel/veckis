import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db';
import { stripIngredient, ärMängdOrd, startsWithUnit } from './stripIngredient';
import { categorizeIngredient } from './categorizeIngredient';
import type { StoreCategory } from '@prisma/client';
import { textUr } from './aiJson';
import { bokförAiKostnad } from './aiCost';

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
    await bokförAiKostnad('claude-haiku-4-5-20251001', msg.usage);
    const text = textUr(msg);
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

/**
 * Får namnet delas med ANDRA hushåll? Hårdare krav än vad en användare får
 * skriva i sin egen lista: ett kanoniskt varunamn får aldrig börja med en
 * siffra, och får inte bestå av enbart en mängdangivelse.
 *
 * Siffer-regeln är avsiktligt absolut. Den offrar udda men äkta namn ("7up"),
 * som fortfarande fungerar lokalt — de föreslås bara inte vidare till andra.
 * Priset är litet jämfört med att "400g ost" och "2 ägg" sprider sig som
 * ingrediensnamn till alla hushåll, vilket är precis vad som hände.
 */
export function duglingGlobalt(canonical: string): boolean {
  const c = canonical.trim();
  if (c.length === 0) return false;
  if (/^\d/.test(c)) return false;
  return !ärMängdOrd(c) && !startsWithUnit(c);
}

/**
 * 'other' är inte ett svar, det är frånvaron av ett. Kommer kategorin in som
 * 'other' (t.ex. från en receptingrediens, där zod-schemat defaultar dit när
 * appen inte skickar någon kategori alls) frågar vi nyckelordsklassaren i
 * stället för att skriva ned okunskapen i databasen.
 *
 * Det var exakt så "avokado" och "bacon" hamnade under Övrigt globalt: de dök
 * upp i ett importerat recept, aliaset föddes som 'other', och därefter läste
 * varje tillägg det lagrade 'other' i stället för att fråga klassaren — som
 * hela tiden visste att de hör hemma i frukt/grönt respektive kött.
 */
export function känndKategori(category: StoreCategory | undefined, canonical: string): StoreCategory {
  if (category && category !== 'other') return category;
  return categorizeIngredient(canonical);
}

export async function learnIngredientAliases(
  ingredients: Array<{ name: string; category?: StoreCategory }>,
  householdId: string
): Promise<void> {
  if (ingredients.length === 0) return;

  // Fångar BÅDE stökiga varianter ("mjöl, siktat" → "mjöl") OCH redan rena namn
  // som skrivs in direkt ("sojafärs") — annars lärde vi oss aldrig ett helt nytt
  // ingrediensnamn som råkar sakna deskriptorer att strippa, trots att det är
  // precis den typen av tillväxt vi vill fånga upp.
  const pairs = ingredients
    .map(i => {
      const canonical = stripIngredient(i.name);
      return { raw: i.name.toLowerCase().trim(), canonical, category: känndKategori(i.category, canonical) };
    })
    // Andra spärren mot skräp i den globala poolen: strippningen skalar bort
    // ledande mängder, men blir det ändå inget riktigt varunamn kvar ("400g",
    // "2", "kg") ska raden aldrig skrivas. Filtret på läs-sidan i staples.ts
    // fångar bara det som redan hunnit in — här slipper det in alls.
    .filter(p => p.raw.length > 0 && duglingGlobalt(p.canonical));

  if (pairs.length === 0) return;

  await prisma.$transaction([
    ...pairs.map(p =>
      prisma.ingredientAlias.upsert({
        where: { raw: p.raw },
        create: { raw: p.raw, canonical: p.canonical, category: p.category, seenCount: 1 },
        update: { seenCount: { increment: 1 } },
      })
    ),
    // Självläkning för rader som redan föddes som 'other': fyll i en riktig
    // kategori när vi nu vet bättre. Villkoret category: 'other' i where gör
    // det medvetet ENKELRIKTAT — en etablerad kategori skrivs aldrig över
    // här, så det här är inte ännu en väg för ett hushåll att ändra globalt.
    ...pairs
      .filter(p => p.category !== 'other')
      .map(p =>
        prisma.ingredientAlias.updateMany({
          where: { raw: p.raw, category: 'other' },
          data: { category: p.category },
        })
      ),
  ]);

  // Registrera vilka hushåll (distinkt) som sett varje namn — se kommentaren på
  // IngredientAliasHousehold i schemat för varför.
  await prisma.ingredientAliasHousehold.createMany({
    data: [...new Set(pairs.map(p => p.raw))].map(raw => ({ raw, householdId })),
    skipDuplicates: true,
  }).catch(() => {});
}
