/**
 * Tar bort rader som inte är varunamn alls.
 *
 * Skrapning och AI-tolkning har lämnat efter sig poster som aldrig var
 * ingredienser: hela receptstycken ("för 4 portioner: fläskytterfilé: 600 g
 * fläskytterfilé 1 msk smör..."), rader med HTML-entiteter ("salt &amp;amp;
 * svartpeppar") och rena instruktionsmeningar. De går inte att laga — de ska
 * inte finnas.
 *
 * Skiljer sig från clean-recipe-names, som gör ett långt men äkta varunamn
 * kortare. Det här är rader där det inte finns någon vara att rädda.
 *
 * Skriptet gissar med flit FÖRSIKTIGT och lägger hellre en tveksam rad åt
 * sidan, eftersom varje borttagning är permanent. Därför granskningsfilen:
 * inget raderas förrän du sagt ja till det, rad för rad.
 */
import { PrismaClient } from '@prisma/client';
import { visaMåldatabas } from './visaDb';
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

/** Ett varunamn på fler än så här många ord är ingen vara. Fem räcker för
 *  "rimmat sidfläsk i tunna skivor"; ett receptstycke har trettio. */
const MAX_ORD = 6;
/** Och längre än så här är det en mening, oavsett ordräkning. */
const MAX_TECKEN = 60;

function skäl(namn: string): string | null {
  const n = namn.trim();
  if (n.length === 0) return 'tomt namn';
  // HTML-entiteter betyder att texten aldrig avkodades vid skrapningen.
  if (/&[a-z]+;|&#\d+;|&amp/i.test(n)) return 'HTML-entitet i namnet';
  if (n.length > MAX_TECKEN) return `längre än ${MAX_TECKEN} tecken`;
  if (n.split(/\s+/).length > MAX_ORD) return `fler än ${MAX_ORD} ord`;
  // Kolon mitt i är nästan alltid en rubrik ur ett recept: "sås: 2 dl grädde".
  if (/:/.test(n)) return 'kolon — ser ut som en receptrubrik';
  // Flera mängdangivelser i samma sträng = en ingredienslista, inte en vara.
  if ((n.match(/\d+\s*(g|kg|dl|ml|l|msk|tsk|krm|st)\b/gi) ?? []).length >= 2) return 'flera mängder i samma namn';
  return null;
}

async function main() {
  visaMåldatabas();
  lägeskontroll({ skrivFil: SKRIV_FIL, läsFil: LÄS_FIL, apply: APPLY });

  const alias = await prisma.ingredientAlias.findMany({ select: { raw: true, canonical: true } });
  const staples = await prisma.stapleItem.findMany({ select: { id: true, name: true } });

  const förslag: Granskningsrad[] = [];
  for (const a of alias) {
    // Bedöm det KANONISKA namnet, inte det råa. Det kanoniska är vad som
    // faktiskt föreslås för användare; att den råa texten är stökig spelar
    // ingen roll om den kanoniska formen är en riktig vara. Första versionen
    // dömde på raw och visade canonical, vilket gav obegripliga rader som
    // "finrivet citronskal [fler än 6 ord]".
    const varför = skäl(a.canonical);
    if (varför) förslag.push({ tabell: 'alias', nyckel: a.raw, namn: a.canonical, till: `RADERAS (${varför})` });
  }
  for (const s of staples) {
    const varför = skäl(s.name);
    if (varför) förslag.push({ tabell: 'staple', nyckel: s.id, namn: s.name, till: `RADERAS (${varför})` });
  }

  // Recepten RÖRS INTE av det här skriptet, men samma klump sitter ofta kvar
  // i receptet den kom från — och den behöver rättas för hand i appen, för
  // det är användarens eget innehåll. Därför bara en rapport: vilka recept
  // som har en ingrediensrad som inte ser ut som en ingrediens.
  const receptRader = await prisma.recipeIngredient.findMany({
    select: { name: true, recipe: { select: { title: true } } },
  });
  const receptSkräp = receptRader.filter(i => skäl(i.name) !== null);

  console.log(`${alias.length} aliasrader och ${staples.length} basvaror genomsökta.`);
  console.log(`${förslag.length} rader ser inte ut som varunamn.\n`);
  for (const f of förslag.slice(0, 25)) console.log(`   - ${f.namn.slice(0, 70)}  [${f.till}]`);
  if (förslag.length > 25) console.log(`   ... och ${förslag.length - 25} till.`);

  if (receptSkräp.length > 0) {
    console.log(`\nRAPPORT: ${receptSkräp.length} receptingredienser ser ut som klumpar.`);
    console.log('Skriptet rör dem INTE — receptet är ditt eget innehåll och rättas i appen.');
    const perRecept = new Map<string, string[]>();
    for (const r of receptSkräp) {
      const lista = perRecept.get(r.recipe.title) ?? [];
      lista.push(r.name);
      perRecept.set(r.recipe.title, lista);
    }
    for (const [titel, rader] of [...perRecept].slice(0, 10)) {
      console.log(`\n  ${titel} (${rader.length} rader):`);
      for (const n of rader.slice(0, 3)) console.log(`    · ${n.slice(0, 90)}`);
      if (rader.length > 3) console.log(`    · ... och ${rader.length - 3} till`);
    }
    if (perRecept.size > 10) console.log(`\n  ... och ${perRecept.size - 10} recept till.`);
  }

  // Säg det rakt ut i stället för att bara returnera. Bad man om en fil och
  // fick varken fil eller förklaring såg det ut som att skriptet var trasigt.
  if (förslag.length === 0) {
    console.log('\nInget att göra — inga rader ser ut som skräp.');
    if (SKRIV_FIL) console.log(`Ingen fil skrevs till ${SKRIV_FIL}, eftersom det inte finns något att granska.`);
    return;
  }

  if (SKRIV_FIL) {
    skrivGranskningsfil(SKRIV_FIL, förslag);
    return;
  }

  if (!APPLY) {
    console.log('\nTorrkörning. Inget raderades.');
    console.log('  --fil <sökväg>   skriver ALLA förslag till en textfil du granskar i Anteckningar');
    console.log('  --apply          raderar allt ovan direkt (utan granskning)');
    return;
  }

  // Borttagning är permanent, så utan granskningsfil vill jag att man aktivt
  // valt det: --apply ensamt tar allt skriptet föreslog.
  const attRadera = LÄS_FIL ? läsGranskningsfil(LÄS_FIL) : förslag;

  const aliasNycklar = attRadera.filter(f => f.tabell === 'alias').map(f => f.nyckel);
  const stapleIdn = attRadera.filter(f => f.tabell === 'staple').map(f => f.nyckel);

  // deleteMany säger hur många rader den FAKTISKT tog. Den siffran, inte hur
  // många vi bad om, är vad som hänt. Skillnaden mellan dem är hela felet:
  // en nyckel som inte matchar någon rad raderar noll, tyst.
  let raderadeAlias = 0;
  if (aliasNycklar.length > 0) {
    await prisma.ingredientAliasHousehold.deleteMany({ where: { raw: { in: aliasNycklar } } });
    raderadeAlias = (await prisma.ingredientAlias.deleteMany({ where: { raw: { in: aliasNycklar } } })).count;
  }
  let raderadeStaples = 0;
  if (stapleIdn.length > 0) {
    raderadeStaples = (await prisma.stapleItem.deleteMany({ where: { id: { in: stapleIdn } } })).count;
  }

  console.log(`\nKLART: ${raderadeAlias} aliasrader och ${raderadeStaples} basvaror raderade.`);

  // Bad vi om fler än vi fick är nycklarna i filen föråldrade — de pekar på
  // rader som döpts om eller redan tagits bort, ofta för att ett annat
  // städskript kört emellan. Då måste filen genereras om, och det ska sägas
  // rakt ut i stället för att se ut som en lyckad körning.
  const missadeAlias = aliasNycklar.length - raderadeAlias;
  const missadeStaples = stapleIdn.length - raderadeStaples;
  if (missadeAlias > 0 || missadeStaples > 0) {
    console.log(`\nVARNING: ${missadeAlias + missadeStaples} av raderna i filen matchade ingen rad i databasen.`);
    console.log('Filen är föråldrad — nycklarna pekar på rader som bytt namn eller redan är borta.');
    console.log('Generera om den med --fil <sökväg> och granska på nytt. Exempel på nycklar som inte fanns:');
    const fanns = new Set(
      (await prisma.ingredientAlias.findMany({ where: { raw: { in: aliasNycklar } }, select: { raw: true } })).map(r => r.raw)
    );
    for (const n of aliasNycklar.filter(n => !fanns.has(n)).slice(0, 5)) console.log(`  · ${n.slice(0, 80)}`);
  }

  // Kontrollera i efterhand. Granskningsfilen skrivs ALDRIG om av skriptet —
  // den är ditt kvitto — så att rader står kvar i den säger ingenting om vad
  // som finns i databasen. Den här kontrollen svarar på den frågan i stället
  // för att lämna den åt en känsla.
  // KONTROLL: räkna om skräpet från början. Den förra versionen frågade bara
  // om nycklarna från filen fanns kvar — och en nyckel som aldrig matchade
  // något "finns inte kvar" heller, så en helt misslyckad körning såg lyckad
  // ut. Det som betyder något är om det finns skräp KVAR i tabellen.
  const efterAlias = await prisma.ingredientAlias.findMany({ select: { raw: true, canonical: true } });
  const efterStaples = await prisma.stapleItem.findMany({ select: { id: true, name: true } });
  const kvarSkräp =
    efterAlias.filter(a => skäl(a.canonical) !== null).length +
    efterStaples.filter(s => skäl(s.name) !== null).length;

  console.log(`KONTROLL: ${kvarSkräp} skräprader kvar i databasen (var ${förslag.length} före körningen).`);

  const hoppadeKvar = LÄS_FIL ? förslag.length - attRadera.length : 0;
  if (hoppadeKvar > 0) {
    console.log(`\n${hoppadeKvar} rader stod på "nej" och lämnades orörda — de ligger kvar i databasen med flit,`);
    console.log('och kommer därför dyka upp igen nästa gång du kör skriptet. Granskningsfilen ändras aldrig av');
    console.log('skriptet, så den ser likadan ut efteråt.');
  }
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
