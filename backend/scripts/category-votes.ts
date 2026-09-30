/**
 * Rapport: var är hushållen oense med den kurerade klassaren?
 *
 * Syskon till category-gaps. Den listar namn klassaren inte känner igen alls;
 * den här listar namn där hushåll har VALT en annan kategori eller
 * underkategori än klassaren ger. Flera hushåll som oberoende gjort samma
 * rättelse är skäl att lägga in en regel i categorizeIngredient.ts eller
 * inferSubCategory.ts — då får alla hushåll rättelsen. Logiken och hur raderna
 * ska läsas: src/lib/categoryVotes.ts.
 *
 * Läser bara. Det finns inget --apply, med flit.
 *
 *   npm run category-votes            alla namn där minst ett hushåll är oense
 *   npm run category-votes -- --min 2 bara där minst två hushåll är oense
 *
 * Samma data som GET /api/admin/category-votes, men utan Clerk-token. Kör mot
 * prod genom att peka DATABASE_URL dit.
 */
import { visaMåldatabas } from './visaDb';
import { PrismaClient } from '@prisma/client';
import { categoryVotes } from '../src/lib/categoryVotes';

const prisma = new PrismaClient({ log: ['error'] });

function minArg(): number {
  const i = process.argv.indexOf('--min');
  const n = i >= 0 ? Number(process.argv[i + 1]) : 1;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

async function main() {
  visaMåldatabas();
  const min = minArg();

  const staples = await prisma.stapleItem.findMany({
    select: { householdId: true, name: true, category: true, categoryChosen: true, subCategory: true },
  });
  const rows = categoryVotes(staples, min);

  console.log(`${staples.length} basvaror. ${rows.length} namn där minst ${min} hushåll är oense med klassaren.\n`);
  if (rows.length === 0) return;

  const fmt = (list: { households: number }[], key: (x: never) => string) =>
    list.map(x => `${key(x as never)} ×${x.households}`).join(', ') || '—';

  console.log('oense/alla  namn                        klassaren                          hushållens kategori / valda underkategorier');
  console.log('----------  --------------------------  ---------------------------------  -------------------------------------------');
  for (const r of rows.slice(0, 150)) {
    const curated = `${r.curated.category}${r.curated.subCategory ? ` / ${r.curated.subCategory}` : ''}`;
    const cats = fmt(r.categories, (x: { category: string }) => x.category);
    const subs = fmt(r.subCategories, (x: { subCategory: string }) => x.subCategory);
    console.log(`${`${r.disagreeing}/${r.households}`.padStart(10)}  ${r.name.slice(0, 26).padEnd(26)}  ${curated.slice(0, 33).padEnd(33)}  ${cats}  |  ${subs}`);
  }
  if (rows.length > 150) console.log(`\n... och ${rows.length - 150} till.`);

  console.log('\nFlest oense först. Åtgärden är en regel i koden, inte en ändring i databasen.');
  console.log('Bara kategorier som hushållen valt räknas — sparade gissningar är ingen röst.');
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
