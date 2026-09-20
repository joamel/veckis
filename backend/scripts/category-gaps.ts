/**
 * Rapport: vilka varunamn saknar en kurerad kategoriregel?
 *
 * Det här är varorna som hamnar under Övrigt för ett hushåll som inte själv
 * sagt något om dem. Åtgärden är att lägga till ett nyckelord eller ett
 * undantag i src/lib/categorizeIngredient.ts — inte att ändra i databasen.
 * Kategorin är kurerad, inte inlärd (se kommentaren i storeIngredientCategory).
 *
 * Läser bara. Det finns inget --apply, med flit.
 *
 * Samma data som GET /api/admin/category-gaps, men utan att behöva en
 * Clerk-token. Kör mot prod genom att peka DATABASE_URL dit.
 */
import { visaMåldatabas } from './visaDb';
import { PrismaClient } from '@prisma/client';
import { categorizeIngredient } from '../src/lib/categorizeIngredient';

const prisma = new PrismaClient({ log: ['error'] });

async function main() {
  visaMåldatabas();

  const alias = await prisma.ingredientAlias.findMany({
    orderBy: { seenCount: 'desc' },
    select: { canonical: true, category: true, seenCount: true },
  });

  const luckor = alias.filter(a => categorizeIngredient(a.canonical) === 'other');

  console.log(`${alias.length} namn i poolen, ${luckor.length} utan kurerad regel.\n`);
  if (luckor.length === 0) {
    console.log('Inga luckor. Alla namn täcks av en regel.');
    return;
  }

  console.log('setts  namn                              lagrad kategori');
  console.log('-----  --------------------------------  ---------------');
  for (const l of luckor.slice(0, 100)) {
    console.log(`${String(l.seenCount).padStart(5)}  ${l.canonical.slice(0, 32).padEnd(32)}  ${l.category}`);
  }
  if (luckor.length > 100) console.log(`\n... och ${luckor.length - 100} till.`);

  console.log('\nVanligast först. "lagrad kategori" är vad varan ligger under idag:');
  console.log('other = hamnar i Övrigt. Något annat = ett arv från den gamla');
  console.log('inlärningen, innan kategorin blev kurerad.');
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
