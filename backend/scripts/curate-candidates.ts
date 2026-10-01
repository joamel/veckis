/**
 * Rapport: riktiga varor som bara ETT hushåll har använt.
 *
 * Tröskeln på två hushåll döljer dem för alla andra. Kandidaterna skrivs ut
 * som färdiga rader att klistra in i src/lib/commonIngredients.ts — då syns
 * de för alla oavsett tröskel. Samma lista finns på adminsidan (Kandidater);
 * logiken ligger i src/lib/adminCuration.ts så de två aldrig säger olika saker.
 *
 * Läser bara. Kör mot prod genom att peka DATABASE_URL dit.
 */
import { visaMåldatabas } from './visaDb';
import { prisma } from '../src/db';
import { curateCandidates } from '../src/lib/adminCuration';

const MIN_SEEN = 3;

async function main() {
  visaMåldatabas();
  const kandidater = await curateCandidates(MIN_SEEN);
  console.log(`${kandidater.length} namn med ett enda hushåll och setts minst ${MIN_SEEN} gånger.\n`);
  if (kandidater.length === 0) return;

  console.log('setts  rad att klistra in (kategori = klassaren, annars lagrad)');
  console.log('-----  ---------------------------------------------------------');
  for (const k of kandidater.slice(0, 150)) {
    const namn = k.name.charAt(0).toUpperCase() + k.name.slice(1);
    console.log(`${String(k.seenCount).padStart(5)}  { name: '${namn.replace(/'/g, "\'")}', category: '${k.category}' },`);
  }
  if (kandidater.length > 150) console.log(`\n... och ${kandidater.length - 150} till.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
