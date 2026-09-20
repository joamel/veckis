import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db';
import { stripIngredient, ärMängdOrd, startsWithUnit } from './stripIngredient';
import { categorizeIngredient } from './categorizeIngredient';
import { delaAlternativ } from './alternativ';
import type { StoreCategory } from '@prisma/client';
import { textUr, tolkaJsonArray } from './aiJson';
import { bokförAiKostnad } from './aiCost';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const SYSTEM_PROMPT = `Du är ett system som normaliserar svenska matvarunamn till sin enklaste kanoniska form för en inköpslista.
Regler:
- Ta bort tillagningsbeskrivningar som beskriver vad MAN GÖR HEMMA (hackad, riven, skalad, strimlad, kokt, vispad, finhackad, i tärningar)
- Men BEHÅLL ord som ingår i en färdig produkt man köper som den är: krossade tomater, passerade tomater, soltorkade tomater, rårörda lingon, rökt skinka, inlagd gurka, kokt skinka. Skillnaden: "hackad lök" är lök du hackat, "krossade tomater" är en burk med eget namn i hyllan.
- BEHÅLL särskilt "torkad" och "fryst"/"frysta" — de står i en annan del av butiken än färskvaran och är egna varor: torkad dragon ≠ dragon, torkad timjan ≠ timjan, frysta hallon ≠ hallon, fryst spenat ≠ spenat.
- Ta bort portionsdeskriptorer (klyftor, skivor, blad, kvistar etc.)
- Ta bort varumärken (Kikkoman sojasås → sojasås, Felix ketchup → ketchup)
- Förenkla sammansatta ord till basform BARA när delen inte är en egen vara i butiken (vitlöksklyftor → vitlök, laxfilé → lax, kycklingbröst → kyckling)
- Singularis av pluraler BARA när namnet är ETT ord (tomater → tomat, morötter → morot, gurkor → gurka)
- Består namnet av flera ord: rör INTE böjningen. Svenska adjektiv böjs efter huvudordet, och "mjuka skal" blir "mjuk skal", "glutenfria makaroner" blir "glutenfri makaron" — obegriplig svenska. Vissa varor heter dessutom bara plural: makaroner, cornflakes, cashewnötter. Ta bort tillagningsord som vanligt, men lämna resten som det står.
- Mjölktyper → mjölk (standardmjölk → mjölk, lättmjölk → mjölk), men behåll äkta alternativ (kokosmjölk, havremjölk)
- ALTERNATIV lämnas ALLTID orörda: "nötfärs alt. vegofärs", "körsbärstomater eller romanticatomater", "falukorv eller kycklingstekkorv". Välj ALDRIG ett av alternativen och slå ALDRIG ihop dem till ett tredje namn. Valet tillhör den som handlar — en vegetarian som får "nötfärs" har blivit fråntagen sitt alternativ. Ta bort tillagningsord som vanligt, men behåll alternativen och kopplingsordet.
- VIKTIGAST: slå aldrig ihop två saker man köper var för sig. salladslök, purjolök, rödlök och gul lök är FYRA olika varor och ska behållas som de är — samma sak för basmatiris, jasminris och risgrynsgröt, och för sesamolja, olivolja och rapsolja. Hellre för specifikt än fel vara i kassen.
- Returnera ENBART ett JSON-array med kanoniska namn i exakt samma ordning som indata, inga förklaringar.

Exempel:
Input: ["vitlöksklyftor","riven parmesanost","färsk basilika","standardmjölk","körsbärstomater","kycklingfilé"]
Output: ["vitlök","parmesanost","basilika","mjölk","tomat","kyckling"]

Input: ["ägg vispade","kokt, svalt basmatiris","Kikkoman naturligt bryggd sojasås","salladslök finhackad","morötter i tärningar"]
Output: ["ägg","basmatiris","sojasås","salladslök","morot"]

Input: ["krossade tomater","soltorkade tomater, klippta i bitar","lingon rårörda","rimmat sidfläsk, skivat","tomater i klyftor"]
Output: ["krossade tomater","soltorkade tomater","rårörda lingon","rimmat sidfläsk","tomat"]

Input: ["torkad dragon","färsk dragon, hackad","frysta hallon","hallon färska","fryst spenat"]
Output: ["torkad dragon","dragon","frysta hallon","hallon","fryst spenat"]

Input: ["mjuka skal","glutenfria makaroner","tomater","krossade tomater, finhackade","gula lökar"]
Output: ["mjuka skal","glutenfria makaroner","tomat","krossade tomater","gula lökar"]

Input: ["körsbärstomater eller romanticatomater","falukorv eller kycklingstekkorv","nötfärs alt. vegofärs, stekt","finhackad gul lök"]
Output: ["körsbärstomater eller romanticatomater","falukorv eller kycklingstekkorv","nötfärs alt. vegofärs","gul lök"]`;

/**
 * Kanonisera namn UTAN att gå via alias-cachen.
 *
 * Finns för städskriptet: de rader som ska rättas är just de som ligger i
 * cachen, så en vanlig normalizeIngredientNames hade slagit upp skräpet och
 * fått tillbaka sig självt. Använd inte i vanliga flöden — där är cachen hela
 * poängen, både för latens och för kostnad.
 */
export function kanoniseraUtanCache(names: string[]): Promise<string[]> {
  return aiNormalizeNames(names);
}

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
    // tolkaJsonArray, inte JSON.parse: modellen lindar gärna svaret i en
    // ```json-fence, och då kastade parsningen rakt ned i catchen nedan — som
    // returnerade indata. Normaliseringen såg alltså ut att fungera medan den
    // inte gjorde någonting alls, och varje "Kikkoman rostad sesamolja" blev
    // en egen vara i poolen.
    const parsed = tolkaJsonArray(textUr(msg)) as string[];
    if (parsed.length !== strippedNames.length) return strippedNames;
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

/**
 * Skriver en kategori till den globala poolen.
 *
 * ANVÄNDS INTE av något användarflöde, med flit. Kategorin är kurerad
 * (categorizeIngredient + SUB_TAXONOMY), inte inlärd: en användares tryck i sin
 * egen lista ska aldrig ändra vad andra hushåll ser. Funktionen finns kvar för
 * KURERING — ett seed- eller städskript som medvetet sätter ett värde.
 *
 * Kopplar du den till ett användarflöde igen återinför du last-write-wins:
 * ett hushåll, ett tryck, ändrad kategori för alla.
 */
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
  // Ett namn med alternativ ("nötfärs alt. vegofärs") är ingen vara och ska
  // aldrig föreslås i sökningen — varken för hushållet eller globalt. Själva
  // ALTERNATIVEN lärs in var för sig (se delaAlternativ), och raden i
  // inköpslistan behåller hela texten så valet finns kvar för den som handlar.
  // Skyddar också mot rader som redan hunnit in i databasen.
  if (/\s(?:eller|alt\.?|alternativt)\s/i.test(c)) return false;
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
  // Ett namn med alternativ är TVÅ varor, inte en: "nötfärs alt. vegofärs" ska
  // lära in både nötfärs och vegofärs, så bägge kan kategoriseras och föreslås
  // var för sig. Varans namn i inköpslistan rörs inte — där står alternativet
  // kvar, eftersom valet tillhör den som handlar.
  const pairs = ingredients
    .flatMap(i => delaAlternativ(i.name).map(namn => ({ ...i, name: namn })))
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
