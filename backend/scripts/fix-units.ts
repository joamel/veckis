/**
 * Konverterar icke-svenska enheter på varor och basvaror.
 *
 * Engelska recept gav "teaspoon", "cup" och "oz" åt basvaror och därmed åt
 * varje vara som lades till från dem. Koden gör det inte längre — det här
 * rättar raderna som redan skrevs.
 *
 * Ingen granskningsfil, med flit: konverteringen är deterministisk och har
 * inget att välja mellan. "0,75 teaspoon" ÄR 0,75 tsk. De andra skripten
 * granskas rad för rad för att de gissar; det här gör de inte.
 *
 * Recept rörs inte. Där är källans enhet en del av texten, och ↔-knappen i
 * receptvyn växlar mellan den och den svenska formen.
 *
 * Torrkörning som standard. --apply för att skriva.
 */
import { PrismaClient } from '@prisma/client';
import { tillSvenskEnhet } from '@veckis/shared';
import { visaMåldatabas } from './visaDb';

const prisma = new PrismaClient({ log: ['error'] });
const APPLY = process.argv.includes('--apply');

async function main() {
  visaMåldatabas();

  const varor = await prisma.shoppingItem.findMany({
    where: { unit: { not: null } },
    select: { id: true, name: true, quantity: true, unit: true },
  });
  const basvaror = await prisma.stapleItem.findMany({
    where: { unit: { not: null } },
    select: { id: true, name: true, defaultQuantity: true, unit: true },
  });

  const varuFix = varor
    .map(v => ({ ...v, svensk: tillSvenskEnhet(v.quantity, v.unit) }))
    .filter(v => v.svensk.unit !== v.unit);

  const basFix = basvaror
    .map(b => ({ ...b, svensk: tillSvenskEnhet(b.defaultQuantity, b.unit) }))
    .filter(b => b.svensk.unit !== b.unit);

  console.log(`${varor.length} varor och ${basvaror.length} basvaror har en enhet.`);
  console.log(`${varuFix.length} varor och ${basFix.length} basvaror har en icke-svensk enhet.\n`);

  for (const v of [...varuFix].slice(0, 15)) {
    console.log(`   ~ ${v.name}: ${v.quantity} ${v.unit}  ->  ${v.svensk.quantity} ${v.svensk.unit}`);
  }
  for (const b of [...basFix].slice(0, 15)) {
    console.log(`   ~ ${b.name} (basvara): ${b.defaultQuantity ?? '—'} ${b.unit}  ->  ${b.svensk.quantity ?? '—'} ${b.svensk.unit}`);
  }

  if (varuFix.length + basFix.length === 0) {
    console.log('Inget att göra — alla enheter är redan svenska.');
    return;
  }

  if (!APPLY) {
    console.log('\nTorrkörning. Inget skrevs. Kör om med --apply för att genomföra.');
    return;
  }

  for (const v of varuFix) {
    await prisma.shoppingItem.update({
      where: { id: v.id },
      data: { unit: v.svensk.unit, quantity: v.svensk.quantity ?? v.quantity },
    });
  }
  for (const b of basFix) {
    await prisma.stapleItem.update({
      where: { id: b.id },
      data: { unit: b.svensk.unit, defaultQuantity: b.svensk.quantity ?? b.defaultQuantity },
    });
  }

  console.log(`\nKLART: ${varuFix.length} varor och ${basFix.length} basvaror fick svensk enhet.`);
  console.log('Varor med samma namn och enhet slås INTE ihop av det här skriptet —');
  console.log('men nästa gång varan läggs till hittar dubblettsökningen dem nu.');
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
