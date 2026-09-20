// Swedish quantity/portion descriptor words that prefix an ingredient ("klyftor vitlök" → "vitlök")
const QUANTITY_DESCRIPTORS = new Set([
  'klyfta', 'klyftor',         // clove(s)
  'skiva', 'skivor',           // slice(s)
  'blad',                      // leaf/leaves
  'stjälk', 'stjälkar',        // stalk(s)
  'kvist', 'kvistar',          // sprig(s)
  'bukett', 'buketter',        // bunch(es)
  'näve', 'nävar',             // handful(s)
  'bit', 'bitar',              // piece(s)
  'nypa', 'nypor',             // pinch(es)
  'stång', 'stänger',          // stick(s)
  'huvud', 'huvuden',          // head(s) (e.g. huvud vitlök)
  'lövblad', 'lövbladen',      // bay leaf/leaves
  'korn', 'kvistar',           // grain(s)
  'tunna', 'tuntor',           // slice
  'filé', 'filéer',            // fillet(s)
]);

// Common Swedish food compound word → canonical ingredient name
const COMPOUND_CANONICALS: Record<string, string> = {
  standardmjölk: 'mjölk',
  lättmjölk: 'mjölk',
  mellanmjölk: 'mjölk',
  minimjölk: 'mjölk',
  ekologiskmjölk: 'mjölk',
  fetamjölk: 'mjölk',
  laktosfrimjölk: 'mjölk',
  havremjölk: 'havremjölk',   // oat milk — keep as-is
  sojamjölk: 'sojamjölk',
  kokosmjölk: 'kokosmjölk',
  mandelsmör: 'mandelsmör',
  jordnötssmör: 'jordnötssmör',
  crèmefraiche: 'crème fraiche',
  cremefraiche: 'crème fraiche',
  'crème fraiche': 'crème fraiche',
  fraiche: 'crème fraiche',
};

// Swedish plural → singular for common ingredients
const SINGULAR_FORMS: Record<string, string> = {
  tomater: 'tomat',
  bananer: 'banan',
  citroner: 'citron',
  apelsiner: 'apelsin',
  gurkor: 'gurka',
  morötter: 'morot',
  paprikor: 'paprika',
  lökar: 'lök',
  äpplen: 'äpple',
  päron: 'päron',
  potatisar: 'potatis',
  champinjoner: 'champinjon',
  kycklingar: 'kyckling',
  räkor: 'räka',
  laxfiléer: 'laxfilé',
  filéer: 'filé',
  nötter: 'nöt',
  mandlar: 'mandel',
  valnötter: 'valnöt',
  cashewnötter: 'cashewnöt',
  kryddor: 'krydda',
  örter: 'ört',
  linser: 'lins',
  kikärtor: 'kikärt',
  bönor: 'böna',
  gröna_bönor: 'grön böna',
  körsbär: 'körsbär',
  hallon: 'hallon',
  blåbär: 'blåbär',
  jordgubbar: 'jordgubbe',
  avokador: 'avokado',
  mangos: 'mango',
  ananas: 'ananas',
  dadlar: 'dadel',
  fikon: 'fikon',
  oliver: 'oliv',
  kapris: 'kapris',
  kronärtskockor: 'kronärtskocka',
  sparrisar: 'sparris',
  rädisor: 'rädisa',
  brysselkål: 'brysselkål',
  broccolis: 'broccoli',
  svampar: 'svamp',
};

// Swedish prep/descriptor words that are safe to strip from ingredient names
const PREP_WORDS = new Set([
  // Cutting/chopping
  'hackad', 'hackade', 'finhackad', 'finhackade', 'grovhackad', 'grovhackade',
  'skuren', 'skurna', 'strimlad', 'strimlat', 'strimlad',
  'klyftad', 'klyftade',
  // Grating
  'riven', 'rivna', 'finriven', 'finrivna', 'grovriven', 'grovrivna',
  // Pressing/crushing
  'pressad', 'pressade', 'krossad', 'krossade', 'mosad', 'mosade',
  // Peeled/cleaned
  'skalad', 'skalade', 'sköljd', 'sköljda', 'putsad', 'putsade', 'välputsad', 'välputsade',
  'urkönad', 'urkörnade', 'urkärnad', 'urkärnade',
  // Temperature state
  'fryst', 'frysta', 'tinad', 'tinade', 'rumstempererad', 'rumstempererade',
  'kall', 'kallt', 'kalla', 'varm', 'varmt', 'varma',
  'smält', 'smälta',
  // Cooked
  'kokt', 'kokta', 'stekt', 'stekta', 'grillad', 'grillade', 'rostad', 'rostade',
  // Shape/size
  'halverad', 'halverade', 'delad', 'delade', 'hel', 'hela',
  // Consistency/grind
  'mald', 'malda', 'mixad', 'mixade',
  // Dried
  'torkad', 'torkade',
  // Size descriptors (context-free)
  'liten', 'litet', 'lilla', 'stor', 'stora', 'stort', 'grov', 'grovt', 'grova', 'fin', 'fint', 'fina',
  'mjuk', 'mjukt', 'mjuka',
]);

// Måttenheter som ibland fastnar först i namnet när källan saknar mängd
// ("kg potatis" → "potatis"). Håll i synk med parserns unit-lista i recipes.ts.
const UNITS = new Set([
  'dl', 'ml', 'l', 'liter', 'cl', 'msk', 'tsk', 'krm', 'g', 'kg', 'hg', 'st', 'port',
  'burk', 'förp', 'förpackning', 'förpackningar', 'pkt', 'paket', 'påse', 'ask',
  'kartong', 'näve', 'skiva', 'skivor',
  'cup', 'cups', 'tsp', 'tbsp', 'teaspoon', 'teaspoons', 'tablespoon', 'tablespoons',
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  'pint', 'pints', 'quart', 'quarts', 'gallon', 'gallons',
  'stick', 'sticks', 'clove', 'cloves', 'pinch', 'dash',
  'can', 'cans', 'package', 'packages', 'slice', 'slices',
]);

// Ett tal: heltal, decimaltal med komma eller punkt, intervall ("3-4"), bråk
// ("1/2") eller unicode-bråk ("½", "1¾").
const TAL = /^(\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?|\d+\/\d+|\d*\s*[½¼¾⅓⅔⅛⅜⅝⅞])$/u;

// Tal och enhet hopskrivna, som sajter och OCR ofta skriver dem: "400g", "2dl",
// "1kg". Enhetsdelen måste finnas i UNITS — annars skulle "7up" räknas som mängd.
const TAL_MED_ENHET = /^(\d+(?:[.,]\d+)?)([a-zåäö]+)$/u;

/**
 * True om ordet är en mängdangivelse snarare än en del av varunamnet: en ren
 * måttenhet ("kg"), ett tal ("400", "1/2", "½") eller de två hopskrivna
 * ("400g").
 *
 * Talen saknades länge, och det var hela orsaken till skräpet i den globala
 * ingredienspoolen: strippningen skalade bara bort ett ENSAMT enhetsord, så
 * "400 g ost" och "400g ost" gick rakt igenom och blev egna globala alias.
 */
export function ärMängdOrd(word: string): boolean {
  const w = word.trim().toLowerCase();
  if (!w) return false;
  if (UNITS.has(w) || QUANTITY_DESCRIPTORS.has(w)) return true;
  if (TAL.test(w)) return true;
  const fused = w.match(TAL_MED_ENHET);
  return fused ? UNITS.has(fused[2]) : false;
}

/** True om namnet inleds med en mängd följt av ett riktigt ord ("kg potatis",
 *  "400g ost", "2 dl grädde") — används för att filtrera bort trasiga alias.
 *  Håll i synk med strippningen nedan: samma predikat, samma bedömning. */
export function startsWithUnit(name: string): boolean {
  const w = name.trim().toLowerCase().split(/\s+/);
  return w.length >= 2 && ärMängdOrd(w[0]);
}

// Introductory approximation words
const APPROX_PREFIX = /^(ca\.?\s*|ungefär\s*|circa\s*|typ\s*)/i;


export function stripIngredient(raw: string): string {
  let s = raw.trim();

  // Remove parenthetical content
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

  // OBS: alternativ ("nötfärs alt. vegofärs", "körsbärstomater eller
  // romanticatomater") klipps AVSIKTLIGT inte bort här.
  //
  // Ett försök till det backades 2026-09-20: strippningen matar namnet på
  // varan i inköpslistan, och att behålla bara första alternativet tar bort
  // användarens val. En vegetarian som överför rätten skulle få "nötfärs" och
  // inget mer. Valet mellan alternativ tillhör den som handlar, inte
  // normaliseringen — och kostar den här raden ingenting att lämna kvar.

  // Remove approximation prefix
  s = s.replace(APPROX_PREFIX, '').trim();

  // If comma present, check if what follows is a prep description
  const commaIdx = s.indexOf(',');
  if (commaIdx > 0) {
    const afterComma = s.slice(commaIdx + 1).trim().toLowerCase();
    const firstWord = afterComma.split(/\s+/)[0];
    if (!firstWord || PREP_WORDS.has(firstWord)) {
      s = s.slice(0, commaIdx).trim();
    }
  }

  // Strip trailing prep words
  const words = s.split(/\s+/);
  while (words.length > 1 && PREP_WORDS.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }

  let result = words.join(' ').toLowerCase().trim();

  // Skala bort ledande mängd: portionsord, måttenheter OCH tal, i vilken
  // kombination som helst ("klyftor vitlök", "kg potatis", "400 g ost",
  // "400g ost", "1/2 dl grädde"). Villkoret >= 2 gör att ett namn aldrig kan
  // strippas till tomt.
  const resultWords = result.split(/\s+/);
  while (resultWords.length >= 2 && ärMängdOrd(resultWords[0])) {
    resultWords.shift();
  }
  result = resultWords.join(' ');

  // Apply compound word canonicalization ("standardmjölk" → "mjölk")
  if (COMPOUND_CANONICALS[result]) {
    result = COMPOUND_CANONICALS[result];
  }

  // Apply plural → singular ("tomater" → "tomat")
  if (SINGULAR_FORMS[result]) {
    result = SINGULAR_FORMS[result];
  }

  return result;
}
