/**
 * Visar OM det skapats nya hushåll sedan ett datum, och hur mycket de hunnit
 * använda appen — i antal, aldrig i innehåll.
 *
 * Finns för att se om Play-granskarna provade appen på riktigt. Visar inga
 * personuppgifter: inga namn, e-postadresser, hushållsnamn eller
 * recepttitlar, bara datum och antal. Läser bara — ändrar ingenting.
 *
 * Användning (PowerShell, från backend/):
 *   $env:DATABASE_URL = "postgresql://..."     # Railways DATABASE_PUBLIC_URL
 *   npx tsx scripts/new-households.ts 2026-09-17
 *
 * Utan datum visas de senaste 14 dagarna.
 */
import { PrismaClient } from '@prisma/client';
import { visaMåldatabas } from './visaDb';

const prisma = new PrismaClient({ log: ['error'] });

const argDate = process.argv[2];
const since = argDate ? new Date(argDate) : new Date(Date.now() - 14 * 24 * 3600 * 1000);
if (Number.isNaN(since.getTime())) {
  console.error(`Kunde inte tolka datumet "${argDate}". Använd formen 2026-09-17.`);
  process.exit(1);
}

function date(d: Date): string {
  return d.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

async function main() {
  visaMåldatabas();
  console.log(`Hushåll skapade sedan ${date(since)}\n`);

  const households = await prisma.household.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      _count: { select: { members: true, recipes: true, shoppingLists: true, weekMenuItems: true } },
    },
  });

  if (households.length === 0) {
    console.log('Inga nya hushåll.');
    return;
  }

  let i = 0;
  for (const h of households) {
    i++;
    const items = await prisma.shoppingItem.count({ where: { list: { householdId: h.id } } });
    const c = h._count;
    console.log(
      `Hushåll ${i}: skapat ${date(h.createdAt)} — ` +
      `${c.members} medlem(mar), ${c.recipes} recept, ${c.shoppingLists} listor, ${items} varor, ${c.weekMenuItems} menyrätter`,
    );
  }

  const used = households.filter(h => h._count.recipes + h._count.shoppingLists + h._count.weekMenuItems > 0).length;
  console.log(`\n${households.length} nya hushåll, varav ${used} har skapat något.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
