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
import { visaMåldatabas } from './visaDb';
import { skrivGranskningsfil, läsGranskningsfil, lägeskontroll, type Granskningsrad } from './granskningsfil';
import { PrismaClient } from '@prisma/client';
import { kanoniseraUtanCache } from '../src/lib/normalizeIngredients';
import { bevararSkyddadeOrd } from '../src/lib/importMatchning';
import { stripIngredient } from '../src/lib/stripIngredient';

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

// Modellen får hantera lagom många namn per anrop: för stora batchar ger
// långa svar som oftare trunkeras, för små blir det onödigt många anrop.
const BATCH = 40;

/** Kandidater: flerordsnamn som aldrig kanoniserats (canonical === raw). Ett
 *  enordsnamn är redan så naket det blir, och att köra det genom modellen
 *  kostar bara pengar.
 *
 *  Namn med ALTERNATIV hoppas över helt. De ska varken kortas eller väljas
 *  mellan — "falukorv eller kycklingstekkorv" är inte "falukorv". De filtreras
 *  redan bort ur sökförslagen av duglingGlobalt, och alternativen lärs in var
 *  för sig (delaAlternativ), så raden gör ingen skada där den ligger. */
function ärKandidat(raw: string, canonical: string): boolean {
  if (/\s(?:eller|alt\.?|alternativt)\s/i.test(canonical)) return false;
  // Bedöm CANONICAL, inte om den skiljer sig från raw.
  //
  // Kravet raw === canonical betydde "har aldrig putsats", men en rad kan vara
  // putsad EN gång och fortfarande vara fel: raw "msk finrivet citronskal (+ ev
  // extra till servering)" gav canonical "finrivet citronskal", som inte är en
  // vara. Den hoppades över eftersom de skilde sig åt, och skriptet
  // rapporterade noll rader att göra.
  void raw;
  return canonical.trim().split(/\s+/).length >= 2;
}

/**
 * Sista spärren mot att modellen byter ut ett namn mot ett helt annat.
 *
 * En kanonisering ska GÖRA NAMNET KORTARE, inte ersätta det: "finrivet
 * citronskal" → "citronskal" är rimligt, "färsk spenat" → "creme fraiche" är
 * en förväxling. Kravet är att förslaget delar en ordstam med originalet.
 *
 * Det här hade fångat ihopparningsbuggen (2026-09-20) även utan rättningen av
 * den, och fångar nästa variant av samma sak — en modell som svarar fel går
 * inte att resonera bort, bara att kontrollera.
 */
function liknarOriginalet(original: string, förslag: string): boolean {
  const stammar = (s: string) =>
    s.toLowerCase().split(/[^a-zåäöéèü0-9]+/).filter(o => o.length >= 3).map(o => o.slice(0, 4));
  const iOriginalet = new Set(stammar(original));
  return stammar(förslag).some(s => iOriginalet.has(s));
}

async function kanoniseraAlla(namn: string[]): Promise<Map<string, string>> {
  const karta = new Map<string, string>();
  const avvisade: Array<{ från: string; till: string }> = [];

  for (let i = 0; i < namn.length; i += BATCH) {
    const del = namn.slice(i, i + BATCH);
    const ut = await kanoniseraUtanCache(del);
    del.forEach((n, j) => {
      const kanonisk = (ut[j] ?? n).toLowerCase().trim();
      if (!kanonisk || kanonisk === n) return;
      if (!liknarOriginalet(n, kanonisk)) { avvisade.push({ från: n, till: kanonisk }); return; }
      // Samma skydd som importens matchning: ett ord som avgör VILKEN vara det
      // är får inte försvinna. Utan det föreslog skriptet "grillad kyckling"
      // → "kyckling" och "turkisk yoghurt" → "yoghurt".
      if (!bevararSkyddadeOrd(n, kanonisk)) { avvisade.push({ från: n, till: kanonisk }); return; }
      karta.set(n, kanonisk);
    });
    console.log(`   ... ${Math.min(i + BATCH, namn.length)}/${namn.length} namn`);
  }

  if (avvisade.length > 0) {
    console.log(`\n${avvisade.length} förslag AVVISADES — de liknar inte originalet:`);
    for (const a of avvisade.slice(0, 10)) console.log(`   ✗ ${a.från}  ->  ${a.till}`);
    if (avvisade.length > 10) console.log(`   ... och ${avvisade.length - 10} till.`);
  }

  return karta;
}

async function main() {
  visaMåldatabas();
  lägeskontroll({ skrivFil: SKRIV_FIL, läsFil: LÄS_FIL, apply: APPLY });

  // -- 1. IngredientAlias ----------------------------------------------------
  const alias = await prisma.ingredientAlias.findMany({ select: { raw: true, canonical: true } });
  const kandidater = alias.filter(a => ärKandidat(a.raw, a.canonical)).map(a => a.canonical);

  console.log(`${alias.length} aliasrader, varav ${kandidater.length} flerordsnamn granskas.`);
  if (kandidater.length === 0) {
    console.log('Inget att göra.');
    return;
  }

  // Deterministisk strippning FÖRST. Den är gratis, går att testa, och klarar
  // numera ledande tillagningsord ("finrivet citronskal" → "citronskal").
  // Bara det den inte rår på går vidare till modellen — färre AI-gissningar är
  // alltid bättre, och särskilt efter förväxlingen 2026-09-20.
  const karta = new Map<string, string>();
  const kvarTillAi: string[] = [];
  for (const namn of kandidater) {
    const strippat = stripIngredient(namn);
    if (strippat && strippat !== namn) karta.set(namn, strippat);
    else kvarTillAi.push(namn);
  }
  if (karta.size > 0 || kvarTillAi.length > 0) {
    console.log(`   ${karta.size} rättas av strippningen, ${kvarTillAi.length} går till modellen.`);
  }

  if (kvarTillAi.length > 0) {
    console.log('\nKanoniserar via modellen (förbi cachen)...');
    for (const [från, till] of await kanoniseraAlla(kvarTillAi)) karta.set(från, till);
  }

  // Säg antalet FÖRSLAG, inte antalet granskade. "9 flerordsnamn att se över"
  // stod kvar varje körning även när allt redan var rätt, och lästes som att
  // samma arbete låg kvar — särskilt om man nyss applicerat.
  if (karta.size === 0) {
    console.log(`\nInga förslag: alla ${kandidater.length} flerordsnamn ser redan bra ut.`);
  }
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
  const stapleÄndringar: Array<{ id: string; householdId: string; name: string; usageCount: number; till: string }> = staples
    .filter(s => !/\s(?:eller|alt\.?|alternativt)\s/i.test(s.name))
    .map(s => ({ ...s, till: karta.get(s.name) }))
    .filter((s): s is typeof s & { till: string } => !!s.till);

  const kollisioner = stapleÄndringar.filter(s =>
    staples.some(annan => annan.householdId === s.householdId && annan.name === s.till)
  );

  console.log(`\n2. StapleItem: ${stapleÄndringar.length} basvaror döps om, varav ${kollisioner.length} slås ihop med en befintlig.`);
  for (const s of stapleÄndringar.slice(0, 20)) console.log(`   ~ ${s.name}  ->  ${s.till}`);
  if (stapleÄndringar.length > 20) console.log(`   ... och ${stapleÄndringar.length - 20} till.`);

  // Granskningsfil även här, och särskilt här: det HÄR är det enda skriptet
  // där en språkmodell bestämmer nya namn. Att låta den skriva rakt in i
  // databasen utan att en människa sett raderna är inte försvarbart — dagens
  // fel (tyst död normalisering, kollapsade alternativ, förväxlade rader)
  // hade alla sluppit igenom.
  // EN rad per namn — inte en för aliaset och en för basvaran. Det är samma
  // beslut ("ska 'riven ost' heta 'ost'?"), och två rader betyder bara dubbelt
  // granskningsarbete plus risk att man svarar olika på samma fråga.
  const alla: Granskningsrad[] = [...karta].map(([från, till]) => {
    const hushåll = stapleÄndringar.filter(s => s.name === från).length;
    return {
      tabell: 'namn',
      nyckel: från,
      namn: hushåll > 1 ? `${från} (${hushåll} hushåll)` : från,
      till,
    };
  });



  if (SKRIV_FIL) {
    skrivGranskningsfil(SKRIV_FIL, alla, [
      '# Ändra ja till nej på de rader du vill lämna som de är.',
      '#',
      '# BLIR = det kortade namnet. Skriv dit ett eget namn om du hellre vill',
      '# det — ditt värde gäller före skriptets förslag.',
      '#',
      '# Stryk ingenting och ändra inget annat på raden.',
    ]);
    return;
  }

  if (!APPLY) {
    console.log('\nTorrkörning. Inget skrevs.');
    console.log('  --fil <sökväg>   skriver ALLA förslag till en textfil du granskar i Anteckningar');
    console.log('  --apply          tillämpar allt direkt (utan granskning)');
    return;
  }

  const valda = LÄS_FIL ? läsGranskningsfil(LÄS_FIL) : alla;

  // En rad = ett namn = båda tabellerna. Nyckeln är namnet, och valet gäller
  // aliaset OCH varje hushålls basvara med samma namn.
  const valdaNamn = new Map(valda.map(v => [v.nyckel, v.till]));
  const valdaAlias = valdaNamn;
  const valdaStaples = valdaNamn;

  // Bara de rader du sagt ja till, med namnet som står i filen.
  // Uppslag på CANONICAL, inte raw. Förslagen identifieras av det kanoniska
  // namnet (det är den gruppen som ska döpas om), och flera råa strängar kan
  // dela samma kanoniska form — "msk finrivet citronskal (+ ev extra)" och
  // "finrivet citronskal, rivet" ska bägge följa med när citronskal rättas.
  let antalAlias = 0;
  for (const [från, till] of valdaAlias) {
    antalAlias += (await prisma.ingredientAlias.updateMany({ where: { canonical: från }, data: { canonical: till } })).count;
  }

  // Valet gjordes på NAMNET och gäller varje hushåll som har varan. Själva
  // omdöpningen måste ändå ske rad för rad: krockar det nya namnet med en
  // befintlig basvara i samma hushåll ska de slås ihop, inte skrivas över.
  let antalStaples = 0;
  let antalIhopslagna = 0;
  for (const s of stapleÄndringar.filter(s => valdaStaples.has(s.name))) {
    const till = valdaStaples.get(s.name) as string;
    const befintlig = await prisma.stapleItem.findUnique({
      where: { householdId_name: { householdId: s.householdId, name: till } },
    });
    if (befintlig) {
      // Slå ihop: användningsräknarna adderas så "dina vanligaste" inte
      // nollställs av en omdöpning, och skräpraden försvinner.
      await prisma.stapleItem.update({
        where: { id: befintlig.id },
        data: { usageCount: befintlig.usageCount + s.usageCount },
      });
      await prisma.stapleItem.delete({ where: { id: s.id } });
      antalIhopslagna++;
    } else {
      await prisma.stapleItem.update({ where: { id: s.id }, data: { name: till } });
    }
    antalStaples++;
  }

  console.log(`\nKLART: ${antalAlias} alias omskrivna, ${antalStaples} basvaror rättade (${antalIhopslagna} ihopslagna).`);
  if (antalAlias < valdaAlias.size) {
    console.log(`\nVARNING: ${valdaAlias.size - antalAlias} namn i filen matchade ingen rad i databasen — filen kan vara föråldrad.`);
    console.log('Generera om den med --fil <sökväg> och granska på nytt.');
  }

  const hoppade = LÄS_FIL ? alla.length - valda.length : 0;
  if (hoppade > 0) {
    console.log(`\n${hoppade} rader stod på "nej" och lämnades orörda — med flit. De ligger kvar i`);
    console.log('databasen och kommer därför föreslås igen nästa gång skriptet körs.');
  }
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
