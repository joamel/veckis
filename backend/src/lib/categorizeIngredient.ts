import { StoreCategory } from '@prisma/client';

const RULES: { keywords: string[]; category: StoreCategory }[] = [
  {
    category: 'fruit_veg',
    keywords: [
      'äpple', 'päron', 'banan', 'apelsin', 'citron', 'lime', 'grapefrukt', 'mandarin',
      'melon', 'vattenmelon', 'mango', 'ananas', 'kiwi', 'persika', 'plommon', 'körsbär',
      'vindruv', 'hallon', 'blåbär', 'jordgubbar', 'björnbär', 'krusbär', 'fikon',
      'tomat', 'gurka', 'paprika', 'lök', 'rödlök', 'gul lök', 'purjolök', 'salladslök',
      'vitlök', 'morot', 'potatis', 'sötpotatis', 'broccoli', 'blomkål', 'romanesco',
      'spenat', 'sallad', 'rucola', 'isbergssallad', 'kål', 'vitkål', 'rödkål', 'grönkål',
      'brysselkål', 'selleri', 'rotselleri', 'fänkål', 'rädisa', 'rättika', 'palsternacka',
      'rödbeta', 'majs', 'avokado', 'zucchini', 'aubergine', 'pumpa', 'squash',
      'sparris', 'kronärtskocka', 'ärtor', 'bönor', 'haricots verts', 'socker­ärtor',
      'svamp', 'champinjoner', 'kantareller', 'shiitake', 'portobello',
      'ingefära', 'chili', 'jalapeño', 'mynta', 'basilika', 'persilja', 'koriander',
      'dill', 'timjan', 'rosmarin', 'oregano', 'gräslök',
    ],
  },
  {
    category: 'meat_fish',
    keywords: [
      'kyckling', 'kycklingfilé', 'kycklinglår', 'kycklingvinge', 'kycklinglever',
      'nötkött', 'nötfärs', 'köttfärs', 'biff', 'entrecôte', 'oxfilé', 'högrev', 'innanlår',
      'fläskkött', 'fläskfilé', 'fläskkarré', 'fläskkotlett', 'revbensspjäll',
      'lamm', 'lammkotlett', 'lammfärs', 'lammbog',
      'kalv', 'kalvkött',
      'bacon', 'pancetta', 'chorizo', 'salami', 'prosciutto', 'skinka', 'kokt skinka',
      'korv', 'falukorv', 'bratwurst', 'merguez',
      'lax', 'rökt lax', 'gravad lax', 'laxfilé',
      'torsk', 'torskfilé', 'pangasius', 'tilapia', 'havsabborre', 'rödspätta',
      'tonfisk', 'makrill', 'sill', 'sardiner', 'ansjovis',
      'räkor', 'hummar', 'krabba', 'bläckfisk', 'musslor', 'ostron',
      'fisk', 'kött', 'skaldjur', 'fiskfilé',
    ],
  },
  {
    category: 'dairy_eggs',
    keywords: [
      'mjölk', 'helmjölk', 'mellanmjölk', 'lättmjölk', 'laktosfri mjölk',
      'grädde', 'vispgrädde', 'crème fraiche', 'gräddfil', 'fil', 'filmjölk',
      'yoghurt', 'greek yoghurt', 'kvarg', 'kesella',
      'smör', 'margarin',
      'ost', 'cheddar', 'mozzarella', 'parmesan', 'brie', 'camembert', 'gouda',
      'fetaost', 'halloumi', 'ricotta', 'mascarpone', 'roquefort', 'gorgonzola',
      'ägg', 'äggvita', 'äggula',
      'kondenserad mjölk', 'kokosmjölk',
    ],
  },
  {
    category: 'bread_bakery',
    keywords: [
      'bröd', 'limpa', 'franska', 'baguette', 'ciabatta', 'focaccia', 'surdegsbröd',
      'knäckebröd', 'rågbröd', 'grovbröd', 'vitt bröd', 'toast',
      'bulle', 'kanelbulle', 'croissant', 'bagel', 'pitabröd', 'tortilla', 'tunnbröd',
      'kaka', 'muffin', 'scones', 'paj', 'tårta',
    ],
  },
  {
    category: 'frozen',
    keywords: [
      'fryst', 'frysta', 'frysvaror', 'frozen', 'glass', 'sorbet',
      'fryst pizza', 'fryst fisk', 'fryst grönsak', 'fryst bär',
      'pizzabotten', 'peas frozen', 'ärtor frysta',
    ],
  },
  {
    category: 'canned_dry',
    keywords: [
      'pasta', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'linguine', 'rigatoni',
      'ris', 'basmatiris', 'jasminris', 'råris', 'parboiledris',
      'nudlar', 'glasnudlar', 'ramen', 'udon',
      'linser', 'röda linser', 'gröna linser',
      'bönor', 'kidneybönor', 'svarta bönor', 'vita bönor', 'cannellini', 'pintobönor',
      'kikärtor', 'edamame',
      'tomatkross', 'krossade tomater', 'tomatpuré', 'passata',
      'konserv', 'burkmat', 'burk',
      'mjöl', 'vetemjöl', 'rågmjöl', 'dinkelmjöl', 'majsmjöl', 'mandelm­jöl',
      'socker', 'florsocker', 'råsocker', 'farinsocker',
      'salt', 'havssalt', 'flingsalt',
      'peppar', 'vitpeppar', 'svartpeppar', 'cayenne', 'paprikapulver', 'kanel', 'kardemumma',
      'olja', 'olivolja', 'rapsolja', 'kokosolja', 'sesamolja',
      'vinäger', 'balsamvinäger', 'vitvinsvinäger', 'äppelcidervinäger',
      'soja', 'tamari', 'fish sauce', 'worchestershire',
      'senap', 'dijonsenap', 'fullkornssenap',
      'ketchup', 'barbecuesås', 'sweet chili', 'sriracha', 'tabasco',
      'majonnäs', 'aioli', 'remoulade',
      'buljong', 'grönsaksbuljong', 'kycklingbuljong', 'köttbuljong',
      'bakpulver', 'bikarbonat', 'jäst', 'torrjäst',
      'vanilj', 'vanillinsocker', 'vaniljextrakt',
      'kakao', 'chokladpulver', 'nutella', 'jordnötssmör',
      'honung', 'lönnsirap', 'agave',
      'havre', 'havregry', 'havregryn', 'müsli', 'granola', 'cornflakes',
      'nötmix', 'solrosfrön', 'pumpakärnor', 'sesamfrön', 'chiafrön', 'linfrön',
    ],
  },
  {
    category: 'snacks_sweets',
    keywords: [
      'chips', 'popcorn', 'nachos', 'pretzel',
      'godis', 'lösgodis', 'choklad', 'kex', 'kola', 'lakrits',
      'nötter', 'mandel', 'cashew', 'jordnötter', 'pistager', 'valnötter', 'pekan',
      'bars', 'proteinbar', 'müslibar',
    ],
  },
  {
    category: 'beverages',
    keywords: [
      'juice', 'apelsinjuice', 'äppeljuice',
      'vatten', 'mineralvatten', 'kolsyrat vatten',
      'kaffe', 'espresso', 'nescafé',
      'te', 'grönt te', 'svart te', 'örtte',
      'läsk', 'cola', 'fanta', 'sprite',
      'öl', 'lager', 'ipa', 'ale',
      'vin', 'rödvin', 'vitvin', 'rosé', 'prosecco', 'champagne',
      'cider', 'äppelcider',
      'sportdryck', 'energidryck', 'smoothie',
      'kokos­vatten', 'saft', 'cordial',
    ],
  },
  {
    category: 'cleaning',
    keywords: [
      'diskmedel', 'diskmaskinspulver', 'disktablett',
      'tvättmedel', 'sköljmedel', 'torkmedel', 'tvättkapsel',
      'allrengöring', 'rengöring', 'wc-rengöring', 'toalettrengöring',
      'svamp', 'skursvamp', 'skurdukar', 'hushållspapper', 'papper',
      'soppåsar', 'papperspåsar', 'aluminiumfolie', 'plastfolie', 'bakplåtspapper',
    ],
  },
  {
    category: 'personal_care',
    keywords: [
      'schampo', 'balsam', 'hårinpackning',
      'tandkräm', 'tandborste', 'tandtråd', 'munskölj',
      'deodorant', 'antiperspirant',
      'tvål', 'handtvål', 'duschtvål', 'duschkräm',
      'rakhyvel', 'rakskum', 'rakgel',
      'hudkräm', 'lotion', 'solskydd',
      'tamponger', 'bindor', 'mens',
      'medicin', 'paracetamol', 'ibuprofen', 'vitaminer', 'kosttillskott',
      'plåster', 'bandage',
    ],
  },
];

export function categorizeIngredient(name: string): StoreCategory {
  const lower = name.toLowerCase().trim();
  for (const rule of RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.category;
    }
  }
  return 'other';
}
