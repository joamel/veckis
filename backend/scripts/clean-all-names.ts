/**
 * Listar ALLA varunamn för manuell genomgång.
 *
 * De andra skripten gissar vad som är fel — det här gissar ingenting. Varje
 * namn i ingredienspoolen och hushållens basvaror kommer med, och du bestämmer
 * rad för rad. Heuristik missar saker ("lax utan skinn och ben",
 * "kycklingfond, koncentrerad"), och då är en fullständig lista det enda
 * ärliga verktyget.
 *
 * I granskningsfilen gör du ett av tre:
 *   - lämna BLIR som det står  → ingenting händer
 *   - skriv ett nytt namn      → varan döps om, överallt
 *   - skriv RADERA             → namnet tas bort ur poolen och basvarorna
 *
 * Varor som tillkommit sedan förra genomgången hamnar ÖVERST, märkta [ny], så
 * du slipper leta igenom hela listan igen. "Genomgången" är när du senast
 * TILLÄMPADE en fil — att bara skriva en fil räknas inte, eftersom du då inte
 * nödvändigtvis har läst den. Har du inget att ändra: tillämpa filen ändå, så
 * räknas raderna som genomgångna.
 *
 * Nej-listan som de andra skripten delar används INTE här. Den här filen är
 * hela listan, och en rad som saknas betyder "radera" — med nej-listan saknades
 * varor man sagt nej till i ett annat skript, och tillämpningen raderade dem.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { visaMåldatabas } from './visaDb';
import { skrivGranskningsfil, läsGranskningsfil, lägeskontroll, type Granskningsrad } from './granskningsfil';
import { duglingGlobalt } from '../src/lib/normalizeIngredients';
import { categorizeIngredient } from '../src/lib/categorizeIngredient';
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

const RADERA = 'RADERA';

/**
 * Minnet av vilka namn som fanns när du senast gick igenom listan. En fil per
 * databas: lokalt och prod har olika varor, och en genomgång av den ena säger
 * ingenting om den andra. Adressen hashas, så inget lösenord hamnar på disk.
 */
function senastFil(): string {
  let nyckel = 'env';
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    nyckel = `${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch { /* DATABASE_URL saknas — Prisma läser .env */ }
  const hash = createHash('sha1').update(nyckel).digest('hex').slice(0, 10);
  return join(dirname(fileURLToPath(import.meta.url)), `.clean-all-senast-${hash}.txt`);
}

/** null = ingen genomgång än, och då är inget "nytt". */
function läsSenastGenomgångna(): Set<string> | null {
  const fil = senastFil();
  if (!existsSync(fil)) return null;
  return new Set(readFileSync(fil, 'utf8').split('\n').filter(Boolean));
}

async function sparaGenomgångna(): Promise<void> {
  const namn = new Set<string>();
  for (const a of await prisma.ingredientAlias.findMany({ select: { canonical: true } })) namn.add(a.canonical.trim());
  for (const s of await prisma.stapleItem.findMany({ select: { name: true } })) namn.add(s.name.trim());
  writeFileSync(senastFil(), [...namn].filter(Boolean).join('\n') + '\n', 'utf8');
}

async function main() {
  visaMåldatabas();
  lägeskontroll({ skrivFil: SKRIV_FIL, läsFil: LÄS_FIL, apply: APPLY });

  // Alias och basvaror i EN lista — ett namn ska se likadant ut överallt.
  const förekomster = new Map<string, { alias: number; hushåll: number }>();
  const räkna = (namn: string, sort: 'alias' | 'hushåll') => {
    const n = namn.trim();
    if (!n) return;
    const nu = förekomster.get(n) ?? { alias: 0, hushåll: 0 };
    nu[sort]++;
    förekomster.set(n, nu);
  };

  for (const a of await prisma.ingredientAlias.findMany({ select: { canonical: true } })) räkna(a.canonical, 'alias');

  // Basvaror bär hushållets EGNA val: kategori och underkategori som någon
  // satt för hand. Raderas namnet försvinner det valet, till skillnad från
  // själva ordförrådet som lärs in igen nästa gång varan används. Markera
  // därför vilka rader som innehåller ett sådant val.
  const egetVal = new Set<string>();
  for (const s of await prisma.stapleItem.findMany({ select: { name: true, category: true, subCategory: true } })) {
    räkna(s.name, 'hushåll');
    const reglernasSvar = categorizeIngredient(s.name);
    if (s.subCategory || (s.category !== 'other' && s.category !== reglernasSvar)) egetVal.add(s.name.trim());
  }

  // --översätt: fyll i BLIR med en svensk översättning för namn som ser
  // engelska ut. Ordförrådet ska vara svenskt — engelskan kom in via importer
  // medan översättningen var trasig. Förslaget granskas som allt annat; du ser
  // både originalet och översättningen på raden innan något skrivs.
  const översättningar = new Map<string, string>();
  if (args.has('--översätt') || args.has('--oversatt')) {
    const namnen = [...förekomster.keys()];
    const engelska = namnen.filter(n => serEngelsktUt([n]));
    console.log(`${engelska.length} namn ser engelska ut — översätter...`);
    const svenska = await översättIngrediensnamn(engelska);
    engelska.forEach((n, i) => {
      const s = (svenska[i] ?? n).trim();
      if (s && s.toLowerCase() !== n.toLowerCase()) översättningar.set(n, s);
    });
    console.log(`${översättningar.size} fick en svensk form.\n`);
  }

  // Nytt sedan förra genomgången först, sedan resten — var för sig i
  // bokstavsordning.
  const genomgångna = läsSenastGenomgångna();
  const ärNy = (namn: string) => genomgångna !== null && !genomgångna.has(namn);

  const rader: Granskningsrad[] = [...förekomster]
    .sort((a, b) => Number(ärNy(b[0])) - Number(ärNy(a[0])) || a[0].localeCompare(b[0], 'sv'))
    .map(([namn, f]) => ({
      // Markera vad som FAKTISKT syns i sökningen. Rader som ändå filtreras
      // bort (alternativ-strängar, mängdprefix) är ofarliga där de ligger, och
      // då behöver man inte lägga tid på dem. Resten möter användarna.
      tabell: duglingGlobalt(namn) ? 'namn' : 'dold',
      nyckel: namn,
      namn: [
        ärNy(namn) ? '[ny]' : '',
        namn,
        f.hushåll > 0 ? `(${f.hushåll} hushåll)` : '',
        egetVal.has(namn) ? '[eget val]' : '',
      ].filter(Boolean).join(' '),
      // BLIR = nuvarande namn, eller en översättning om --översätt användes.
      // Lämnas det orört händer ingenting; det är meningen, eftersom de flesta
      // raderna är helt i sin ordning.
      till: översättningar.get(namn) ?? namn,
    }));

  const dolda = rader.filter(r => r.tabell === 'dold');
  console.log(`${rader.length} unika varunamn, varav ${dolda.length} redan dolda i sökningen.`);
  if (genomgångna === null) {
    console.log('Ingen tidigare genomgång mot den här databasen — efter nästa tillämpning märks nya varor [ny] och hamnar överst.\n');
  } else {
    const antalNya = rader.filter(r => ärNy(r.nyckel)).length;
    console.log(`${antalNya} nya sedan förra genomgången — de ligger överst, märkta [ny].\n`);
  }

  // Genväg för de dolda: de syns inte för någon, och alternativen bakom dem
  // lärs numera in var för sig — raderna är döda men tar plats i granskningen.
  // Att radera dem för hand vore hundratals tangenttryck utan beslut i.
  if (args.has('--radera-dolda')) {
    if (!APPLY) {
      console.log(`Torrkörning: ${dolda.length} dolda namn skulle raderas. Lägg till --apply.`);
      for (const d of dolda.slice(0, 20)) console.log(`   - ${d.nyckel}`);
      if (dolda.length > 20) console.log(`   ... och ${dolda.length - 20} till.`);
      return;
    }
    for (const d of dolda) await taBort(d.nyckel);
    console.log(`KLART: ${dolda.length} dolda namn raderade.`);
    return;
  }


  if (!SKRIV_FIL) {
    for (const r of rader.slice(0, 40)) console.log(`   ${r.namn}`);
    if (rader.length > 40) console.log(`   ... och ${rader.length - 40} till.`);
    console.log('\nFör att gå igenom dem:');
    console.log('  --fil <sökväg>   skriver ALLA namn till en textfil du redigerar');
    console.log(`  I filen: skriv ett nytt namn i BLIR för att döpa om, eller ${RADERA} för att ta bort.`);
    return;
  }

  skrivGranskningsfil(SKRIV_FIL, rader, [
    '# Filen är listan över dina varor. Tre saker kan du göra med en rad:',
    '#',
    '#   lämna raden som den är      → varan behålls oförändrad',
    '#   skriv ett nytt namn i BLIR  → varan döps om, i poolen och alla hushåll',
    '#   ta bort hela raden          → varan raderas',
    '#',
    '# Att radera en rad tar alltså bort varan. Försvinner ovanligt många rader',
    '# stoppar skriptet och frågar, så en avhuggen fil inte tömmer databasen.',
    '#',
    '# Kolumnen TABELL säger om namnet syns för användarna:',
    '#   namn = föreslås i sökningen — de här är värda att städa',
    '#   dold = filtreras redan bort (alternativ, mängdprefix) och gör ingen skada',
    '#',
    '# [eget val] betyder att något hushåll själv satt kategori eller hylla för',
    '# varan. Raderas raden försvinner det valet. Recept och inköpslistor rörs',
    '# aldrig — bara ordförrådet och basvarorna.',
    '#',
    '# [ny] = tillkommen sedan du senast tillämpade en fil. De ligger överst.',
    '# Tillämpa filen även om du inte ändrat något, så räknas de som genomgångna.',
  ], { nejlista: false });
  console.log(`\n  Nytt namn i BLIR = döp om. Ta bort raden = radera varan. Orörd rad = behåll.`);
}

/** Alla namn som står i filen, oavsett ja/nej — allt annat räknas som raderat. */
function namnIFilen(sökväg: string): Set<string> {
  const namn = new Set<string>();
  for (const rad of readFileSync(sökväg, 'utf8').split(/\r?\n/)) {
    if (!rad.trim() || rad.trimStart().startsWith('#')) continue;
    const delar = rad.split(' | ');
    if (delar.length >= 5) namn.add(delar.slice(4).join(' | '));
  }
  return namn;
}

async function taBort(namn: string): Promise<void> {
  const rawn = (await prisma.ingredientAlias.findMany({ where: { canonical: namn }, select: { raw: true } })).map(a => a.raw);
  if (rawn.length > 0) {
    await prisma.ingredientAliasHousehold.deleteMany({ where: { raw: { in: rawn } } });
    await prisma.ingredientAlias.deleteMany({ where: { raw: { in: rawn } } });
  }
  await prisma.stapleItem.deleteMany({ where: { name: namn } });
}

async function tillämpa() {
  const valda = läsGranskningsfil(LÄS_FIL as string, { nejlista: false });
  const kvarIFilen = namnIFilen(LÄS_FIL as string);

  // Rader du tagit bort ur filen = varor som ska bort. Men en avhuggen eller
  // halvsparad fil ser likadan ut som ett medvetet val, och skillnaden är
  // hela databasen. Därför en spärr vid orimligt många försvunna rader.
  const alla = new Set<string>();
  for (const a of await prisma.ingredientAlias.findMany({ select: { canonical: true } })) alla.add(a.canonical.trim());
  for (const s of await prisma.stapleItem.findMany({ select: { name: true } })) alla.add(s.name.trim());

  const saknade = [...alla].filter(n => n && !kvarIFilen.has(n));
  const andel = alla.size === 0 ? 0 : saknade.length / alla.size;

  if (andel > 0.3 && !args.has('--ja-radera-alla-saknade')) {
    console.error(`\nSTOPP: ${saknade.length} av ${alla.size} namn saknas i filen (${Math.round(andel * 100)} %).`);
    console.error('Det ser mer ut som en avhuggen fil än som ett medvetet val.');
    console.error('Är det verkligen meningen: lägg till --ja-radera-alla-saknade');
    process.exit(1);
  }

  let omdöpta = 0;
  let raderade = 0;
  let orörda = 0;

  for (const namn of saknade) {
    await taBort(namn);
    raderade++;
  }

  for (const v of valda) {
    const från = v.nyckel;
    const till = v.till.trim();

    if (till === från) { orörda++; continue; }

    if (till.toUpperCase() === RADERA) {
      await taBort(från);
      raderade++;
      continue;
    }

    await prisma.ingredientAlias.updateMany({ where: { canonical: från }, data: { canonical: till } });
    for (const s of await prisma.stapleItem.findMany({ where: { name: från } })) {
      const befintlig = await prisma.stapleItem.findUnique({
        where: { householdId_name: { householdId: s.householdId, name: till } },
      });
      if (befintlig) {
        await prisma.stapleItem.update({ where: { id: befintlig.id }, data: { usageCount: befintlig.usageCount + s.usageCount } });
        await prisma.stapleItem.delete({ where: { id: s.id } });
      } else {
        await prisma.stapleItem.update({ where: { id: s.id }, data: { name: till } });
      }
    }
    omdöpta++;
  }

  // Allt som finns kvar nu har du sett — nästa lista märker bara det som
  // tillkommer efter det här.
  await sparaGenomgångna();
  console.log(`\nKLART: ${omdöpta} namn omdöpta, ${raderade} raderade, ${orörda} lämnade som de var.`);
}

(LÄS_FIL && APPLY ? (async () => { visaMåldatabas(); lägeskontroll({ skrivFil: SKRIV_FIL, läsFil: LÄS_FIL, apply: APPLY }); await tillämpa(); })() : main())
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
