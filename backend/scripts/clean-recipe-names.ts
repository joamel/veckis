/**
 * Städar bort receptens ordalydelse ur VARU-datan.
 *
 * Bakgrund: fram till 2026-09-20 byggdes basvaror och den globala
 * ingredienspoolen från receptets råa text, så en enda import kunde lägga till
 * "ägg vispade", "kokt, svalt basmatiris" och "Kikkoman rostad sesamolja" som
 * egna varor. Normaliseringen som skulle ha stoppat det var dessutom tyst
 * trasig (modellens svar kom i en ```json-fence, JSON.parse kastade, och
 * catchen returnerade indata).
 *
 * Bägge felen är rättade, men raderna ligger kvar — och de SKUGGAR den nu
 * fungerande normaliseringen: cachen slår upp namnet, hittar raden där
 * kanoniska formen är skräpnamnet självt, och svarar med den utan att fråga
 * modellen. Poolen kan alltså inte läka av sig själv.
 *
 * Två tabeller:
 *   IngredientAlias  — kanoniska formen skrivs om
 *   StapleItem       — varan döps om, och slås ihop om målnamnet redan finns
 *
 * ShoppingItem lämnas med flit: varor i listor kom via /menus/to-shopping, som
 * alltid har normaliserat, och att döpa om rader i en lista någon står och
 * handlar efter är en sämre affär än ett fult namn.
 *
 * Torrkörning som standard. --apply för att skriva.
 */
import { PrismaClient } from '@prisma/client';
import { kanoniseraUtanCache } from '../src/lib/normalizeIngredients';

const prisma = new PrismaClient({ log: ['error'] });

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');

// Modellen får hantera lagom många namn per anrop: för stora batchar ger
// långa svar som oftare trunkeras, för små blir det onödigt många anrop.
const BATCH = 40;

/** Kandidater: flerordsnamn som aldrig kanoniserats (canonical === raw). Ett
 *  enordsnamn är redan så naket det blir, och att köra det genom modellen
 *  kostar bara pengar. */
function ärKandidat(raw: string, canonical: string): boolean {
  return raw === canonical && raw.trim().split(/\s+/).length >= 2;
}

async function kanoniseraAlla(namn: string[]): Promise<Map<string, string>> {
  const karta = new Map<string, string>();
  for (let i = 0; i < namn.length; i += BATCH) {
    const del = namn.slice(i, i + BATCH);
    const ut = await kanoniseraUtanCache(del);
    del.forEach((n, j) => {
      const kanonisk = (ut[j] ?? n).toLowerCase().trim();
      if (kanonisk && kanonisk !== n) karta.set(n, kanonisk);
    });
    console.log(`   ... ${Math.min(i + BATCH, namn.length)}/${namn.length} namn`);
  }
  return karta;
}

async function main() {
  // -- 1. IngredientAlias ----------------------------------------------------
  const alias = await prisma.ingredientAlias.findMany({ select: { raw: true, canonical: true } });
  const kandidater = alias.filter(a => ärKandidat(a.raw, a.canonical)).map(a => a.raw);

  console.log(`${alias.length} aliasrader, varav ${kandidater.length} okanoniserade flerordsnamn.`);
  if (kandidater.length === 0) {
    console.log('Inget att göra.');
    return;
  }

  console.log('\nKanoniserar via modellen (förbi cachen)...');
  const karta = await kanoniseraAlla(kandidater);

  console.log(`\n1. IngredientAlias: ${karta.size} rader får ny kanonisk form.`);
  for (const [från, till] of [...karta].slice(0, 30)) console.log(`   ~ ${från}  ->  ${till}`);
  if (karta.size > 30) console.log(`   ... och ${karta.size - 30} till.`);

  // -- 2. StapleItem ---------------------------------------------------------
  // Hushållens egna basvaror bär samma skräpnamn. Namnet är halva
  // unik-nyckeln, så en omdöpning kan krocka med en rad som redan finns — då
  // slås de ihop i stället för att krascha.
  const staples = await prisma.stapleItem.findMany({
    select: { id: true, householdId: true, name: true, usageCount: true },
  });
  const stapleÄndringar = staples
    .map(s => ({ ...s, till: karta.get(s.name) }))
    .filter((s): s is typeof s & { till: string } => !!s.till);

  const kollisioner = stapleÄndringar.filter(s =>
    staples.some(annan => annan.householdId === s.householdId && annan.name === s.till)
  );

  console.log(`\n2. StapleItem: ${stapleÄndringar.length} basvaror döps om, varav ${kollisioner.length} slås ihop med en befintlig.`);
  for (const s of stapleÄndringar.slice(0, 20)) console.log(`   ~ ${s.name}  ->  ${s.till}`);
  if (stapleÄndringar.length > 20) console.log(`   ... och ${stapleÄndringar.length - 20} till.`);

  if (!APPLY) {
    console.log('\nTorrkörning. Inget skrevs. Kör om med --apply för att genomföra.');
    return;
  }

  for (const [från, till] of karta) {
    await prisma.ingredientAlias.update({ where: { raw: från }, data: { canonical: till } });
  }

  for (const s of stapleÄndringar) {
    const befintlig = await prisma.stapleItem.findUnique({
      where: { householdId_name: { householdId: s.householdId, name: s.till } },
    });
    if (befintlig) {
      // Slå ihop: användningsräknarna adderas så "dina vanligaste" inte
      // nollställs av en omdöpning, och skräpraden försvinner.
      await prisma.stapleItem.update({
        where: { id: befintlig.id },
        data: { usageCount: befintlig.usageCount + s.usageCount },
      });
      await prisma.stapleItem.delete({ where: { id: s.id } });
    } else {
      await prisma.stapleItem.update({ where: { id: s.id }, data: { name: s.till } });
    }
  }

  console.log(`\nKLART: ${karta.size} alias omskrivna, ${stapleÄndringar.length} basvaror rättade (${kollisioner.length} ihopslagna).`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
