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
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

/**
 * nejlista: false stänger av minnet av dina "nej" för ett skript. Det behövs
 * där filen ÄR hela listan och en saknad rad betyder "radera" — som i
 * clean:all. Där raderade minnet tyst varor: ett nej till "riven ost → ost" i
 * clean:names gjorde att "riven ost" saknades i clean:all:s fil, och att
 * tillämpa den filen tog bort varan man just sagt att man ville behålla.
 */
export type NejOpt = { nejlista?: boolean };

export function skrivGranskningsfil(sökväg: string, rader: Granskningsrad[], egnaInstruktioner?: string[], opt: NejOpt = {}): void {
  // Skriv ALDRIG över en fil du redan redigerat. Kördes generera-steget en
  // gång till efter granskningen nollställdes alla "nej" till "ja" utan ett
  // ord, och nästa apply gjorde tvärtemot vad du bestämt.
  // Skriv över utan att fråga. En spärr fanns här ett tag, men den var mest i
  // vägen: antingen har man redan tillämpat filen, eller så vill man ha en
  // färsk lista. Dessutom minns skripten numera vad man sagt nej till
  // (.nej-lista.txt), så de valen överlever en omgenerering.
  //
  // Den gamla filen sparas ändå undan. Har man hunnit redigera utan att
  // tillämpa är de valen inte sparade någonstans annars, och en kopia kostar
  // ingenting.
  if (existsSync(sökväg)) {
    const kopia = `${sökväg}.föregående`;
    copyFileSync(sökväg, kopia);
    console.log(`Skriver över ${resolve(sökväg)} (förra versionen sparad som ${kopia})`);
  }

  // Hoppa över det du redan sagt nej till en gång.
  if (opt.nejlista !== false) {
    const { kvar, hoppade } = utanTidigareNej(rader);
    if (hoppade > 0) console.log(`\n${hoppade} rader hoppades över — du har sagt nej till dem tidigare.`);
    rader = kvar;
  }

  const innehåll = [
    '# GRANSKNINGSFIL',
    '#',
    '# Varje rad nedan är ett förslag. Raden börjar med ja eller nej:',
    '#   ja  = gör det som står i BLIR-kolumnen',
    '#   nej = låt varan vara som den är',
    '#',
    ...(egnaInstruktioner ?? [
      '# Ändra ja till nej på de rader du inte vill ha.',
      '#',
      '# Du kan också SKRIVA ÖVER kolumnen BLIR med det värde du vill ha — det',
      '# är ditt värde som tillämpas, inte skriptets förslag. Håller du inte med',
      '# om "canned_dry" skriver du dit "special_diet" och låter raden stå på ja.',
      '#',
      '# Stryk ingenting och ändra inget annat på raden (namnet och nyckeln sist',
      '# används för att hitta rätt rad).',
    ]),
    '#',
    '# Kolumnerna avdelas med mellanslag-rörtecken-mellanslag ( | ). Bredden',
    '# spelar ingen roll — skriv kort eller långt, bara avdelarna står kvar.',
    '#',
    '# Spara sedan filen och kör om med',
    '#   --från-fil <den här filen> --apply',
    '#',
    '# svar | tabell  | blir                      | namn                           | nyckel',
    '# ' + '-'.repeat(100),
    ...rader.map(r =>
      ['ja ', visning(r.tabell, 7), visning(r.till, 25), visning(r.namn, 30), kodaNyckel(r.nyckel)].join(AVDELARE)
    ),
  ];
  writeFileSync(sökväg, innehåll.join('\r\n') + '\r\n', 'utf8');

  // Absolut sökväg: en relativ sökväg skrivs dit skriptet KÖRS ifrån, vilket
  // inte alltid är där man letar efter filen.
  console.log(`\nSkrev ${rader.length} förslag till ${resolve(sökväg)}`);
  console.log('\nSÅ HÄR GÖR DU:');
  console.log(`  1. Öppna filen i Anteckningar:  notepad ${resolve(sökväg)}`);
  console.log('  2. Varje rad börjar med "ja". Ändra till "nej" på de rader du INTE vill ha.');
  console.log('  3. Håller du inte med om kategorin i BLIR-kolumnen: skriv dit rätt kategori i stället.');
  console.log('  4. Stryk ingenting, ändra inget annat på raden.');
  console.log('  5. Spara, och kör om samma kommando med:  --från-fil <sökväg> --apply');
}

export function läsGranskningsfil(sökväg: string, opt: NejOpt = {}): Granskningsrad[] {
  const valda: Granskningsrad[] = [];
  const avvisade: Granskningsrad[] = [];
  let hoppade = 0;

  for (const rad of readFileSync(sökväg, 'utf8').split(/\r?\n/)) {
    if (!rad.trim() || rad.trimStart().startsWith('#')) continue;

    // Fyra avdelare, resten är nyckeln — som får innehålla avdelaren själv.
    const delar = rad.split(AVDELARE);
    if (delar.length < 5) continue;
    const [svar, tabell, till, namn] = delar;
    const nyckel = avkodaNyckel(delar.slice(4).join(AVDELARE));

    const jaNej = svar.trim().toLowerCase();
    if (jaNej !== 'ja') {
      hoppade++;
      avvisade.push({ tabell: tabell.trim(), nyckel, namn: namn.trim(), till: till.trim() });
      continue;
    }

    valda.push({ tabell: tabell.trim(), nyckel, namn: namn.trim(), till: till.trim() });
  }

  console.log(`Läste ${sökväg}: ${valda.length} rader att tillämpa, ${hoppade} överhoppade.`);
  if (opt.nejlista !== false) kommIhågNej(avvisade);
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

/**
 * Minnet av dina "nej".
 *
 * Utan det kom varje avvisad rad tillbaka i nästa körning, med "ja" ifyllt
 * igen — och en lista på hundratals rader blir då omöjlig att beta av: man
 * måste göra om samma bedömningar varje gång. Nu skrivs de bort man sagt nej
 * till undan, och nästa körning hoppar över dem.
 *
 * Filen ligger bredvid skripten och är per maskin, eftersom det är samma
 * person som kör dem. Vill du börja om: radera den.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NEJ_FIL = join(dirname(fileURLToPath(import.meta.url)), '.nej-lista.txt');

/** Nyckel som identifierar en rad över tid: tabell + nyckeln i den tabellen. */
function nejNyckel(r: Granskningsrad): string {
  return `${r.tabell}\t${r.nyckel}`;
}

export function läsNejlista(): Set<string> {
  if (!existsSync(NEJ_FIL)) return new Set();
  return new Set(
    readFileSync(NEJ_FIL, 'utf8')
      .split(/\r?\n/)
      .map(r => r.trim())
      .filter(r => r && !r.startsWith('#'))
  );
}

/** Lägger till raderna som stod på "nej" i minnet. Idempotent. */
export function kommIhågNej(rader: Granskningsrad[]): void {
  if (rader.length === 0) return;
  const redan = läsNejlista();
  const nya = rader.map(nejNyckel).filter(n => !redan.has(n));
  if (nya.length === 0) return;

  const huvud = existsSync(NEJ_FIL)
    ? ''
    : '# Rader du sagt nej till. Skripten hoppar över dem.\n# Radera filen för att börja om.\n';
  writeFileSync(NEJ_FIL, huvud + [...redan, ...nya].join('\n') + '\n', 'utf8');
  console.log(`\n${nya.length} nej sparades — de föreslås inte igen.`);
  console.log(`(Ångra: radera ${NEJ_FIL})`);
}

/** Filtrerar bort rader du tidigare sagt nej till. */
export function utanTidigareNej(rader: Granskningsrad[]): { kvar: Granskningsrad[]; hoppade: number } {
  const nej = läsNejlista();
  if (nej.size === 0) return { kvar: rader, hoppade: 0 };
  const kvar = rader.filter(r => !nej.has(nejNyckel(r)));
  return { kvar, hoppade: rader.length - kvar.length };
}
