// Heuristisk mappning varunamn → SubCategory.
//
// Används vid: recept-import (scrape:ade ingredienser), autocomplete (när
// användaren lägger till en vara manuellt), bulk-transfer av veckomeny.
// Returnerar null om ingen träff — kallaren får då sätta defaultParent='other'
// och låta användaren manuellt kategorisera.
//
// Strategin är simpel: en keyword-tabell sub → patterns[]. Längsta matchande
// patternet vinner (så "philadelphia ost" matchar 'ost' inte 'mjölk' även om
// båda finns i namnet). AI-baserad förfining ligger som backlog-punkt under
// Agent-rubriken.

import type { SubCategory } from './taxonomy';

// Patterns i lowercase. Word-boundary-matching görs i inferSubCategory:n.
// Lägg flest-specifika först inom varje sub så orderning räknas vid kortfattade
// patterns.
const PATTERNS: Array<{ sub: SubCategory; patterns: string[] }> = [
  // Frukt & grönt
  { sub: 'frukt', patterns: ['äpple', 'äpplen', 'banan', 'apelsin', 'citron', 'lime', 'päron', 'kiwi', 'mango', 'avocado', 'meloner', 'melon', 'persika', 'plommon', 'druvor', 'ananas', 'granatäpple'] },
  { sub: 'bär', patterns: ['jordgubbar', 'jordgubb', 'hallon', 'blåbär', 'björnbär', 'lingon', 'tranbär', 'krusbär', 'havtorn', 'fläderbär'] },
  { sub: 'grönsaker', patterns: ['broccoli', 'blomkål', 'paprika', 'tomat', 'gurka', 'zucchini', 'aubergine', 'majs', 'sparris', 'kålrot', 'vitkål', 'rödkål', 'spenat', 'ärtor', 'sockerärt', 'haricot', 'bönor (färska)'] },
  { sub: 'rotsaker', patterns: ['potatis', 'morötter', 'morot', 'palsternacka', 'rödbeta', 'rotselleri', 'kålrabbi', 'sötpotatis', 'jordärtskocka'] },
  { sub: 'lök_vitlök', patterns: ['gul lök', 'rödlök', 'salladslök', 'purjolök', 'schalottenlök', 'vitlök', 'lök'] },
  { sub: 'örter_sallad', patterns: ['basilika', 'persilja', 'koriander', 'mynta', 'rosmarin', 'timjan', 'dill', 'gräslök', 'salvia', 'ruccola', 'sallad', 'isbergssallad', 'spenat (frisk)', 'mangold'] },
  // Kött & fisk
  { sub: 'nöt', patterns: ['oxfilé', 'biff', 'entrecôte', 'ryggbiff', 'rostbiff', 'ox', 'nötkött'] },
  { sub: 'fläsk', patterns: ['fläskfilé', 'fläskytterfilé', 'fläskkotlett', 'kassler', 'bacon (rökt)', 'sidfläsk', 'fläsk'] },
  { sub: 'kyckling_fågel', patterns: ['kycklingfilé', 'kycklinglår', 'kycklingvingar', 'kycklingklubbor', 'kyckling', 'kalkon', 'anka'] },
  { sub: 'färs', patterns: ['nötfärs', 'fläskfärs', 'blandfärs', 'kycklingfärs', 'kalkonfärs', 'färs'] },
  { sub: 'fisk', patterns: ['lax', 'torsk', 'kolja', 'sej', 'sill', 'makrill', 'tonfisk (färsk)', 'rödspätta', 'gädda', 'abborre'] },
  { sub: 'skaldjur', patterns: ['räkor', 'kräftor', 'krabba', 'hummer', 'musslor', 'ostron', 'kammusslor', 'bläckfisk'] },
  { sub: 'färdiga_såser_kylda', patterns: ['bearnaisesås', 'béarnaisesås', 'hollandaisesås', 'bearnaise', 'hollandaise', 'pepparsås', 'gräddsås', 'sky', 'köttsky'] },
  // Chark & Deli
  { sub: 'skinka_pålägg', patterns: ['parmaskinka', 'serranoskinka', 'prosciutto', 'rökt skinka', 'kalkonpålägg', 'rökt kalkon', 'kycklingpålägg', 'blodpudding', 'leverpastej', 'skinka', 'pålägg'] },
  { sub: 'korv_charcuteri', patterns: ['salami', 'pepperoni', 'chorizo', 'medisterkorv', 'falukorv', 'wienerkorv', 'grillkorv', 'bratwurst', 'isterband', 'prinskorv', 'kabanoss', 'mortadella', 'merguez', 'blodkorv', 'kycklingkorv', 'korv'] },
  { sub: 'delikatessost', patterns: ['brie', 'camembert', 'feta', 'mozzarella (färsk)', 'mozzarella', 'parmesan', 'manchego', 'pecorino', 'gorgonzola', 'roquefort', 'chèvre', 'halloumi', 'burrata', 'ricotta (deli)', 'taleggio'] },
  { sub: 'pâté_terrin', patterns: ['paté', 'pâté', 'terrin', 'rillette', 'mousse (chark)'] },
  { sub: 'oliver_antipasto', patterns: ['gröna oliver', 'svarta oliver', 'oliver', 'antipasto', 'soltorkade tomater', 'kapris', 'cornichoner', 'inlagda paprika', 'pepparoni (inlagda)'] },
  // Mejeri & ägg
  { sub: 'laktosfritt', patterns: ['laktosfri', 'laktosfritt'] }, // KÖRS FÖRST — överstyr mjölk/ost om "laktosfri" finns i namnet
  { sub: 'mejerisubstitut', patterns: ['havremjölk', 'havredryck', 'sojamjölk', 'sojadryck', 'mandelmjölk', 'kokosmjölk', 'havregrädde', 'sojagrädde', 'växtbaserad'] },
  { sub: 'mjölk', patterns: ['standardmjölk', 'mellanmjölk', 'lättmjölk', 'minimjölk', 'mjölk'] },
  { sub: 'yoghurt_fil', patterns: ['yoghurt', 'fil', 'filmjölk', 'kefir', 'naturell yoghurt', 'grekisk yoghurt', 'turkisk yoghurt'] },
  { sub: 'smör_margarin', patterns: ['smör', 'margarin', 'bregott', 'lätt & lagom'] },
  { sub: 'ost', patterns: ['hushållsost', 'präst', 'grevé', 'svecia', 'herrgård', 'cheddar (vanlig)', 'riven ost', 'ost'] },
  { sub: 'grädde', patterns: ['vispgrädde', 'matlagningsgrädde', 'crème fraîche', 'creme fraiche', 'gräddfil', 'grädde'] },
  { sub: 'ägg', patterns: ['ägg'] },
  // Bröd & bageri
  { sub: 'bröd', patterns: ['limpa', 'rågbröd', 'levain', 'baguette', 'tunnbröd', 'pitabröd', 'tortillabröd', 'hamburgerbröd', 'korvbröd', 'bröd'] },
  { sub: 'knäckebröd_skorpor', patterns: ['knäckebröd', 'skorpor', 'krisprolls'] },
  { sub: 'bakverk_kex', patterns: ['kakor', 'kex', 'bullar', 'wienerbröd', 'kanelbullar', 'småkakor'] },
  // Frysvaror
  { sub: 'frysta_grönsaker', patterns: ['frysta grönsaker', 'fryst broccoli', 'fryst spenat', 'wokgrönsaker (frysta)', 'frysta ärtor', 'majs (fryst)'] },
  { sub: 'frysta_bär_frukt', patterns: ['frysta bär', 'frysta hallon', 'frysta blåbär', 'frysta jordgubbar'] },
  { sub: 'glass', patterns: ['glass', 'gelato', 'sorbet'] },
  { sub: 'fryst_kött_fågel', patterns: ['fryst kött', 'fryst kyckling', 'fryst köttfärs', 'fryst kalkon'] },
  { sub: 'fryst_fisk', patterns: ['fryst lax', 'fryst torsk', 'fryst fisk', 'frysta räkor'] },
  { sub: 'frysta_färdigrätter', patterns: ['fryst pizza', 'fryst lasagne', 'fryst panpizza', 'färdigrätt (fryst)', 'wokrätt (fryst)'] },
  { sub: 'fryst_bröd_deg', patterns: ['fryst deg', 'fryst smördeg', 'pajdeg', 'piroger (frysta)'] },
  // Konserver & torrvaror
  { sub: 'pasta_nudlar', patterns: ['spaghetti', 'penne', 'tagliatelle', 'fettuccine', 'macaroni', 'lasagneplattor', 'nudlar', 'glasnudlar', 'risnudlar', 'pasta'] },
  { sub: 'ris_gryn', patterns: ['jasminris', 'basmatiris', 'arborioris', 'fullkornsris', 'havregryn', 'müsli', 'korngryn', 'bovete', 'quinoa', 'couscous', 'bulgur', 'ris'] },
  { sub: 'konserver', patterns: ['krossade tomater', 'tomatkonserv', 'tonfisk i', 'majs (konserv)', 'kokosmjölk (konserv)', 'kokosgrädde (konserv)', 'kondenserad mjölk'] },
  { sub: 'baljväxter', patterns: ['kikärtor', 'svarta bönor', 'kidneybönor', 'vita bönor', 'linser', 'gula ärtor'] },
  { sub: 'mjöl_bakingredienser', patterns: ['vetemjöl', 'rågmjöl', 'mannagryn', 'jäst', 'bakpulver', 'bikarbonat', 'florsocker', 'strösocker', 'farinsocker', 'sirap', 'kakao', 'vaniljsocker', 'sockerkaka mix'] },
  { sub: 'olja_vinäger', patterns: ['olivolja', 'rapsolja', 'kokosolja', 'solrosolja', 'sesamolja', 'balsamico', 'äppelcidervinäger', 'rödvinsvinäger', 'vinäger', 'olja'] },
  { sub: 'kryddor_buljong', patterns: ['salt', 'peppar', 'svartpeppar', 'paprikapulver', 'curry', 'kanel', 'kardemumma', 'oregano', 'paprika (krydda)', 'buljongtärningar', 'kycklingbuljong', 'grönsaksbuljong', 'köttbuljong'] },
  { sub: 'sås_dressing', patterns: ['ketchup', 'senap', 'majonnäs', 'sweet chili', 'sojasås', 'fisksås', 'ostronsås', 'sambal oelek', 'dressing', 'caesardressing', 'rhode island'] },
  { sub: 'nötter_frön_torra', patterns: ['mandlar', 'cashewnötter', 'jordnötter', 'hasselnötter', 'valnötter', 'pinjenötter', 'pumpafrön', 'solrosfrön', 'sesamfrön', 'chiafrön', 'linfrön'] },
  // Snacks & godis
  { sub: 'godis', patterns: ['godis', 'gelégodis', 'salta lakritsar', 'sura' /* karameller */, 'kola'] },
  { sub: 'choklad', patterns: ['choklad', 'mörk choklad', 'mjölkchoklad', 'choklad bar', 'nougat'] },
  { sub: 'chips_salt', patterns: ['chips', 'ostbågar', 'cheez doodles', 'popcorn', 'salta pinnar', 'tortillachips', 'pretzels'] },
  // Drycker
  { sub: 'läsk', patterns: ['cola', 'pepsi', 'fanta', 'sprite', 'läsk', 'lemonad'] },
  { sub: 'juice', patterns: ['juice', 'apelsinjuice', 'äppeljuice', 'fruktjuice', 'must'] },
  { sub: 'vatten', patterns: ['vatten', 'mineralvatten', 'kolsyrat vatten', 'ramlösa'] },
  { sub: 'kaffe', patterns: ['kaffe', 'snabbkaffe', 'espressopulver', 'kaffekapslar', 'bryggkaffe'] },
  { sub: 'te', patterns: ['te', 'tepåsar', 'grönt te', 'svart te', 'rooibos', 'kamomill'] },
  { sub: 'alkoholfritt_öl_cider', patterns: ['alkoholfri öl', 'alkoholfri cider', 'alkoholfritt'] },
  { sub: 'alkoholhaltigt', patterns: ['öl', 'vin', 'rödvin', 'vitt vin', 'rosévin', 'cider', 'sprit', 'whisky', 'vodka', 'rom', 'gin'] },
  // Specialkost
  { sub: 'glutenfritt', patterns: ['glutenfri', 'glutenfritt'] },
  { sub: 'vegan', patterns: ['vegan', 'växtbaserad färs', 'oumph', 'quorn', 'beyond meat', 'tofu', 'tempeh'] },
  // Städ & rengöring
  { sub: 'diskmedel', patterns: ['diskmedel', 'maskindisk', 'disktabletter', 'sköljmedel (disk)'] },
  { sub: 'tvättmedel', patterns: ['tvättmedel', 'sköljmedel', 'fläckborttagning', 'klorin'] },
  { sub: 'ytrengöring', patterns: ['ytrengöring', 'allrent', 'badrumsrengöring', 'fönsterputs', 'ugnsrengöring'] },
  { sub: 'städredskap', patterns: ['svampar', 'disktrasa', 'sopborste', 'mopp', 'soppåsar', 'sopsäckar'] },
  { sub: 'toalett_hushållspapper', patterns: ['toalettpapper', 'hushållspapper', 'pappershanddukar', 'servetter', 'pappersservetter'] },
  // Hygien & personvård
  { sub: 'tandvård', patterns: ['tandkräm', 'tandborste', 'tandtråd', 'munvatten'] },
  { sub: 'hårvård', patterns: ['schampo', 'balsam', 'hårinpackning', 'hårspray', 'styling'] },
  { sub: 'duschtvål_hudvård', patterns: ['duschgel', 'duschtvål', 'tvål', 'handkräm', 'ansiktskräm', 'bodylotion', 'deodorant', 'rakkräm'] },
  { sub: 'intimhygien', patterns: ['bindor', 'tamponger', 'intimtvätt', 'trosskydd'] },
  { sub: 'mediciner', patterns: ['alvedon', 'ipren', 'paracetamol', 'plåster', 'huvudvärkstabletter', 'magmedicin'] },
  // Övrigt
  { sub: 'husdjur', patterns: ['hundmat', 'kattmat', 'hundgodis', 'kattsand', 'kattgrus'] },
  { sub: 'baby_barn', patterns: ['blöjor', 'välling', 'bröstmjölksersättning', 'modersmjölksersättning', 'barnmat', 'våtservetter (baby)'] },
  { sub: 'blommor_växter', patterns: ['blommor', 'krukväxt', 'krukor', 'växtjord', 'gödsel'] },
  { sub: 'hushållsvaror', patterns: ['ljus', 'tändstickor', 'batterier', 'glödlampa', 'aluminiumfolie', 'plastfolie', 'bakplåtspapper'] },
  { sub: 'batteri_elektronik', patterns: ['batteri', 'laddare', 'usb-kabel'] },
];

/**
 * Försök hitta bästa SubCategory för ett produktnamn.
 * Returnerar null om inget patterns matchar — kallaren får default:a till null
 * och låta `category` falla på 'other' (vilket fungerar idag).
 */
// Word-boundary för att korta patterns ("te", "ägg") inte matchar inuti andra
// ord. JS \b funkar bara på ASCII; svenska å/ä/ö räknas som "non-word" så vi
// bygger en egen check med Unicode-letter-flagga.
const WORD_CHAR = /[\p{L}\p{N}]/u;

function matchesWord(haystack: string, needle: string): boolean {
  let idx = 0;
  while (true) {
    const found = haystack.indexOf(needle, idx);
    if (found < 0) return false;
    const before = found === 0 ? '' : haystack[found - 1];
    const afterIdx = found + needle.length;
    const after = afterIdx >= haystack.length ? '' : haystack[afterIdx];
    const leftOk = !before || !WORD_CHAR.test(before);
    const rightOk = !after || !WORD_CHAR.test(after);
    if (leftOk && rightOk) return true;
    idx = found + 1;
  }
}

export function inferSubCategory(name: string): SubCategory | null {
  const haystack = name.toLowerCase().trim();
  if (!haystack) return null;

  let best: { sub: SubCategory; len: number } | null = null;
  for (const { sub, patterns } of PATTERNS) {
    for (const p of patterns) {
      if (matchesWord(haystack, p)) {
        // Längsta matchande pattern vinner — 'sojadryck' (9) slår 'soja' (4)
        // om båda råkar matcha samma namn.
        if (!best || p.length > best.len) {
          best = { sub, len: p.length };
        }
      }
    }
  }
  return best?.sub ?? null;
}
