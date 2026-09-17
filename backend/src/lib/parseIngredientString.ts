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
