/**
 * Hittar hushållets EGET namn på en vara som stavats annorlunda.
 *
 * AI-kanoniseringen (normalizeIngredients.ts) rättar omskrivningar och
 * varumärken, men inte stavfel — och den ska inte gissa sig till dem heller.
 * Den här matchningen jämför i stället mot det hushållet redan har: "mozarella"
 * mot "mozzarella", "creme fraise" mot "crème fraiche". Hittas inget blir
 * namnet en ny vara, som vanligt.
 *
 * Hellre missa än matcha fel: en felaktig ihopslagning är svår att upptäcka
 * (varan ser ut att finnas), medan en dubblett syns direkt i listan och redan
 * har ett ark för att slås ihop.
 */

/** Gemener, utan diakriter och skiljetecken — "Crème fraîche" → "creme fraiche". */
export function normaliseraForJamforelse(namn: string): string {
  return namn
    .toLowerCase()
    // ø och æ har inga diakriter att plocka bort (de är egna bokstäver), så
    // de måste översättas — annars föll ø bort helt ur "køttbullar".
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    // å, ä och ö plattas till a, a och o. Avsiktligt: det är det som gör att
    // dansk och engelsk stavning ("kottbullar") hittar den svenska varan.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9åäö\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let rad = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const ny = [i];
    for (let j = 1; j <= b.length; j++) {
      ny[j] = Math.min(
        rad[j] + 1,
        ny[j - 1] + 1,
        rad[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    rad = ny;
  }
  return rad[b.length];
}

/** 1 = identiska, 0 = inget gemensamt. */
export function likhet(a: string, b: string): number {
  const x = normaliseraForJamforelse(a);
  const y = normaliseraForJamforelse(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/** Under så här många tecken blir varje avvikelse för stor andel — "ris" och
 *  "ris­p" skulle matcha "risp", och "te" matchar "tre". */
const MIN_LANGD = 5;
/** Vald efter en riktig lista: "mozarella"→"mozzarella" (0,90), "creme
 *  fraise"→"creme fraiche" (0,85) och "kanelstänger"→"kanelstång" (0,83) ska
 *  matcha, medan "rödlök"→"gul lök" (0,57) och "kanel"→"kanelstång" (0,50)
 *  inte får göra det. */
const TROSKEL = 0.82;

/**
 * Bästa kandidaten, eller null. Kräver samma första bokstav: de flesta
 * stavfel sitter inne i ordet, och kravet stoppar korta ord från att glida
 * över till en annan vara.
 */
export function hittaLiknande(namn: string, kandidater: string[], troskel = TROSKEL): string | null {
  const n = normaliseraForJamforelse(namn);
  if (n.length < MIN_LANGD) return null;

  let bäst: string | null = null;
  let bästPoäng = 0;
  for (const k of kandidater) {
    const kn = normaliseraForJamforelse(k);
    if (kn.length < MIN_LANGD || kn[0] !== n[0]) continue;
    const poäng = likhet(n, kn);
    if (poäng > bästPoäng) { bästPoäng = poäng; bäst = k; }
  }
  return bästPoäng >= troskel ? bäst : null;
}
