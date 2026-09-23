/**
 * Tolkning av EN rad som beskriver en vara: "2 dl mjöl", "1 dl havregryn",
 * "havregryn 1 dl", "mjölk x2".
 *
 * Ligger i shared eftersom BÅDA sidorna måste tolka likadant. Låg den bara i
 * backend hann appen visa och spara fel: mängdarket öppnades med hela
 * strängen som varunamn, och basvaran lärdes in som "1 dl havregryn" — servern
 * rättade varan efteråt, men ordförrådet hade redan fått skräp.
 */
import { normalizeUnit } from './unitSynonyms';

// Måttenheter som känns igen mellan mängd och namn ("2 dl mjöl", "1 cup sugar").
// Håll i synk med UNITS i stripIngredient.ts. Amerikanska/brittiska enheter
// sparas RÅTT (ej konverterade) — se @veckis/shared unitConversion.ts för
// den explicita "↔"-konverteringen användaren kan trycka på i UI:t.
const UNITS = new Set([
  'dl', 'ml', 'l', 'liter', 'cl', 'msk', 'tsk', 'krm', 'g', 'kg', 'hg', 'st',
  'port', 'burk', 'förp', 'pkt', 'paket', 'påse', 'näve', 'skiva', 'skivor',
  'cup', 'cups', 'tsp', 'tbsp', 'teaspoon', 'teaspoons', 'tablespoon', 'tablespoons',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'pint', 'pints', 'quart', 'quarts', 'gallon', 'gallons',
  'stick', 'sticks', 'clove', 'cloves', 'pinch', 'dash',
  'can', 'cans', 'package', 'packages', 'slice', 'slices',
]);

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

// Matchar, i tur och ordning: blandat tal med snedstreck ("1 3/4"), blandat tal
// med unicode-bråk ("1 ¾" och hopskrivet "1¾"), enkelt bråk ("1/2"), tal med
// komma/punkt/intervall ("1,5" / "1.5" / "3-4"), eller ett ensamt
// unicode-bråktecken ("½"). Mellanslaget i det blandade talet MÅSTE ingå i
// samma grupp — annars matchar "1"-alternativet ensamt och bråkdelen blir
// kvar i resten av strängen som om den vore en del av namnet.
//
// Unicode-varianten saknades länge, trots att kommentaren ovan redan beskrev
// fällan för snedstrecks-varianten: sajter som skriver "1 ¾ cup" gav mängden 1
// och namnet "¾ cup all-purpose flour".
const QTY_RE = /^(\d+\s+\d+\/\d+|\d+\s*[½¼¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|[\d,.\-–]+|[½¼¾⅓⅔⅛⅜⅝⅞])\s*/u;

function parseFractionToken(token: string): number | null {
  if (token in UNICODE_FRACTIONS) return UNICODE_FRACTIONS[token];
  const slash = token.match(/^(\d+)\/(\d+)$/);
  if (slash) {
    const den = parseInt(slash[2], 10);
    return den === 0 ? null : parseInt(slash[1], 10) / den;
  }
  const n = parseFloat(token.replace(',', '.').replace(/[\-–]/, '.'));
  return isNaN(n) ? null : n;
}

export function parseQuantity(raw: string): number | null {
  const s = raw.trim();
  // Snedstrecks-varianten KRÄVER mellanslag: utan det vore "13/4" tvetydigt och
  // skulle läsas som 1 + 3/4. Unicode-varianten är entydig (bråket är ett enda
  // tecken som inte är en siffra) och skrivs ofta ihop, så där är det valfritt.
  const mixed = s.match(/^(\d+)(?:\s+(\d+\/\d+)|\s*([½¼¾⅓⅔⅛⅜⅝⅞]))$/u);
  if (mixed) {
    const frac = parseFractionToken(mixed[2] ?? mixed[3]);
    return frac === null ? parseInt(mixed[1], 10) : parseInt(mixed[1], 10) + frac;
  }
  return parseFractionToken(s);
}

/**
 * Delar upp en receptrad ("1/2 cup salted butter, softened", "2 dl mjöl") i
 * mängd, enhet och namn. Enheten matchas som ETT ord — tidigare försökte
 * regexen giriga fånga upp till två ord som enhet, vilket fick en enda
 * engelsk enhet ("cup") att smälta ihop med nästa ord i en flerordsbeskrivning
 * ("salted butter") till en okänd "enhet" som aldrig kändes igen, och hela
 * biten hamnade i namnet i stället.
 */
export function parseIngredientString(raw: string): { name: string; quantity: number | null; unit: string | null } {
  const s = raw.trim();
  const qtyMatch = s.match(QTY_RE);
  if (!qtyMatch) return { name: s, quantity: null, unit: null };

  const quantity = parseQuantity(qtyMatch[1]);
  const rest = s.slice(qtyMatch[0].length);

  const unitMatch = rest.match(/^([a-zA-ZåäöÅÄÖ]+)\.?\s+/u);
  const rawUnit = unitMatch?.[1].toLowerCase();

  if (rawUnit && UNITS.has(rawUnit)) {
    return { name: rest.slice(unitMatch![0].length).trim(), quantity, unit: rawUnit };
  }
  return { name: rest.trim(), quantity, unit: null };
}

// Enheter som kan stå EFTER namnet: "mjölk 2 l", "ägg 12 st".
const TRAILING_UNITS = 'dl|ml|l|liter|cl|gr|gram|g|kg|hg|st|burk|burkar|förp|pkt|paket|påse|påsar|flaska|flaskor';
// "mjölk 2 l", "mjölk 2", "mjölk x2", "mjölk 2x", "mjölk (2)".
const TRAILING_RE = new RegExp(`^(.+?)\\s+\\(?(?:x\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(?:x|(${TRAILING_UNITS}))?\\)?$`, 'iu');
// "2x mjölk", "2 x mjölk".
const LEADING_X_RE = /^(\d+)\s*x\s+(.+)$/iu;
// Punktlistor, kryssrutor och numrering som andra appar sätter framför raden.
const PREFIX_RE = /^\s*(?:[-*•·–—+>]+|\[\s*[xX✓✔]?\s*\]|[☐☑☒✓✔❏❑❒▢□▪▫■●○]|\d+[.)](?=\s))\s*/u;

export type ParsedItemLine = { name: string; quantity: number | null; unit: string | null };

/**
 * En rad → namn, mängd och enhet. Mängden läses både före namnet ("1 dl
 * havregryn") och efter ("havregryn 1 dl", "ägg 12 st", "mjölk x2").
 * Raden delas aldrig — det är listimportens jobb, inte radens.
 */
export function parseItemLine(text: string): ParsedItemLine {
  let line = text.trim();
  // Prefixen kan vara flera ("- [ ] mjölk").
  for (let i = 0; i < 3; i++) line = line.replace(PREFIX_RE, '');
  line = line.replace(/[.,;:!]+$/u, '').trim();
  if (!line) return { name: text.trim(), quantity: null, unit: null };

  const leadingX = line.match(LEADING_X_RE);
  if (leadingX) return { name: leadingX[2].trim(), quantity: Number(leadingX[1]), unit: null };

  const leading = parseIngredientString(line);
  if (leading.quantity !== null && leading.name) return { ...leading, unit: normalizeUnit(leading.unit) };

  const trailing = line.match(TRAILING_RE);
  if (trailing && /\p{L}/u.test(trailing[1])) {
    const quantity = parseFloat(trailing[2].replace(',', '.'));
    const unit = trailing[3]?.toLowerCase();
    return {
      name: trailing[1].trim(),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
      unit: normalizeUnit(unit),
    };
  }
  return { name: line, quantity: null, unit: null };
}
