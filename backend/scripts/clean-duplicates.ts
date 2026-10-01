/**
 * Hittar VARIANTER av samma vara och slår ihop dem.
 *
 * Poolen samlar på sig stavfel, ihopskrivningar och omkastningar:
 * "koncentrierad kycklingfond", "konzentrierad kycklingfond" och
 * "kycklingfond, koncentrerad" är samma sak skriven på tre sätt, och
 * "vitlöksklyftorfinhackade" är två ord som klistrats ihop.
 *
 * Skiljer sig från de andra skripten: här är frågan inte "är namnet snyggt"
 * utan "är de här två samma vara". Gissningen kan bli fel, så varje grupp
 * granskas rad för rad innan något skrivs.
 *
 * Målnamnet väljs som den variant som setts OFTAST — den som flest hushåll
 * och recept faktiskt använt är sannolikt den rätta stavningen. Håller du inte
 * med skriver du dit rätt namn i BLIR-kolumnen.
 *
 * Torrkörning som standard. --fil för granskning, --från-fil + --apply skriver.
 */
import { PrismaClient } from '@prisma/client';
import { visaMåldatabas } from './visaDb';
import { variantGroups as gruppera, type WeightedName } from '../src/lib/nameCleanup';
import { skrivGranskningsfil, läsGranskningsfil, lägeskontroll, type Granskningsrad } from './granskningsfil';

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

// Grupperingen delas med adminsidan, så de två aldrig säger olika saker.
type Vara = WeightedName;

/** Alla varunamn som finns, med hur ofta de setts. Alias och basvaror slås
 *  ihop till EN lista, eftersom ett namn ska stavas likadant överallt. */
async function allaVaror(): Promise<Vara[]> {
  const vikter = new Map<string, number>();
  const lägg = (namn: string, vikt: number) => {
    const n = namn.trim();
    if (n) vikter.set(n, (vikter.get(n) ?? 0) + vikt);
  };

  for (const a of await prisma.ingredientAlias.findMany({ select: { canonical: true, seenCount: true } })) {
    lägg(a.canonical, a.seenCount);
  }
  for (const s of await prisma.stapleItem.findMany({ select: { name: true, usageCount: true } })) {
    lägg(s.name, 1 + s.usageCount);
  }

  return [...vikter].map(([namn, vikt]) => ({ namn, vikt }));
}

async function main() {
  visaMåldatabas();
  lägeskontroll({ skrivFil: SKRIV_FIL, läsFil: LÄS_FIL, apply: APPLY });

  const varor = await allaVaror();
  const grupper = gruppera(varor);

  console.log(`${varor.length} unika varunamn, ${grupper.length} grupper med varianter.\n`);

  const förslag: Granskningsrad[] = [];
  for (const grupp of grupper) {
    // Första i gruppen är den tyngsta (mest sedda) — den blir målnamnet.
    const [mål, ...varianter] = grupp;
    console.log(`   ${mål.namn}  (sedd ${mål.vikt}×)`);
    for (const v of varianter) {
      console.log(`     ← ${v.namn}  (${v.vikt}×)`);
      förslag.push({ tabell: 'namn', nyckel: v.namn, namn: v.namn, till: mål.namn });
    }
  }

  if (förslag.length === 0) {
    console.log('Inga varianter hittade.');
    return;
  }

  if (SKRIV_FIL) {
    skrivGranskningsfil(SKRIV_FIL, förslag, [
      '# Ändra ja till nej på de rader du inte vill slå ihop.',
      '#',
      '# BLIR = namnet alla varianter slås ihop till. Skriv dit ett annat namn',
      '# om du tycker att en annan stavning är den rätta.',
      '#',
      '# Stryk ingenting och ändra inget annat på raden (namnet och nyckeln sist',
      '# används för att hitta rätt rad).',
    ]);
    return;
  }

  if (!APPLY) {
    console.log(`\nTorrkörning. ${förslag.length} namn skulle slås ihop.`);
    console.log('  --fil <sökväg>   skriver ALLA förslag till en textfil du granskar i Anteckningar');
    console.log('  --apply          slår ihop allt direkt (utan granskning)');
    return;
  }

  const valda = LÄS_FIL ? läsGranskningsfil(LÄS_FIL) : förslag;

  let alias = 0;
  let staples = 0;
  let ihopslagna = 0;
  for (const v of valda) {
    alias += (await prisma.ingredientAlias.updateMany({ where: { canonical: v.nyckel }, data: { canonical: v.till } })).count;

    for (const s of await prisma.stapleItem.findMany({ where: { name: v.nyckel } })) {
      const befintlig = await prisma.stapleItem.findUnique({
        where: { householdId_name: { householdId: s.householdId, name: v.till } },
      });
      if (befintlig) {
        // Hushållet har redan målnamnet — slå ihop i stället för att krocka.
        await prisma.stapleItem.update({
          where: { id: befintlig.id },
          data: { usageCount: befintlig.usageCount + s.usageCount },
        });
        await prisma.stapleItem.delete({ where: { id: s.id } });
        ihopslagna++;
      } else {
        await prisma.stapleItem.update({ where: { id: s.id }, data: { name: v.till } });
      }
      staples++;
    }
  }

  console.log(`\nKLART: ${alias} aliasrader och ${staples} basvaror pekar nu på rätt namn (${ihopslagna} ihopslagna).`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
