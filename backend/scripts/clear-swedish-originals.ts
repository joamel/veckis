/**
 * Tar bort felaktiga "original" ur svenska recept.
 *
 * Tillagningen översattes vid import om engelskdetektorn sa ja — men den var
 * byggd för ingrediensnamn och såg "salt" som engelska. Svensk text skickades
 * till modellen, kom tillbaka lätt omformulerad och sparades som
 * originalInstructions, så ↔-knappen syntes på svenska recept utan att göra
 * något vettigt. Koden gör inte så längre (ärEngelskText); det här rättar
 * recepten som redan sparats.
 *
 * Bara recept vars SPARADE ORIGINAL är svenskt rörs — engelska original är
 * riktiga och får stå kvar. Den svenska texten i `instructions` är orörd.
 *
 * Torrkörning som standard. --apply för att skriva.
 */
import { PrismaClient } from '@prisma/client';
import { ärEngelskText } from '../src/lib/translateInstructions';
import { visaMåldatabas } from './visaDb';

const prisma = new PrismaClient({ log: ['error'] });
const APPLY = process.argv.includes('--apply');

async function main() {
  visaMåldatabas();

  const recept = await prisma.recipe.findMany({
    where: { originalInstructions: { not: null } },
    select: { id: true, title: true, originalInstructions: true },
  });
  const svenska = recept.filter(r => !ärEngelskText(r.originalInstructions!));

  console.log(`${recept.length} recept har ett sparat original, ${svenska.length} av dem är svenska:`);
  for (const r of svenska) console.log(`  ${r.id}  ${r.title}`);

  if (!APPLY) {
    console.log('\nTorrkörning — inget skrevs. Kör med --apply för att nollställa originalen.');
    return;
  }
  const { count } = await prisma.recipe.updateMany({
    where: { id: { in: svenska.map(r => r.id) } },
    data: { originalInstructions: null },
  });
  console.log(`\nNollställde originalet i ${count} recept.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
