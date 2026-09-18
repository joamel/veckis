/**
 * Städskript för den GLOBALA ingredienspoolen (IngredientAlias). Två jobb som
 * hör ihop och körs i ordning:
 *
 *   1. BACKFILL av IngredientAliasHousehold. Tabellen började fyllas först
 *      2026-09-17, så nästan alla äldre alias saknar hushållsrader. Utan det
 *      här steget skulle tröskeln MIN_HOUSEHOLDS_FOR_GLOBAL_SUGGESTION = 2
 *      dölja i stort sett HELA den befintliga poolen — inte bara skräpet.
 *      Rekonstrueras ur de två källor som faktiskt vet vem som sett vad:
 *      receptens ingredienser och inköpslisternas varor.
 *
 *   2. RENSNING av alias vars kanoniska namn inte duger globalt: börjar med en
 *      siffra ("400g ost", "2 ägg"), är bara en mängd ("kg"), eller är tomt.
 *      Samma predikat som skriv- och läs-sidan använder, så skriptet kan aldrig
 *      råka ha en annan uppfattning än appen.
 *
 * Torrkörning som standard — skriver bara ut vad som skulle hända. --apply för
 * att faktiskt skriva. Kör mot produktion genom att peka DATABASE_URL dit.
 */
import { PrismaClient } from '@prisma/client';
import { duglingGlobalt } from '../src/lib/normalizeIngredients';
import { stripIngredient } from '../src/lib/stripIngredient';

// Egen klient med error-only-loggning: den delade i src/db loggar varje query
// i utvecklingsläge och dränker då rapporten som är hela poängen.
const prisma = new PrismaClient({ log: ['error'] });

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');

/** Namn -> hushåll, hämtat ur recept och inköpslistor. Nycklarna matchar
 *  IngredientAlias.raw, som alltid är gemener och trimmat. */
async function seddaAv(): Promise<Map<string, Set<string>>> {
  const karta = new Map<string, Set<string>>();
  const läggTill = (name: string, householdId: string) => {
    const nyckel = name.toLowerCase().trim();
    if (!nyckel) return;
    const set = karta.get(nyckel) ?? new Set<string>();
    set.add(householdId);
    karta.set(nyckel, set);
  };

  const receptRader = await prisma.recipeIngredient.findMany({
    select: { name: true, recipe: { select: { householdId: true } } },
  });
  for (const r of receptRader) läggTill(r.name, r.recipe.householdId);

  const listRader = await prisma.shoppingItem.findMany({
    select: { name: true, list: { select: { householdId: true } } },
  });
  for (const i of listRader) läggTill(i.name, i.list.householdId);

  return karta;
}

async function main() {
  const alias = await prisma.ingredientAlias.findMany({
    select: { raw: true, canonical: true },
  });
  const befintliga = await prisma.ingredientAliasHousehold.findMany({
    select: { raw: true, householdId: true },
  });

  // raw -> hushåll som redan har en rad i tabellen.
  const redanKänt = new Map<string, Set<string>>();
  for (const r of befintliga) {
    const set = redanKänt.get(r.raw) ?? new Set<string>();
    set.add(r.householdId);
    redanKänt.set(r.raw, set);
  }

  console.log(`${alias.length} alias, ${befintliga.length} hushållsrader innan städning.`);

  // -- 1. Backfill -----------------------------------------------------------
  const karta = await seddaAv();
  const nyaRader: Array<{ raw: string; householdId: string }> = [];
  for (const a of alias) {
    const känt = redanKänt.get(a.raw);
    for (const householdId of karta.get(a.raw) ?? []) {
      if (!känt?.has(householdId)) nyaRader.push({ raw: a.raw, householdId });
    }
  }

  // Hur många alias som klarar tröskeln EFTER backfillen. Den siffran avgör om
  // det är säkert att ha MIN_HOUSEHOLDS_FOR_GLOBAL_SUGGESTION på 2.
  let klararTröskeln = 0;
  for (const a of alias) {
    const alla = new Set([...(redanKänt.get(a.raw) ?? []), ...(karta.get(a.raw) ?? [])]);
    if (alla.size >= 2) klararTröskeln++;
  }

  console.log(`\n1. BACKFILL: ${nyaRader.length} nya hushållsrader.`);
  console.log(`   Efter backfill når ${klararTröskeln} av ${alias.length} alias minst 2 hushåll.`);

  // -- 2. Lagning + rensning -------------------------------------------------
  // Ett trasigt canonical går ofta att laga genom att köra det genom den
  // NYA strippningen ("kg potatis" -> "potatis"). Då behålls raden med sin
  // inlärda kategori i stället för att kastas. Bara det som fortfarande inte
  // duger efteråt raderas.
  const trasiga = alias.filter(a => !duglingGlobalt(a.canonical));
  const lagade: Array<{ raw: string; från: string; till: string }> = [];
  const skräp: typeof trasiga = [];
  for (const a of trasiga) {
    const lagat = stripIngredient(a.canonical);
    if (duglingGlobalt(lagat)) lagade.push({ raw: a.raw, från: a.canonical, till: lagat });
    else skräp.push(a);
  }

  console.log(`\n2a. LAGNING: ${lagade.length} alias får ett rättat canonical.`);
  for (const l of lagade.slice(0, 40)) console.log(`   ~ ${l.från}  ->  ${l.till}`);
  if (lagade.length > 40) console.log(`   ... och ${lagade.length - 40} till.`);

  console.log(`\n2b. RENSNING: ${skräp.length} alias går inte att rädda.`);
  for (const a of skräp.slice(0, 40)) console.log(`   - ${a.raw}  ->  ${a.canonical}`);
  if (skräp.length > 40) console.log(`   ... och ${skräp.length - 40} till.`);

  if (!APPLY) {
    console.log('\nTorrkörning. Inget skrevs. Kör om med --apply för att genomföra.');
    return;
  }

  // Backfillen först: rensningen tar bort hushållsrader för skräpet, och då är
  // det onödigt att ha skapat dem. skipDuplicates gör steget omkörbart.
  if (nyaRader.length > 0) {
    await prisma.ingredientAliasHousehold.createMany({ data: nyaRader, skipDuplicates: true });
  }
  for (const l of lagade) {
    await prisma.ingredientAlias.update({ where: { raw: l.raw }, data: { canonical: l.till } });
  }
  if (skräp.length > 0) {
    const rawn = skräp.map(a => a.raw);
    await prisma.ingredientAliasHousehold.deleteMany({ where: { raw: { in: rawn } } });
    await prisma.ingredientAlias.deleteMany({ where: { raw: { in: rawn } } });
  }
  console.log(`\nKLART: ${nyaRader.length} hushållsrader skapade, ${lagade.length} alias lagade, ${skräp.length} raderade.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
