/**
 * Reparerar varor som fastnat i kategorin "Övrigt" utan att någon valt det.
 *
 * Bakgrund: 'other' behandlades som ett svar i stället för som "vet inte".
 * Receptingredienser föds utan kategori (appen skickar ingen, zod defaultar
 * till 'other'), och det värdet skrevs vidare till StapleItem och till den
 * globala IngredientAlias-poolen. Därefter läste varje nytt tillägg det
 * lagrade 'other' i stället för att fråga nyckelordsklassaren, som hela tiden
 * kände igen namnet. Koden gör inte längre så — det här skriptet städar upp
 * raderna som redan skrevs.
 *
 * Tre tabeller, i tur och ordning:
 *   IngredientAlias  — global kategori per namn
 *   StapleItem       — hushållets egna basvaror
 *   ShoppingItem     — varor som ligger i listor just nu
 *
 * För ShoppingItem vinner en KÄND underkategori över nyckelordsklassaren:
 * subCategory är källan till sanning i 2-nivå-taxonomin, och backfill-jobbet
 * satte subben utan att någonsin räkna om parent-kategorin.
 *
 * Torrkörning som standard. --apply för att skriva.
 *
 * --kurerad räknar dessutom om HELA aliaspoolen från de kurerade reglerna, inte
 * bara raderna som står på 'other'. Använd den efter att kategorin slutade vara
 * inlärd (2026-09-19): värden som skrevs av den gamla last-write-wins-vägen
 * lever annars kvar utan att kunna rättas av någon.
 */
import { visaMåldatabas } from './visaDb';
import { skrivGranskningsfil, läsGranskningsfil, lägeskontroll, type Granskningsrad } from './granskningsfil';
import { PrismaClient, StoreCategory } from '@prisma/client';
import { parentForSub, SUB_TAXONOMY, type SubCategory } from '@veckis/shared';
import { categorizeIngredient, kureratUndantag } from '../src/lib/categorizeIngredient';

const prisma = new PrismaClient({ log: ['error'] });

const argv = process.argv.slice(2);
const args = new Set(argv);
const APPLY = args.has('--apply');

/** --fil <sökväg> / --från-fil <sökväg> */
function flaggvärde(namn: string): string | null {
  const i = argv.indexOf(namn);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}
const SKRIV_FIL = flaggvärde('--fil');
const LÄS_FIL = flaggvärde('--från-fil');

type Förslag = Granskningsrad;

/** Bästa kända kategori för ett namn, eller null när ingen vet. */
function bättreKategori(name: string, subCategory?: string | null): StoreCategory | null {
  // Kurerade undantag FÖRE underkategorin. Underkategorin är gissad ur namnet
  // av inferSubCategory; undantaget är skrivet för hand av någon som sett
  // varan hamna fel. Utan den här ordningen föreslogs "lingon -> fruit_veg"
  // (bär) trots regeln att lingon köps frysta — och basvaror och varor i
  // listor fick olika svar för samma namn i samma körning.
  const undantag = kureratUndantag(name);
  if (undantag) return undantag;

  if (subCategory && SUB_TAXONOMY[subCategory as SubCategory]) {
    const frånSub = parentForSub(subCategory as SubCategory);
    if (frånSub !== 'other') return frånSub;
  }
  const frånNamn = categorizeIngredient(name);
  return frånNamn === 'other' ? null : frånNamn;
}

function rapportera(rubrik: string, rader: Array<{ namn: string; till: StoreCategory; från?: StoreCategory }>) {
  console.log(`\n${rubrik}: ${rader.length} rader kan rättas.`);
  for (const r of rader.slice(0, 25)) {
    console.log(`   ~ ${r.namn}  ${r.från ? `${r.från} -> ` : '-> '}${r.till}`);
  }
  if (rader.length > 25) console.log(`   ... och ${rader.length - 25} till.`);
}

async function main() {
  visaMåldatabas();

  // -- 1. IngredientAlias ----------------------------------------------------
  //
  // Med --kurerad räknas HELA poolen om från de kurerade reglerna, inte bara
  // raderna som står på 'other'. Det behövs sedan kategorin slutade vara
  // inlärd: värden som en gång skrevs av ett enskilt hushålls tryck (den
  // borttagna last-write-wins-vägen) lever annars kvar utan att någon kan
  // rätta dem. Säger klassaren 'other' lämnas raden ifred — då vet vi inget
  // bättre, och att skriva 'other' vore att kasta bort information.
  const kurerad = args.has('--kurerad');
  const alias = await prisma.ingredientAlias.findMany({
    where: kurerad ? undefined : { category: 'other' },
    select: { raw: true, canonical: true, category: true },
  });
  const aliasFix = alias
    .map(a => ({ raw: a.raw, namn: a.canonical, från: a.category, till: bättreKategori(a.canonical) }))
    .filter((a): a is { raw: string; namn: string; från: StoreCategory; till: StoreCategory } =>
      a.till !== null && a.till !== a.från);
  rapportera(kurerad ? '1. IngredientAlias (räknas om från kurerade regler)' : '1. IngredientAlias (global pool)', aliasFix);

  // -- 2. StapleItem ---------------------------------------------------------
  const staples = await prisma.stapleItem.findMany({
    where: { category: 'other' },
    select: { id: true, name: true },
  });
  const stapleFix = staples
    .map(s => ({ id: s.id, namn: s.name, till: bättreKategori(s.name) }))
    .filter((s): s is { id: string; namn: string; till: StoreCategory } => s.till !== null);
  rapportera('2. StapleItem (hushållens basvaror)', stapleFix);

  // -- 3. ShoppingItem -------------------------------------------------------
  // Varor med en egen lokal placering lämnas ifred: customCategory är
  // användarens uttryckliga val och ska aldrig skrivas över av en gissning.
  const items = await prisma.shoppingItem.findMany({
    where: { category: 'other', customCategory: null },
    select: { id: true, name: true, subCategory: true },
  });
  const itemFix = items
    .map(i => ({ id: i.id, namn: i.name, till: bättreKategori(i.name, i.subCategory) }))
    .filter((i): i is { id: string; namn: string; till: StoreCategory } => i.till !== null);
  rapportera('3. ShoppingItem (varor i listor)', itemFix);

  // Alla förslag i EN lista, så granskningsfilen kan blanda tabellerna och
  // ändå tillämpas exakt rad för rad.
  const alla: Förslag[] = [
    ...aliasFix.map(a => ({ tabell: 'alias' as const, nyckel: a.raw, namn: a.namn, till: a.till as string })),
    ...stapleFix.map(s => ({ tabell: 'staple' as const, nyckel: s.id, namn: s.namn, till: s.till as string })),
    ...itemFix.map(i => ({ tabell: 'item' as const, nyckel: i.id, namn: i.namn, till: i.till as string })),
  ];

  if (SKRIV_FIL) {
    skrivGranskningsfil(SKRIV_FIL, alla);
    return;
  }

  if (!APPLY) {
    console.log('\nTorrkörning. Inget skrevs.');
    console.log('  --fil <sökväg>   skriver ALLA förslag till en textfil du granskar i Anteckningar');
    console.log('  --apply          tillämpar allt direkt (utan granskning)');
    return;
  }

  // Med --från-fil är filen facit: bara raderna som står kvar där tillämpas,
  // med kategorin som står i den. Utan fil tillämpas allt skriptet föreslog.
  const attSkriva = LÄS_FIL ? läsGranskningsfil(LÄS_FIL) : alla;

  let antalAlias = 0, antalStaple = 0, antalItem = 0;
  for (const f of attSkriva) {
    const category = f.till as StoreCategory;
    if (f.tabell === 'alias') { await prisma.ingredientAlias.update({ where: { raw: f.nyckel }, data: { category } }); antalAlias++; }
    else if (f.tabell === 'staple') { await prisma.stapleItem.update({ where: { id: f.nyckel }, data: { category } }); antalStaple++; }
    else if (f.tabell === 'item') { await prisma.shoppingItem.update({ where: { id: f.nyckel }, data: { category } }); antalItem++; }
  }
  console.log(`\nKLART: ${antalAlias} alias, ${antalStaple} basvaror, ${antalItem} varor rättade.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
