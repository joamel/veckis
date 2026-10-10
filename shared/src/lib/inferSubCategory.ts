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
  { sub: 'frukt', patterns: ['äpple', 'äpplen', 'banan', 'apelsin', 'citron', 'lime', 'päron', 'kiwi', 'mango', 'avocado', 'meloner', 'melon', 'persika', 'plommon', 'druvor', 'ananas', 'granatäpple', 'mandarin', 'satsuma', 'clementin', 'nektarin', 'blodapelsin', 'vindruvor', 'vindruva'] },
  { sub: 'bär', patterns: ['jordgubbar', 'jordgubb', 'hallon', 'blåbär', 'björnbär', 'lingon', 'tranbär', 'krusbär', 'havtorn', 'fläderbär'] },
  { sub: 'grönsaker', patterns: ['broccoli', 'blomkål', 'paprika', 'tomat', 'gurka', 'zucchini', 'aubergine', 'majs', 'sparris', 'kålrot', 'vitkål', 'rödkål', 'spenat', 'sockerärt', 'haricot', 'bönor (färska)', 'tomater', 'körsbärstomater', 'romanticatomater', 'cocktailtomater', 'babyspenat'] },
  { sub: 'rotsaker', patterns: ['potatis', 'morötter', 'morot', 'palsternacka', 'rödbeta', 'rotselleri', 'kålrabbi', 'sötpotatis', 'jordärtskocka', 'småpotatis', 'fast potatis', 'mjölig potatis'] },
  { sub: 'lök_vitlök', patterns: ['gul lök', 'rödlök', 'salladslök', 'purjolök', 'schalottenlök', 'vitlök', 'lök', 'vitlöksklyfta', 'vitlöksklyftor'] },
  { sub: 'örter_sallad', patterns: ['basilika', 'persilja', 'koriander', 'mynta', 'rosmarin', 'timjan', 'dill', 'gräslök', 'salvia', 'ruccola', 'sallad', 'isbergssallad', 'spenat (frisk)', 'mangold', 'rucola', 'salladsmix'] },
  // Kött & fisk
  { sub: 'nöt', patterns: ['oxfilé', 'biff', 'entrecôte', 'ryggbiff', 'rostbiff', 'ox', 'nötkött'] },
  { sub: 'fläsk', patterns: ['fläskfilé', 'fläskytterfilé', 'fläskkotlett', 'kassler', 'sidfläsk', 'fläsk'] },
  { sub: 'kyckling_fågel', patterns: ['kycklingfilé', 'kycklinglår', 'kycklingvingar', 'kycklingklubbor', 'kyckling', 'kalkon', 'anka', 'kycklingfiléer'] },
  { sub: 'färs', patterns: ['nötfärs', 'fläskfärs', 'blandfärs', 'kycklingfärs', 'kalkonfärs', 'färs', 'köttfärs'] },
  { sub: 'fisk', patterns: ['lax', 'torsk', 'kolja', 'sej', 'sill', 'makrill', 'tonfisk (färsk)', 'rödspätta', 'gädda', 'abborre', 'löjrom', 'stenbitsrom', 'forellrom', 'kaviar'] },
  { sub: 'skaldjur', patterns: ['räkor', 'kräftor', 'krabba', 'hummer', 'musslor', 'ostron', 'kammusslor', 'bläckfisk'] },
  { sub: 'färdiga_såser_kylda', patterns: ['bearnaisesås', 'béarnaisesås', 'hollandaisesås', 'bearnaise', 'hollandaise', 'pepparsås', 'gräddsås', 'sky', 'köttsky'] },
  // Chark & deli
  { sub: 'skinka_pålägg', patterns: ['rökt skinka', 'kalkonpålägg', 'rökt kalkon', 'kycklingpålägg', 'blodpudding', 'skinka', 'pålägg'] },
  { sub: 'korv_charcuteri', patterns: ['medisterkorv', 'falukorv', 'wienerkorv', 'grillkorv', 'bratwurst', 'isterband', 'prinskorv', 'kabanoss', 'mortadella', 'merguez', 'blodkorv', 'kycklingkorv', 'korv', 'kalkonkorv', 'bacon', 'baconskivor', 'bacontärningar'] },
  { sub: 'lufttorkat_salami', patterns: ['salami', 'pepperoni', 'chorizo', 'pancetta', 'prosciutto', 'parmaskinka', 'serranoskinka', 'serrano', 'lufttorkad skinka', 'bresaola', 'coppa', 'fuet', 'lomo', 'salsiccia'] },
  { sub: 'delikatessost', patterns: ['brie', 'camembert', 'parmesan', 'manchego', 'pecorino', 'gorgonzola', 'roquefort', 'chèvre', 'burrata', 'ricotta (deli)', 'taleggio', 'gouda', 'gruyère', 'gruyere', 'comté', 'comte', 'färskost', 'krämost'] },
  { sub: 'pâté_terrin', patterns: ['paté', 'pâté', 'terrin', 'rillette', 'mousse (chark)', 'leverpastej', 'ankleverpastej', 'pastej', 'leverpastej (skivad)'] },
  { sub: 'oliver_antipasto', patterns: ['gröna oliver', 'svarta oliver', 'oliver', 'soltorkade tomater', 'kapris', 'cornichoner', 'inlagda paprika', 'pepparoni (inlagda)', 'kronärtskockshjärtan', 'inlagd paprika', 'inlagd gurka', 'smörgåsgurka', 'saltgurka', 'kalamataoliver', 'kalamata', 'urkärnade oliver', 'svarta oliver urkärnade', 'oliver utan kärnor', 'olivkapris'] },
  { sub: 'antipasto_delikatesser', patterns: ['antipasto', 'marinerade oliver', 'färska oliver', 'fyllda oliver', 'oliver från disken', 'vitlöksklyftor i olja', 'marinerad vitlök', 'grillade grönsaker i olja', 'fyllda pepparfrukter', 'tapenade'] },
  { sub: 'färdigmat_kyld', patterns: ['färdig sallad', 'pastasallad', 'kyld färdigrätt', 'färdig soppa', 'sushi'] },
  // Mejeri & ägg
  { sub: 'laktosfritt', patterns: ['laktosfri', 'laktosfritt', 'lactose free', 'lactose-free'] }, // KÖRS FÖRST — överstyr mjölk/ost om "laktosfri" finns i namnet
  { sub: 'mejerisubstitut', patterns: ['havremjölk', 'havredryck', 'sojamjölk', 'sojadryck', 'mandelmjölk', 'havregrädde', 'sojagrädde', 'växtbaserad', 'kokosdryck'] },
  { sub: 'mjölk', patterns: ['standardmjölk', 'mellanmjölk', 'lättmjölk', 'minimjölk', 'mjölk'] },
  { sub: 'yoghurt_fil', patterns: ['yoghurt', 'fil', 'filmjölk', 'kefir', 'naturell yoghurt', 'grekisk yoghurt', 'turkisk yoghurt', 'matyoghurt', 'kvarg', 'vaniljkvarg', 'kesella', 'keso', 'cottage cheese'] },
  { sub: 'drickyoghurt_mellanmål', patterns: ['drickyoghurt', 'yoghurtdryck', 'mellanmål', 'pudding', 'chokladpudding', 'vaniljpudding', 'risifrutti', 'proteinpudding', 'kvargmellanmål', 'fruktyoghurt'] },
  { sub: 'smör_margarin', patterns: ['smör', 'baksmör', 'margarin', 'bregott', 'lätt & lagom'] },
  { sub: 'ost', patterns: ['hushållsost', 'präst', 'grevé', 'svecia', 'herrgård', 'cheddar (vanlig)', 'ost'] },
  { sub: 'matlagningsost', patterns: ['riven ost', 'gratängost', 'pizzaost', 'riven mozzarella', 'mozzarella (färsk)', 'mozzarella', 'feta', 'fetaost', 'salladsost', 'halloumi', 'grillost', 'matlagningsost'] },
  { sub: 'grädde', patterns: ['vispgrädde', 'matlagningsgrädde', 'crème fraîche', 'creme fraiche', 'gräddfil', 'grädde'] },
  { sub: 'ägg', patterns: ['ägg', 'äggulor', 'äggula', 'äggvitor', 'äggvita'] },
  // Bröd & bageri
  { sub: 'bröd', patterns: ['limpa', 'rågbröd', 'levain', 'baguette', 'tunnbröd', 'pitabröd', 'hamburgerbröd', 'korvbröd', 'bröd', 'naanbröd', 'naan'] },
  { sub: 'knäckebröd_skorpor', patterns: ['knäckebröd', 'skorpor', 'krisprolls'] },
  { sub: 'bakverk_kex', patterns: ['kakor', 'kex', 'bullar', 'wienerbröd', 'kanelbullar', 'småkakor', 'bulle'] },
  // Frysvaror
  { sub: 'frysta_grönsaker', patterns: ['frysta grönsaker', 'fryst broccoli', 'fryst spenat', 'wokgrönsaker (frysta)', 'frysta ärtor', 'majs (fryst)', 'ärtor', 'gröna ärtor', 'edamame', 'edamamebönor', 'sojabönor (frysta)'] },
  { sub: 'fryst_potatis', patterns: ['pommes frites', 'pommes', 'pommes strips', 'strips', 'klyftpotatis', 'potatisklyftor', 'rösti', 'potatisrösti', 'potatisbullar', 'potatiskroketter', 'kroketter', 'ugnspotatis', 'sötpotatispommes', 'hash browns'] },
  { sub: 'frysta_bär_frukt', patterns: ['frysta bär', 'frysta hallon', 'frysta blåbär', 'frysta jordgubbar'] },
  { sub: 'glass', patterns: ['glass', 'gelato', 'sorbet'] },
  { sub: 'fryst_kött_fågel', patterns: ['fryst kött', 'fryst kyckling', 'fryst köttfärs', 'fryst kalkon'] },
  { sub: 'fryst_köttbullar_chark', patterns: ['köttbullar', 'frysta köttbullar', 'nuggets', 'kycklingnuggets', 'pannbiff', 'pannbiffar', 'frysta hamburgare', 'cevapcici', 'kycklingbullar', 'kåldolmar'] },
  { sub: 'fryst_fisk', patterns: ['fryst lax', 'fryst torsk', 'fryst fisk', 'frysta räkor', 'fiskpinnar', 'fryst skaldjur', 'frysta musslor'] },
  { sub: 'frysta_färdigrätter', patterns: ['fryst pizza', 'fryst lasagne', 'fryst panpizza', 'färdigrätt (fryst)', 'wokrätt (fryst)', 'enportionsrätt', 'enportionsrätter', 'lunchlåda', 'färdigrätt', 'färdigrätter', 'piroger', 'pirog', 'potatisgratäng', 'gratäng'] },
  { sub: 'fryst_bröd_deg', patterns: ['fryst deg', 'fryst smördeg', 'pajdeg', 'piroger (frysta)'] },
  { sub: 'fryst_vegetariskt', patterns: ['frysta vegoburgare', 'vegobiff (fryst)', 'frysta vegobollar', 'fryst quorn', 'vegoburgare', 'vegobullar', 'vegonuggets', 'vegobiffar', 'quornfärs', 'quornbitar', 'quornfilé', 'vegetariska biffar', 'grönsaksbiffar'] },
  // Glutenfria varor som bara finns frysta: längsta mönstret vinner, så de slår
  // 'glutenfri' (torra hyllan under Specialkost). Bröd står INTE här — det
  // säljs både fryst och färskt; där får hushållets eget val avgöra.
  { sub: 'fryst_glutenfritt', patterns: ['glutenfritt (fryst)', 'fryst glutenfri', 'glutenfri pizza', 'glutenfria pizzor', 'glutenfri lasagne', 'glutenfria fiskpinnar', 'glutenfria köttbullar', 'glutenfria nuggets', 'glutenfria kycklingnuggets', 'glutenfria pannkakor', 'glutenfria våfflor', 'glutenfria piroger', 'glutenfri pirog'] },
  // Konserver & torrvaror
  { sub: 'pasta_nudlar', patterns: ['spaghetti', 'penne', 'tagliatelle', 'fettuccine', 'macaroni', 'lasagneplattor', 'nudlar', 'glasnudlar', 'risnudlar', 'pasta'] },
  { sub: 'ris_gryn', patterns: ['jasminris', 'basmatiris', 'arborioris', 'fullkornsris', 'havregryn', 'korngryn', 'bovete', 'quinoa', 'couscous', 'bulgur', 'ris'] },
  { sub: 'flingor_müsli', patterns: ['frukostflingor', 'cornflakes', 'müsli', 'granola', 'havrefras', 'flingor', 'crunchy müsli'] },
  { sub: 'honung', patterns: ['honung', 'flytande honung'] },
  { sub: 'sylt_marmelad', patterns: ['sylt', 'marmelad', 'jordgubbssylt', 'hallonsylt', 'lingonsylt', 'hjortronsylt', 'apelsinmarmelad', 'äppelmos'] },
  { sub: 'sött_pålägg', patterns: ['nutella', 'chokladpålägg', 'jordnötssmör', 'kakaokräm', 'nötkräm'] },
  { sub: 'konserver', patterns: ['krossade tomater', 'tomatkonserv', 'tonfisk i', 'majs (konserv)', 'kondenserad mjölk', 'passerade tomater', 'tomatkross', 'tomater på burk', 'hela tomater', 'hela tomater på burk', 'körsbärstomater på burk', 'tomatpuré', 'tomatpure', 'passata'] },
  { sub: 'soppor_mos', patterns: ['soppa', 'pulversoppa', 'buljongsoppa', 'tomatsoppa', 'potatismos', 'potatismospulver', 'mospulver', 'nyponsoppa', 'blåbärssoppa', 'ärtsoppa', 'kycklingsoppa', 'svampsoppa'] },
  { sub: 'baljväxter', patterns: ['kikärtor', 'svarta bönor', 'kidneybönor', 'vita bönor', 'linser', 'gula ärtor'] },
  { sub: 'mjöl_bakingredienser', patterns: ['vetemjöl', 'rågmjöl', 'mannagryn', 'jäst', 'bakpulver', 'bikarbonat', 'florsocker', 'strösocker', 'farinsocker', 'sirap', 'kakao', 'vaniljsocker', 'sockerkaka mix', 'socker', 'pärlsocker', 'ströbröd', 'våffelmix', 'pannkaksmix', 'kakmix', 'muffinsmix', 'brödmix', 'sockerkaksmix', 'mandelmjöl', 'kokosmjöl', 'potatismjöl', 'majsstärkelse', 'maizena'] },
  { sub: 'olja_vinäger', patterns: ['olivolja', 'rapsolja', 'kokosolja', 'solrosolja', 'sesamolja', 'balsamico', 'äppelcidervinäger', 'rödvinsvinäger', 'vinäger', 'olja'] },
  { sub: 'kryddor_buljong', patterns: ['salt', 'peppar', 'svartpeppar', 'paprikapulver', 'curry', 'kanel', 'kardemumma', 'oregano', 'paprika (krydda)', 'buljongtärningar', 'kycklingbuljong', 'grönsaksbuljong', 'köttbuljong', 'chiliflakes', 'chiliflingor', 'chilipulver', 'gurkmeja', 'spiskummin', 'kummin', 'muskot', 'kryddpeppar', 'lagerblad', 'garam masala', 'cayennepeppar', 'malen koriander', 'mald koriander', 'malen ingefära', 'mald ingefära', 'buljongtärning', 'kycklingbuljongtärning', 'grönsaksbuljongtärning', 'köttbuljongtärning', 'hönsbuljong'] },
  { sub: 'sås_dressing', patterns: ['ketchup', 'senap', 'majonnäs', 'sweet chili', 'sojasås', 'sambal oelek', 'dressing', 'caesardressing', 'hamburgerdressing', 'rhode island', 'pesto', 'aioli', 'dijonsenap', 'soja', 'japansk soja', 'kinesisk soja', 'pastasås', 'tomatsås', 'bolognesesås', 'arrabbiatasås', 'grillsås'] },
  { sub: 'nötter_frön_torra', patterns: ['mandlar', 'cashewnötter', 'jordnötter', 'hasselnötter', 'valnötter', 'pinjenötter', 'pumpafrön', 'solrosfrön', 'sesamfrön', 'chiafrön', 'linfrön', 'russin', 'aprikoser', 'dadlar', 'torkad frukt', 'katrinplommon', 'tranbär (torkade)', 'fikon (torkade)', 'torkade aprikoser', 'torkade tranbär', 'torkade fikon', 'nötmix', 'studentmix', 'pumpakärnor', 'pekannötter', 'paranötter', 'pistagenötter', 'macadamianötter'] },
  // Snacks & godis
  { sub: 'godis', patterns: ['godis', 'gelégodis', 'salta lakritsar', 'sura' /* karameller */, 'kola'] },
  { sub: 'choklad', patterns: ['choklad', 'mörk choklad', 'mjölkchoklad', 'choklad bar', 'nougat'] },
  { sub: 'chips_salt', patterns: ['chips', 'ostbågar', 'cheez doodles', 'popcorn', 'salta pinnar', 'tortillachips', 'pretzels'] },
  { sub: 'naturgodis', patterns: ['torkad frukt', 'russin', 'dadlar', 'torkade aprikoser', 'nötblandning', 'nötmix', 'proteinbar', 'fruktbar', 'naturgodis', 'müslibar', 'energibar', 'bars', 'nötbar'] },
  // Drycker
  { sub: 'läsk', patterns: ['cola', 'pepsi', 'fanta', 'sprite', 'läsk', 'lemonad'] },
  { sub: 'juice', patterns: ['juice', 'apelsinjuice', 'äppeljuice', 'fruktjuice', 'must'] },
  { sub: 'vatten', patterns: ['vatten', 'mineralvatten', 'kolsyrat vatten', 'ramlösa'] },
  { sub: 'sport_energidryck', patterns: ['energidryck', 'red bull', 'nocco', 'celsius', 'sportdryck', 'gatorade', 'powerade'] },
  { sub: 'saft_koncentrat', patterns: ['saft', 'blandsaft', 'koncentrat', 'squash'] },
  { sub: 'kaffe_te', patterns: ['kaffe', 'snabbkaffe', 'espressopulver', 'kaffekapslar', 'bryggkaffe', 'kaffefilter', 'te', 'tepåsar', 'grönt te', 'svart te', 'rooibos', 'kamomill', 'oboy', 'chokladdryck', 'pulverchoklad', 'varm choklad', 'kakaodryck', 'chokladpulver'] },
  { sub: 'taco_texmex', patterns: ['tortillabröd', 'tortillas', 'tortilla', 'tacoskal', 'tacosås', 'tacokrydda', 'tacokryddmix', 'taco', 'tacos', 'salsa', 'salsasås', 'fajitakrydda', 'burritokrydda', 'enchiladasås', 'refried beans', 'guacamolemix'] },
  { sub: 'världens_mat', patterns: ['currypasta', 'röd currypasta', 'grön currypasta', 'gul currypasta', 'kokosmjölk', 'kokosgrädde', 'lätt kokosmjölk', 'fisksås', 'ostronsås', 'hoisinsås', 'teriyakisås', 'mango chutney', 'chutney', 'papadums', 'tikka masala sås', 'currysås', 'tahini', 'wasabi', 'risvinäger', 'misopasta'] },
  { sub: 'alkoholfritt_öl_cider', patterns: ['alkoholfri öl', 'alkoholfri cider', 'alkoholfritt'] },
  { sub: 'alkoholhaltigt', patterns: ['öl', 'vin', 'rödvin', 'vitt vin', 'rosévin', 'cider', 'sprit', 'whisky', 'vodka', 'gin'] },
  // Specialkost
  // Engelska former också: importerade recept kan innehålla oöversatta namn
  // ("gluten free pasta"), och de ska hamna i specialkost som alla andra.
  { sub: 'glutenfritt', patterns: ['glutenfri', 'glutenfritt', 'glutenfria', 'gluten free', 'gluten-free'] },
  { sub: 'veg_protein', patterns: ['tofu', 'tempeh', 'quorn', 'oumph', 'seitan', 'sojafärs', 'vegofärs', 'sojabitar', 'falafel', 'växtbaserad färs', 'beyond meat'] },
  { sub: 'vegan', patterns: ['vegan'] },
  // Städ & rengöring
  { sub: 'diskmedel', patterns: ['diskmedel', 'maskindisk', 'disktabletter', 'sköljmedel (disk)'] },
  { sub: 'tvättmedel', patterns: ['tvättmedel', 'sköljmedel', 'fläckborttagning', 'klorin'] },
  { sub: 'ytrengöring', patterns: ['ytrengöring', 'allrent', 'badrumsrengöring', 'fönsterputs', 'ugnsrengöring'] },
  { sub: 'städredskap', patterns: ['svampar', 'disktrasa', 'sopborste', 'mopp', 'soppåsar', 'sopsäckar'] },
  { sub: 'folie_matförvaring', patterns: ['plastfolie', 'aluminiumfolie', 'folie', 'bakplåtspapper', 'fryspåsar', 'plastpåsar', 'papperspåsar', 'muffinsformar', 'matlådor', 'frysboxar', 'gladpack', 'smörgåspapper', 'brödpåsar'] },
  { sub: 'toalett_hushållspapper', patterns: ['toalettpapper', 'toapapper', 'hushållspapper', 'pappershanddukar', 'servetter', 'pappersservetter'] },
  // Hygien & personvård
  { sub: 'tandvård', patterns: ['tandkräm', 'tandborste', 'tandtråd', 'munvatten'] },
  { sub: 'hårvård', patterns: ['schampo', 'balsam', 'hårinpackning', 'hårspray', 'styling'] },
  { sub: 'duschtvål_hudvård', patterns: ['duschgel', 'duschtvål', 'tvål', 'handkräm', 'ansiktskräm', 'bodylotion', 'deodorant', 'rakkräm'] },
  { sub: 'intimhygien', patterns: ['bindor', 'tamponger', 'intimtvätt', 'trosskydd'] },
  { sub: 'mediciner', patterns: ['alvedon', 'ipren', 'paracetamol', 'plåster', 'huvudvärkstabletter', 'magmedicin'] },
  { sub: 'smink_kosmetika', patterns: ['mascara', 'foundation', 'läppstift', 'smink', 'nagellack', 'kosmetika', 'concealer'] },
  // Baby & barn
  { sub: 'barnmat', patterns: ['barnmat', 'välling', 'barngröt', 'klämmis', 'modersmjölksersättning', 'bröstmjölksersättning'] },
  { sub: 'blöjor', patterns: ['blöjor', 'blöja', 'våtservetter'] },
  { sub: 'baby_barn', patterns: ['napp', 'nappflaska', 'barnschampo'] },
  // Övrigt
  { sub: 'husdjur', patterns: ['hundmat', 'kattmat', 'hundgodis', 'kattsand', 'kattgrus'] },
  { sub: 'blommor_växter', patterns: ['blommor', 'krukväxt', 'krukor', 'växtjord', 'gödsel'] },
  { sub: 'hushållsvaror', patterns: ['ljus', 'tändstickor'] },
  { sub: 'batteri_elektronik', patterns: ['batteri', 'laddare', 'usb-kabel', 'batterier', 'glödlampa', 'glödlampor', 'lampa', 'lampor', 'led-lampa', 'ledlampa', 'ficklampa'] },
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

// Torkade örter står i kryddhyllan, inte bland de färska i frukt & grönt —
// "torkad timjan" är en annan vara än timjan. Samma regel som klassarens
// "torkad"-undantag (categorizeIngredient.ts), annars säger underkategori och
// kategori emot varandra.
const DRIED = /^torka(d|de|t)\s/;

export function inferSubCategory(name: string): SubCategory | null {
  const haystack = name.toLowerCase().trim();
  if (!haystack) return null;
  if (DRIED.test(haystack)) {
    const rest = inferSubCategory(haystack.replace(DRIED, ''));
    if (rest === 'örter_sallad' || rest === 'kryddor_buljong') return 'kryddor_buljong';
    if (rest === 'frukt' || rest === 'bär' || rest === 'nötter_frön_torra') return 'nötter_frön_torra';
    return null;
  }

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
