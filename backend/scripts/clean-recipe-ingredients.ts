/**
 * Översätter engelska ingrediensnamn i REDAN sparade recept.
 *
 * Importen översätter numera, men fram till 2026-09-20 var översättningen tyst
 * död (modellens svar kom i en ```json-fence och parsningen kastade), så
 * recept importerade dessförinnan har kvar engelska namn. De rättar sig inte
 * själva.
 *
 * Originalet sparas i originalName, vilket är det som får ↔-knappen i
 * receptvyn att fungera: utan det finns inget att växla tillbaka TILL, och
 * knappen kan bara byta enhet.
 *
 * ENHETER rörs inte, med flit. Receptet lagrar källans enhet ("teaspoon") och
 * räknar om den vid visning — det är så växlingen mellan svenskt och original
 * är byggd. Det är bara inköpslistan som ska ha svenska enheter i databasen.
 *
 * Torrkörning som standard. --fil för granskning, --från-fil + --apply skriver.
 */
import { PrismaClient } from '@prisma/client';
import { visaMåldatabas } from './visaDb';
import { skrivGranskningsfil, läsGranskningsfil, lägeskontroll, type Granskningsrad } from './granskningsfil';
import { serEngelsktUt, översättIngrediensnamn } from '../src/lib/translateIngredients';

const prisma = new PrismaClient({ log: ['error'] });

const argv = process.argv.slice(2);
const args = new Set(argv);
const APPLY = args.has('--apply');
function flaggvärde(namn: string): string | null {
  const i = argv.indexOf(namn);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}
const SKRIV_FIL = flaggvärde('--fil');
const LÄS_FIL = flaggvärde('--från-fil');

const BATCH = 40;

async function main() {
  visaMåldatabas();
  lägeskontroll({ skrivFil: SKRIV_FIL, läsFil: LÄS_FIL, apply: APPLY });

  const rader = await prisma.recipeIngredient.findMany({
    select: { id: true, name: true, originalName: true, recipe: { select: { title: true } } },
  });

  const engelska = rader.filter(r => serEngelsktUt([r.name]));
  console.log(`${rader.length} receptingredienser, varav ${engelska.length} ser engelska ut.\n`);
  if (engelska.length === 0) return;

  // Översätt unika namn — samma ingrediens återkommer i flera recept.
  const unika = [...new Set(engelska.map(r => r.name))];
  const karta = new Map<string, string>();
  for (let i = 0; i < unika.length; i += BATCH) {
    const del = unika.slice(i, i + BATCH);
    const ut = await översättIngrediensnamn(del);
    del.forEach((n, j) => {
      const svenskt = (ut[j] ?? n).trim();
      if (svenskt && svenskt.toLowerCase() !== n.toLowerCase()) karta.set(n, svenskt);
    });
    console.log(`   ... ${Math.min(i + BATCH, unika.length)}/${unika.length} namn`);
  }

  const förslag: Granskningsrad[] = engelska
    .filter(r => karta.has(r.name))
    .map(r => ({
      tabell: 'recept',
      nyckel: r.id,
      namn: `${r.recipe.title}: ${r.name}`,
      till: karta.get(r.name) as string,
    }));

  console.log(`\n${förslag.length} ingrediensrader får ett svenskt namn.`);
  for (const f of förslag.slice(0, 20)) console.log(`   ~ ${f.namn}  ->  ${f.till}`);
  if (förslag.length > 20) console.log(`   ... och ${förslag.length - 20} till.`);

  if (förslag.length === 0) {
    console.log('Inga översättningar att göra.');
    return;
  }

  if (SKRIV_FIL) {
    skrivGranskningsfil(SKRIV_FIL, förslag);
    return;
  }

  if (!APPLY) {
    console.log('\nTorrkörning. Inget skrevs.');
    console.log('  --fil <sökväg>   skriver ALLA förslag till en textfil du granskar i Anteckningar');
    console.log('  --apply          översätter allt direkt (utan granskning)');
    return;
  }

  const valda = LÄS_FIL ? läsGranskningsfil(LÄS_FIL) : förslag;
  const efterId = new Map(rader.map(r => [r.id, r]));

  let ändrade = 0;
  for (const v of valda) {
    const rad = efterId.get(v.nyckel);
    if (!rad) continue;
    await prisma.recipeIngredient.update({
      where: { id: v.nyckel },
      data: {
        name: v.till,
        // Skriv bara originalName om det saknas — har receptet redan ett
        // original sparat är det källans ord, och det ska inte skrivas över.
        ...(rad.originalName ? {} : { originalName: rad.name }),
      },
    });
    ändrade++;
  }

  console.log(`\nKLART: ${ändrade} ingrediensrader översatta, originalet sparat så ↔-knappen fungerar.`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
