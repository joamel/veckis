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

// Introductory approximation words
const APPROX_PREFIX = /^(ca\.?\s*|ungefär\s*|circa\s*|typ\s*)/i;

export function stripIngredient(raw: string): string {
  let s = raw.trim();

  // Remove parenthetical content
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

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

  // Strip leading quantity descriptors ("klyftor vitlök" → "vitlök")
  const resultWords = result.split(/\s+/);
  if (resultWords.length >= 2 && QUANTITY_DESCRIPTORS.has(resultWords[0])) {
    result = resultWords.slice(1).join(' ');
  }

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
