/**
 * Visar OM det skapats nya hushåll sedan ett datum, och hur mycket de hunnit
 * göra. Samma lista finns på adminsidan (Nya hushåll); logiken ligger i
 * src/lib/adminCuration.ts.
 *
 *   npm run ... -- 2026-09-17   (utan datum: två veckor bakåt)
 *
 * Läser bara. Kör mot prod genom att peka DATABASE_URL dit.
 */
import { visaMåldatabas } from './visaDb';
import { prisma } from '../src/db';
import { newHouseholds } from '../src/lib/adminCuration';

const argDate = process.argv[2];
const since = argDate ? new Date(argDate) : new Date(Date.now() - 14 * 24 * 3600 * 1000);
if (Number.isNaN(since.getTime())) {
  console.error(`Kunde inte tolka datumet "${argDate}". Använd formen 2026-09-17.`);
  process.exit(1);
}

const date = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm' });

async function main() {
  visaMåldatabas();
  console.log(`Hushåll skapade sedan ${date(since.toISOString())}\n`);
  const rows = await newHouseholds(since);
  if (rows.length === 0) { console.log('Inga nya hushåll.'); return; }
  rows.forEach((h, i) => {
    console.log(`Hushåll ${i + 1}: skapat ${date(h.createdAt)} — ${h.members} medlem(mar), ${h.recipes} recept, ${h.lists} listor, ${h.items} varor, ${h.menuItems} menyrätter`);
  });
  const used = rows.filter(h => h.recipes + h.lists + h.menuItems > 0).length;
  console.log(`\n${rows.length} nya hushåll, varav ${used} har skapat något.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
