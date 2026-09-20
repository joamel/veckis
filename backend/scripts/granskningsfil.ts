/**
 * Granskningsfil för städskripten: skriptet föreslår, du bestämmer.
 *
 * Vanlig textfil, tänkt att öppnas i Anteckningar eller vilken editor som
 * helst — inget kalkylprogram behövs. Varje rad börjar med "ja" eller "nej".
 * Ändra "ja" till "nej" på raderna du inte vill ha. Stryk ingenting: en rad
 * som blivit "nej" går att ångra genom att skriva "ja" igen, och filen visar
 * i efterhand vad du valde bort.
 *
 * Fältordningen har nyckeln SIST med flit. Nyckeln är ibland själva varunamnet
 * och kan innehålla nästan vad som helst, inklusive avdelaren — läses den sist
 * kan resten av raden tas rakt av utan att tolkningen går sönder.
 */
import { readFileSync, writeFileSync } from 'node:fs';

export type Granskningsrad = {
  tabell: string;
  nyckel: string;
  namn: string;
  /** Vad raden blir om den tillämpas: en kategori, eller "RADERAS (skäl)". */
  till: string;
};

const AVDELARE = ' | ';

/** Avdelaren får inte förekomma i visningsfälten, bara i nyckeln (som står
 *  sist och därför inte kan förväxlas). */
function visning(v: string, bredd: number): string {
  return v.replace(/\|/g, '/').replace(/\s+/g, ' ').trim().padEnd(bredd);
}

/**
 * Nyckeln måste överleva resan till filen och tillbaka TECKEN FÖR TECKEN — den
 * används som uppslag i databasen, så minsta ändring gör att raden inte hittas.
 *
 * Problemet: för aliasrader ÄR nyckeln varunamnet, och de trasiga raderna vi
 * städar bort är hela ingredienslistor med radbrytningar i. Skrevs de rått
 * sprack posten över flera rader i filen, tolkningen fick en stympad nyckel,
 * och raderingen träffade noll rader — helt tyst, med "KLART" i utskriften.
 */
function kodaNyckel(v: string): string {
  return v
    .split("\\").join("\\" + "\\")
    .split("\r").join("\\" + "r")
    .split("\n").join("\\" + "n");
}

function avkodaNyckel(v: string): string {
  let ut = "";
  for (let i = 0; i < v.length; i++) {
    if (v[i] !== "\\" && true) { ut += v[i]; continue; }
    const nasta = v[++i];
    ut += nasta === "n" ? "\n" : nasta === "r" ? "\r" : nasta ?? "";
  }
  return ut;
}

export function skrivGranskningsfil(sökväg: string, rader: Granskningsrad[]): void {
  const innehåll = [
    '# GRANSKNINGSFIL',
    '#',
    '# Varje rad nedan är ett förslag. Raden börjar med ja eller nej:',
    '#   ja  = gör det som står i BLIR-kolumnen',
    '#   nej = låt varan vara som den är',
    '#',
    '# Ändra ja till nej på de rader du inte vill ha. Stryk ingenting, och',
    '# ändra inget annat på raden. Spara sedan filen och kör om kommandot med',
    '#   --från-fil <den här filen> --apply',
    '#',
    '# svar | tabell  | blir                      | namn                           | nyckel',
    '# ' + '-'.repeat(100),
    ...rader.map(r =>
      ['ja ', visning(r.tabell, 7), visning(r.till, 25), visning(r.namn, 30), kodaNyckel(r.nyckel)].join(AVDELARE)
    ),
  ];
  writeFileSync(sökväg, innehåll.join('\r\n') + '\r\n', 'utf8');

  console.log(`\nSkrev ${rader.length} förslag till ${sökväg}`);
  console.log('\nSÅ HÄR GÖR DU:');
  console.log(`  1. Öppna filen i Anteckningar:  notepad ${sökväg}`);
  console.log('  2. Varje rad börjar med "ja". Ändra till "nej" på de rader du INTE vill ha.');
  console.log('  3. Stryk ingenting, ändra inget annat på raden.');
  console.log('  4. Spara, och kör om samma kommando med:  --från-fil <sökväg> --apply');
}

export function läsGranskningsfil(sökväg: string): Granskningsrad[] {
  const valda: Granskningsrad[] = [];
  let hoppade = 0;

  for (const rad of readFileSync(sökväg, 'utf8').split(/\r?\n/)) {
    if (!rad.trim() || rad.trimStart().startsWith('#')) continue;

    // Fyra avdelare, resten är nyckeln — som får innehålla avdelaren själv.
    const delar = rad.split(AVDELARE);
    if (delar.length < 5) continue;
    const [svar, tabell, till, namn] = delar;
    const nyckel = avkodaNyckel(delar.slice(4).join(AVDELARE));

    const jaNej = svar.trim().toLowerCase();
    if (jaNej !== 'ja') { hoppade++; continue; }

    valda.push({ tabell: tabell.trim(), nyckel, namn: namn.trim(), till: till.trim() });
  }

  console.log(`Läste ${sökväg}: ${valda.length} rader att tillämpa, ${hoppade} överhoppade.`);
  return valda;
}

/**
 * Skriver ut vilket LÄGE skriptet kör i, och stoppar kombinationer som inte
 * betyder något.
 *
 * Utan det här var skripten tysta om sitt eget läge, och två vanliga misstag
 * såg likadana ut som "det funkar inte": att skicka med både --fil och
 * --från-fil (då skrevs filen bara om, och inget tillämpades), och att glömma
 * --apply (då var det en torrkörning). I bägge fallen låg raderna kvar och
 * filen såg identisk ut efteråt.
 */
export function lägeskontroll(opts: { skrivFil: string | null; läsFil: string | null; apply: boolean }): void {
  const { skrivFil, läsFil, apply } = opts;

  if (skrivFil && läsFil) {
    console.error('STOPP: --fil och --från-fil kan inte kombineras.');
    console.error('  --fil <sökväg>       skriver förslagen till en fil du granskar');
    console.error('  --från-fil <sökväg>  läser din granskade fil och tillämpar den (kräver --apply)');
    process.exit(1);
  }

  if (läsFil && !apply) {
    console.error('STOPP: --från-fil utan --apply gör ingenting.');
    console.error(`  Lägg till --apply för att faktiskt skriva: --från-fil ${läsFil} --apply`);
    process.exit(1);
  }

  if (skrivFil) console.log(`LÄGE: skriver granskningsfil till ${skrivFil}. Inget ändras i databasen.\n`);
  else if (läsFil) console.log(`LÄGE: tillämpar dina val ur ${läsFil}. Databasen ÄNDRAS.\n`);
  else if (apply) console.log('LÄGE: tillämpar ALLT skriptet föreslår, utan granskning. Databasen ÄNDRAS.\n');
  else console.log('LÄGE: rapport. Inget ändras. Lägg till --fil <sökväg> för att granska, eller --apply för att köra allt.\n');
}
