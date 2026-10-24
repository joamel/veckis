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
/** Ordet före mängden. Receptet skriver "ca 13 dl" eller "ev. 1 dl" för att
 *  mängden är en känsla eller ett tillval — det ska synas i receptet, inte
 *  strykas. Inköpslistan räknar ändå med talet. */
export type AmountQualifier = 'ca' | 'drygt' | 'knappt' | 'ev.';
export const AMOUNT_QUALIFIERS: readonly AmountQualifier[] = ['ca', 'drygt', 'knappt', 'ev.'];

// "ca 13 dl vetemjöl": ordet gjorde förut hela raden till ett namn utan mängd.
// Varianterna samlas till fyra ord. "ev." får stå utan mängd ("ev. salt").
const QUALIFIER_RE = /^(ca\.?|c:a|cirka|ungefär|ung\.|about|approx\.?|approximately|~|drygt|knappt|ev\.?|eventuellt|optional)(?:\s+|$|(?=\d|[½¼¾⅓⅔⅛⅜⅝⅞]))/iu;

function tillQualifier(ord: string): AmountQualifier {
  const o = ord.toLowerCase();
  if (o === 'drygt') return 'drygt';
  if (o === 'knappt') return 'knappt';
  if (o.startsWith('ev') || o === 'optional') return 'ev.';
  return 'ca';
}

/** Plockar av ordet före mängden. Utom "ev." gäller ordet bara när en mängd
 *  följer — "cashewnötter" och "ca" i "cayennepeppar" rörs inte. */
export function splitQualifier(text: string): { qualifier: AmountQualifier | null; rest: string } {
  const s = text.trim();
  const m = s.match(QUALIFIER_RE);
  if (!m) return { qualifier: null, rest: s };
  const qualifier = tillQualifier(m[1]);
  const rest = s.slice(m[0].length).trim();
  if (qualifier !== 'ev.' && !/^(\d|[½¼¾⅓⅔⅛⅜⅝⅞])/u.test(rest)) return { qualifier: null, rest: s };
  return { qualifier, rest };
}

// "1–2 tsk salt", "3-4 tomater". Lästes förut som decimaltalet 1,2. Nu sparas
// båda: quantity är den övre gränsen (det man ska ha hemma, och det
// inköpslistan räknar med), quantityMin den lägre.
const RANGE_RE = /^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*/u;

export type ParsedIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Lägre gränsen i ett intervall ("3–4 dl" → 3), annars null. */
  quantityMin: number | null;
  qualifier: AmountQualifier | null;
};

export function parseIngredientString(raw: string): ParsedIngredient {
  const { qualifier, rest: s } = splitQualifier(raw);
  const range = s.match(RANGE_RE);
  const qtyMatch = range ?? s.match(QTY_RE);
  if (!qtyMatch) return { name: qualifier ? s : raw.trim(), quantity: null, unit: null, quantityMin: null, qualifier };

  const quantity = range ? parseQuantity(range[2]) : parseQuantity(qtyMatch[1]);
  const quantityMin = range ? parseQuantity(range[1]) : null;
  const rest = s.slice(qtyMatch[0].length);

  const unitMatch = rest.match(/^([a-zA-ZåäöÅÄÖ]+)\.?\s+/u);
  const rawUnit = unitMatch?.[1].toLowerCase();

  if (rawUnit && UNITS.has(rawUnit)) {
    return { name: rest.slice(unitMatch![0].length).trim(), quantity, unit: rawUnit, quantityMin, qualifier };
  }
  return { name: rest.trim(), quantity, unit: null, quantityMin, qualifier };
}

/**
 * Mängdfältet i receptredigeringen: "13", "ca 13", "3–4", "ev. 1". null om
 * texten inte är en mängd alls. Tomt fält = ingen mängd (men "ev." får stå
 * ensamt).
 */
export function parseAmountText(text: string): { quantity: number | null; quantityMin: number | null; qualifier: AmountQualifier | null } {
  const { qualifier, rest: rå } = splitQualifier(text);
  // Annan text före talet (ett halvskrivet ord) får inte ta mängden med sig.
  const rest = rå.replace(/^[^\d½¼¾⅓⅔⅛⅜⅝⅞]+/u, '').trim();
  const range = rest.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)$/u);
  if (range) return { quantity: parseQuantity(range[2]), quantityMin: parseQuantity(range[1]), qualifier };
  const q = rest ? parseQuantity(rest) : null;
  return { quantity: q, quantityMin: null, qualifier };
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
  if (leading.quantity !== null && leading.name) return { name: leading.name, quantity: leading.quantity, unit: normalizeUnit(leading.unit) };

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
