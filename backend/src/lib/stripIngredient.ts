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
  // Malning: "svartpeppar, nymalen" och "nymalen svartpeppar" ska bägge bli
  // "svartpeppar". Ordföljden spelar ingen roll när ordet stryks oavsett var
  // det står — den frågan behöver man alltså inte ha en åsikt om.
  // Bara NY-formerna. "malen kanel" är en vara i kryddhyllan (se UNDANTAG i
  // categorizeIngredient), så "kanel, malen" får inte heller strippas —
  // annars betyder samma ord olika saker beroende på var det står.
  'nymalen', 'nymald', 'nymalet', 'nymalda', 'nykvarnad', 'nykvarnat',
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
// "ca 2 dl", "ungefär 1 msk". Ordet måste följas av mellanslag eller siffra —
// utan det kravet matchade "ca" början av VARJE ord som börjar så, och
// cayennepeppar blev "yennepeppar", cashewnötter "shewnötter", carbonara
// "rbonara". Felet syntes först när skräpet i den globala poolen granskades
// (2026-09-21); dessförinnan hade det tyst stympat namn sedan lång tid.
const APPROX_PREFIX = /^(?:ca\.?|ungefär|circa|typ)(?=[\s\d])\s*/i;


/**
 * Tillagningsord som står FÖRE varan och beskriver vad man gör hemma:
 * "finrivet ingefära", "riven ost", "varmt kaffe".
 *
 * Egen lista, inte PREP_WORDS, därför att den som strippas först är farligare.
 * Flera ord i PREP_WORDS DEFINIERAR produkten när de står först: "krossade
 * tomater" är en burk, "kokt skinka" är en charkvara, "rökt lax" är inte lax.
 * Att stryka dem hade gett fel vara. Listan här innehåller bara ord som aldrig
 * kan vara en del av ett produktnamn.
 *
 * Neutrumformerna (-t) måste stå med: recept skriver "finrivet citronskal",
 * och PREP_WORDS har bara -en/-na-formerna.
 */
const LEDANDE_PREP = new Set([
  'hackad', 'hackade', 'hackat', 'finhackad', 'finhackade', 'finhackat',
  'grovhackad', 'grovhackade', 'grovhackat',
  'riven', 'rivna', 'rivet', 'finriven', 'finrivna', 'finrivet',
  'grovriven', 'grovrivna', 'grovrivet',
  'nymalen', 'nymald', 'nymalet', 'nymalda', 'nykvarnad', 'nykvarnat',
  'pressad', 'pressade', 'pressat',
  'mosad', 'mosade', 'mosat',
  'skalad', 'skalade', 'skalat',
  'strimlad', 'strimlade', 'strimlat',
  'skuren', 'skurna', 'skuret',
  'klyftad', 'klyftade', 'klyftat',
  'urkärnad', 'urkärnade', 'urkärnat',
  'delad', 'delade', 'delat', 'halverad', 'halverade', 'halverat',
  'varm', 'varmt', 'varma', 'kall', 'kallt', 'kalla', 'ljummen', 'ljummet',
  'smält', 'smälta', 'smältt', 'rumstempererad', 'rumstempererat',
]);

/**
 * Bestämningar som hör till PRODUKTEN och därför aldrig stryks — de står i en
 * annan hylla än grundvaran. Samma ord som undantagen i categorizeIngredient.
 */
const PRODUKTBESTÄMNING = new Set([
  'torkad', 'torkade', 'torkat',
  'fryst', 'frysta', 'fryst',
  'rökt', 'rökta', 'kallrökt', 'varmrökt',
  'rimmad', 'rimmat', 'rimmade',
  'inlagd', 'inlagda', 'inlagt',
  'krossad', 'krossade', 'krossat',
  'soltorkad', 'soltorkade',
  'rårörd', 'rårörda',
  'malen', 'mald', 'malet', 'malda',
  'hel', 'hela', 'helt',
  'kokt', 'kokta',
  'passerad', 'passerade',
  // "färsk" är tvetydigt: färsk pasta är en annan vara än pasta (kyldisk mot
  // skafferi), medan färsk timjan är samma vara som timjan. Den frågan avgörs
  // inte här — men ordföljden ska ändå vara EN, så "oregano, färsk" blir
  // "färsk oregano" i stället för en tredje skrivning.
  'färsk', 'färska', 'färskt',
]);

/**
 * Flyttar en efterställd produktbestämning först: "kanel, malen" → "malen
 * kanel", "skinka, kokt" → "kokt skinka".
 *
 * Syftet är EN skrivning per vara. Samma produkt skrevs på två sätt beroende
 * på recept, och blev då två rader i ordförrådet som inte kände till varandra.
 * Ordföljden "bestämning först" är den vanliga i svenskan och den som står på
 * förpackningen.
 *
 * Böjningen följer med oförändrad, så kongruensen stämmer: källan skrev redan
 * "krossade" till "tomater".
 */
function bestämningFörst(s: string): string {
  const m = s.match(/^(.+?),\s*([a-zåäö]+)\s*$/i);
  if (!m) return s;
  const [, bas, bestämning] = m;
  if (!PRODUKTBESTÄMNING.has(bestämning.toLowerCase())) return s;
  return `${bestämning.toLowerCase()} ${bas.trim()}`;
}

export function stripIngredient(raw: string): string {
  let s = raw.trim();

  // Remove parenthetical content
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

  // Ensamma parenteser blir kvar när källan är avhuggen ("… chiliflakes )").
  // De är aldrig en del av ett varunamn.
  s = s.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();

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

  // FÖRE komma-klippningen: en efterställd produktbestämning ska flyttas fram,
  // inte klippas bort. "skinka, kokt" är kokt skinka — men "kokt" står också i
  // tillagningslistan, så klippningen hade vunnit och gjort det till "skinka".
  s = bestämningFörst(s);

  // If comma present, check if what follows is a prep description
  const commaIdx = s.indexOf(',');
  if (commaIdx > 0) {
    const afterComma = s.slice(commaIdx + 1).trim().toLowerCase();
    const firstWord = afterComma.split(/\s+/)[0];
    if (!firstWord || PREP_WORDS.has(firstWord)) {
      s = s.slice(0, commaIdx).trim();
    }
  }

  // Användningsanvisningar på slutet: "smör, till stekning", "persilja till
  // servering", "ägg till pensling". De beskriver vad varan ska användas
  // TILL i receptet, inte vilken vara det är — i butiken finns bara smör.
  // Kräver att det som följer är ett enda ord, så "tillbehör: gröna ärtor"
  // eller andra konstruktioner inte råkar kapas.
  s = s.replace(/\s*,?\s*till\s+[a-zåäö]+\s*$/i, '').trim();

  // Skala bort ledande tillagningsord ("finrivet ingefära" → "ingefära").
  // Villkoret > 1 gör att namnet aldrig kan strippas till tomt.
  const ledande = s.split(/\s+/);
  while (ledande.length > 1 && LEDANDE_PREP.has(ledande[0].toLowerCase())) {
    ledande.shift();
  }
  s = ledande.join(' ');

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
