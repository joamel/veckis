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
 *   2. LAGNING, UPPDELNING och RENSNING av alias vars kanoniska namn inte
 *      duger globalt: börjar med en siffra ("400g ost", "2 ägg"), är bara en
 *      mängd ("kg"), är tomt, eller är alternativ ("penne/fusilli", "nötfärs
 *      alt. vegofärs"). Samma predikat som skriv- och läs-sidan använder, så
 *      skriptet kan aldrig råka ha en annan uppfattning än appen.
 *
 *      Alternativ RADERAS inte: leden är riktiga varor och lärs in var för
 *      sig, med hushållsraderna från den sammansatta raden. Bara den
 *      sammansatta strängen tas bort.
 *
 * Torrkörning som standard — skriver bara ut vad som skulle hända. --apply för
 * att faktiskt skriva. Kör mot produktion genom att peka DATABASE_URL dit.
 */
import { visaMåldatabas } from './visaDb';
import { PrismaClient } from '@prisma/client';
import { duglingGlobalt } from '../src/lib/normalizeIngredients';
import { stripIngredient } from '../src/lib/stripIngredient';
import { delaAlternativ } from '../src/lib/alternativ';
import { skrivGranskningsfil, läsGranskningsfil, lägeskontroll, type Granskningsrad } from './granskningsfil';
import { categorizeIngredient } from '../src/lib/categorizeIngredient';

// Egen klient med error-only-loggning: den delade i src/db loggar varje query
// i utvecklingsläge och dränker då rapporten som är hela poängen.
const prisma = new PrismaClient({ log: ['error'] });

const argv = process.argv.slice(2);
const args = new Set(argv);
const APPLY = args.has('--apply');
function flaggvärde(namn: string): string | null {
  const i = argv.indexOf(namn);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}
const SKRIV_FIL = flaggvärde('--fil');
const LÄS_FIL = flaggvärde('--från-fil');

// BLIR-kolumnen är bara namn: ETT namn döper om raden, FLERA namn separerade
// med komma delar den i de leden, och RADERAS tar bort den. Första versionen
// skrev "DELAS i bröd + baguette", vilket var svårt att skriva själv — nu
// skriver man bara "bröd, baguette".
const RADERAS = 'RADERAS';

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
  visaMåldatabas();
  lägeskontroll({ skrivFil: SKRIV_FIL, läsFil: LÄS_FIL, apply: APPLY });

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
  const uppdelade: Array<{ raw: string; från: string; delar: string[] }> = [];
  const skräp: typeof trasiga = [];
  for (const a of trasiga) {
    const lagat = stripIngredient(a.canonical);
    if (duglingGlobalt(lagat)) { lagade.push({ raw: a.raw, från: a.canonical, till: lagat }); continue; }
    // "penne/fusilli", "nötfärs alt. vegofärs": strängen är ingen vara, men
    // LEDEN är det. Att bara radera raden kastar bort att någon faktiskt sett
    // dem — de lärs in var för sig i stället, och bara strängen tas bort.
    // Leden strippas som när appen lär in dem (learnIngredientAliases). Utan
    // det blev "hackad lök eller schalottenlök" till ledet "hackad lök", som
    // clean:names sedan föreslog att korta — ett förslag som bara fanns för att
    // det här skriptet skapat det.
    const delar = [...new Set(delaAlternativ(a.canonical).map(d => stripIngredient(d)))].filter(d => duglingGlobalt(d));
    if (delar.length >= 2) uppdelade.push({ raw: a.raw, från: a.canonical, delar });
    else skräp.push(a);
  }

  console.log(`\n2a. LAGNING: ${lagade.length} alias får ett rättat canonical.`);
  for (const l of lagade.slice(0, 40)) console.log(`   ~ ${l.från}  ->  ${l.till}`);
  if (lagade.length > 40) console.log(`   ... och ${lagade.length - 40} till.`);

  console.log(`\n2b. UPPDELNING: ${uppdelade.length} alias med alternativ delas i sina led.`);
  for (const u of uppdelade.slice(0, 40)) console.log(`   ⇢ ${u.från}  ->  ${u.delar.join(' + ')}`);
  if (uppdelade.length > 40) console.log(`   ... och ${uppdelade.length - 40} till.`);

  console.log(`\n2c. RENSNING: ${skräp.length} alias går inte att rädda.`);
  for (const a of skräp.slice(0, 40)) console.log(`   - ${a.raw}  ->  ${a.canonical}`);
  if (skräp.length > 40) console.log(`   ... och ${skräp.length - 40} till.`);

  // Granskningsfil, som de andra städskripten. Backfillen (steg 1) är inte
  // med: den skapar bara hushållsrader ur data som redan finns och tar aldrig
  // bort något, så det finns inget att ta ställning till.
  if (SKRIV_FIL) {
    const rader: Granskningsrad[] = [
      ...lagade.map(l => ({ tabell: 'alias', nyckel: l.raw, namn: l.från, till: l.till })),
      ...uppdelade.map(u => ({ tabell: 'alias', nyckel: u.raw, namn: u.från, till: u.delar.join(', ') })),
      ...skräp.map(a => ({ tabell: 'alias', nyckel: a.raw, namn: a.canonical, till: RADERAS })),
    ];
    if (rader.length === 0) {
      console.log(`\nInget att granska — ingen fil skrevs till ${SKRIV_FIL}.`);
      return;
    }
    skrivGranskningsfil(SKRIV_FIL, rader, [
      '# Ändra ja till nej på de rader du vill lämna som de är.',
      '#',
      '# BLIR är namn, och du kan skriva om den fritt:',
      '#   ett namn            → raden döps om till det',
      '#   flera namn, med komma → raden delas i de varorna ("bröd, baguette")',
      '#   RADERAS             → raden tas bort ur ordförrådet',
      '#',
      '# Stryk ingenting och ändra inget annat på raden (namnet och nyckeln',
      '# sist används för att hitta rätt rad).',
    ]);
    return;
  }

  if (!APPLY) {
    console.log('\nTorrkörning. Inget skrevs.');
    console.log('  --fil <sökväg>   skriver förslagen till en textfil du granskar i Anteckningar');
    console.log('  --apply          genomför allt ovan direkt (utan granskning)');
    return;
  }

  // Granskad fil: dina val ersätter skriptets förslag helt. Skrev du över
  // BLIR-kolumnen med ett eget namn blir det en lagning till det namnet.
  if (LÄS_FIL) {
    const valda = läsGranskningsfil(LÄS_FIL);
    lagade.length = 0;
    uppdelade.length = 0;
    skräp.length = 0;
    for (const rad of valda) {
      const canonical = alias.find(a => a.raw === rad.nyckel)?.canonical ?? rad.namn;
      if (rad.till.trim().toUpperCase() === RADERAS) { skräp.push({ raw: rad.nyckel, canonical }); continue; }
      const delar = rad.till.split(',').map(d => d.trim()).filter(Boolean);
      if (delar.length >= 2) { uppdelade.push({ raw: rad.nyckel, från: canonical, delar }); continue; }
      lagade.push({ raw: rad.nyckel, från: canonical, till: delar[0] ?? rad.till.trim() });
    }
  }

  // Backfillen först: rensningen tar bort hushållsrader för skräpet, och då är
  // det onödigt att ha skapat dem. skipDuplicates gör steget omkörbart.
  if (nyaRader.length > 0) {
    await prisma.ingredientAliasHousehold.createMany({ data: nyaRader, skipDuplicates: true });
  }
  for (const l of lagade) {
    await prisma.ingredientAlias.update({ where: { raw: l.raw }, data: { canonical: l.till } });
  }
  let skapadeLed = 0;
  for (const u of uppdelade) {
    // Hushållen som sett den sammansatta raden har sett bägge leden.
    const hushåll = await prisma.ingredientAliasHousehold.findMany({
      where: { raw: u.raw }, select: { householdId: true },
    });
    for (const del of u.delar) {
      const fanns = await prisma.ingredientAlias.findUnique({ where: { raw: del } });
      if (!fanns) {
        await prisma.ingredientAlias.create({
          data: { raw: del, canonical: del, category: categorizeIngredient(del), seenCount: 1 },
        });
        skapadeLed++;
      }
      if (hushåll.length > 0) {
        await prisma.ingredientAliasHousehold.createMany({
          data: hushåll.map(h => ({ raw: del, householdId: h.householdId })),
          skipDuplicates: true,
        });
      }
    }
    await prisma.ingredientAliasHousehold.deleteMany({ where: { raw: u.raw } });
    await prisma.ingredientAlias.deleteMany({ where: { raw: u.raw } });
  }
  if (skräp.length > 0) {
    const rawn = skräp.map(a => a.raw);
    await prisma.ingredientAliasHousehold.deleteMany({ where: { raw: { in: rawn } } });
    await prisma.ingredientAlias.deleteMany({ where: { raw: { in: rawn } } });
  }
  console.log(`\nKLART: ${nyaRader.length} hushållsrader skapade, ${lagade.length} alias lagade, ${uppdelade.length} uppdelade (${skapadeLed} nya led), ${skräp.length} raderade.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
