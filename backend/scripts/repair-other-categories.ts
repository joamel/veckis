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
 */
import { PrismaClient, StoreCategory } from '@prisma/client';
import { parentForSub, SUB_TAXONOMY, type SubCategory } from '@veckis/shared';
import { categorizeIngredient } from '../src/lib/categorizeIngredient';

const prisma = new PrismaClient({ log: ['error'] });

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');

/** Bästa kända kategori för ett namn, eller null när ingen vet. */
function bättreKategori(name: string, subCategory?: string | null): StoreCategory | null {
  if (subCategory && SUB_TAXONOMY[subCategory as SubCategory]) {
    const frånSub = parentForSub(subCategory as SubCategory);
    if (frånSub !== 'other') return frånSub;
  }
  const frånNamn = categorizeIngredient(name);
  return frånNamn === 'other' ? null : frånNamn;
}

function rapportera(rubrik: string, rader: Array<{ namn: string; till: StoreCategory }>) {
  console.log(`\n${rubrik}: ${rader.length} rader kan rättas.`);
  for (const r of rader.slice(0, 25)) console.log(`   ~ ${r.namn}  ->  ${r.till}`);
  if (rader.length > 25) console.log(`   ... och ${rader.length - 25} till.`);
}

async function main() {
  // -- 1. IngredientAlias ----------------------------------------------------
  const alias = await prisma.ingredientAlias.findMany({
    where: { category: 'other' },
    select: { raw: true, canonical: true },
  });
  const aliasFix = alias
    .map(a => ({ raw: a.raw, namn: a.canonical, till: bättreKategori(a.canonical) }))
    .filter((a): a is { raw: string; namn: string; till: StoreCategory } => a.till !== null);
  rapportera('1. IngredientAlias (global pool)', aliasFix);

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

  if (!APPLY) {
    console.log('\nTorrkörning. Inget skrevs. Kör om med --apply för att genomföra.');
    return;
  }

  for (const a of aliasFix) {
    await prisma.ingredientAlias.update({ where: { raw: a.raw }, data: { category: a.till } });
  }
  for (const s of stapleFix) {
    await prisma.stapleItem.update({ where: { id: s.id }, data: { category: s.till } });
  }
  for (const i of itemFix) {
    await prisma.shoppingItem.update({ where: { id: i.id }, data: { category: i.till } });
  }
  console.log(`\nKLART: ${aliasFix.length} alias, ${stapleFix.length} basvaror, ${itemFix.length} varor rättade.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
