/**
 * Rapport: riktiga varor som bara ETT hushåll har använt.
 *
 * Tröskeln (MIN_HOUSEHOLDS_FOR_GLOBAL_SUGGESTION i routes/staples.ts) döljer
 * ett namn för andra hushåll tills minst två har sett det — som skydd mot
 * stavfel och udda varor. Priset är att riktiga varor ett enda hushåll har
 * (kaffefilter) inte syns i andras sök. Det här listar namn som ett hushåll
 * använt flera gånger, och som klarar samma skräpfilter som de globala
 * förslagen, som färdiga rader att klistra in i src/lib/commonIngredients.ts.
 * Du väljer själv vilka som ska med — tröskeln sänks inte.
 *
 * Läser bara. Det finns inget --apply, med flit.
 * Kör mot prod genom att peka DATABASE_URL dit.
 */
import { visaMåldatabas } from './visaDb';
import { PrismaClient } from '@prisma/client';
import { categorizeIngredient } from '../src/lib/categorizeIngredient';
import { duglingGlobalt } from '../src/lib/normalizeIngredients';
import { COMMON_INGREDIENTS } from '../src/lib/commonIngredients';

const prisma = new PrismaClient({ log: ['error'] });
const MIN_SEEN = 3;

async function main() {
  visaMåldatabas();

  const counts = await prisma.ingredientAliasHousehold.groupBy({
    by: ['raw'],
    _count: { householdId: true },
  });
  const households = new Map(counts.map(c => [c.raw, c._count.householdId]));

  const alias = await prisma.ingredientAlias.findMany({
    where: { seenCount: { gte: MIN_SEEN } },
    orderBy: { seenCount: 'desc' },
    select: { raw: true, canonical: true, category: true, seenCount: true },
  });

  const kurerade = new Set(COMMON_INGREDIENTS.map(c => c.name));
  const seen = new Set<string>();
  const kandidater = alias.filter(a => {
    const key = a.canonical.toLowerCase();
    if (seen.has(key) || kurerade.has(key)) return false;
    if ((households.get(a.raw) ?? 0) !== 1) return false;
    if (!duglingGlobalt(a.canonical)) return false;
    seen.add(key);
    return true;
  });

  console.log(`${kandidater.length} namn med ett enda hushåll och setts minst ${MIN_SEEN} gånger.\n`);
  if (kandidater.length === 0) return;

  console.log('setts  rad att klistra in (kategori = klassaren, annars lagrad)');
  console.log('-----  ---------------------------------------------------------');
  for (const k of kandidater.slice(0, 150)) {
    const klassad = categorizeIngredient(k.canonical);
    const kategori = klassad !== 'other' ? klassad : k.category;
    const namn = k.canonical.charAt(0).toUpperCase() + k.canonical.slice(1);
    console.log(`${String(k.seenCount).padStart(5)}  { name: '${namn.replace(/'/g, "\\'")}', category: '${kategori}' },`);
  }
  if (kandidater.length > 150) console.log(`\n... och ${kandidater.length - 150} till.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
