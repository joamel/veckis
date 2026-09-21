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
      'dill', 'timjan', 'rosmarin', 'oregano', 'gräslök', 'granatäpple', 'rabarber',
    ],
  },
  {
    category: 'meat_fish',
    keywords: [
      'kyckling', 'kycklingfilé', 'kycklinglår', 'kycklingvinge', 'kycklinglever',
      // "fläsk" som ordbörjan täcker fläskfilé, fläskkarré och fläskkotlett.
      // "sidfläsk" fångas av en egen post, eftersom det inte BÖRJAR på fläsk.
      'fläsk', 'sidfläsk', 'rimmat sidfläsk',
      'kalkon', 'kalkonfilé', 'kalkonbröst', 'kalv', 'kalvkött',
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
    category: 'cheese',
    keywords: [
      'ost', 'cheddar', 'mozzarella', 'burrata', 'parmesan', 'brie', 'camembert', 'gouda',
      'fetaost', 'halloumi', 'ricotta', 'mascarpone', 'roquefort', 'gorgonzola',
      'gruyère', 'pecorino', 'manchego', 'emmentaler', 'edam', 'raclette',
    ],
  },
  {
    category: 'dairy_eggs',
    keywords: [
      'mjölk', 'helmjölk', 'mellanmjölk', 'lättmjölk', 'laktosfri mjölk',
      'grädde', 'vispgrädde', 'crème fraiche', 'gräddfil', 'fil', 'filmjölk',
      'yoghurt', 'greek yoghurt', 'kvarg', 'kesella',
      'smör', 'margarin',
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
      'quorn', 'quornbitar', 'quornfärs',
      'fryst pizza', 'fryst fisk', 'fryst grönsak', 'fryst bär',
      'pizzabotten', 'peas frozen', 'ärtor frysta',
    ],
  },
  {
    category: 'canned_dry',
    keywords: [
      // Fonder skrivs ihop ("grönsaksfond"), och regeln matchar på ordbörjan —
      // så varje sammansättning behöver stå för sig.
      'garam masala', 'fond', 'grönsaksfond', 'kycklingfond', 'köttfond',
      'fiskfond', 'svampfond', 'buljong', 'buljongtärning',
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
      'toalettpapper', 'hushållspapper', 'pappersservett', 'näsduk',
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

/**
 * Matchar ett nyckelord mot ett varunamn.
 *
 * Nyckelordet måste börja ett ORD i namnet, inte bara förekomma någonstans i
 * det. Ren delsträngssökning gav absurda utfall, eftersom flera nyckelord är
 * två–tre tecken långa: "sidfläsk" innehåller "läsk" och "toalettpapper"
 * innehåller "te", så bägge klassades som dryck. Det upptäcktes först när den
 * kurerade klassaren skulle bli sanning för hela poolen (2026-09-19).
 *
 * Ordbörjan och inte helt ord, för svenskan bygger sammansättningar: "kyckling"
 * ska fortfarande träffa "kycklingfilé" och "lax" träffa "laxfilé". Däremot
 * slutar "smör" träffa "jordnötssmör", vilket är rätt — det är en skafferivara,
 * inte mejeri.
 *
 * Nyckelord med mellanslag ("gul lök", "kokt skinka") matchas mot hela namnet,
 * eftersom de aldrig kan vara ett enskilt ord.
 */
// Diakriter i LÅNORD, och bara de. Å, Ä och Ö är egna bokstäver i svenskan,
// inte a/o med prickar — de får aldrig vikas ihop.
//
// Första versionen använde Unicode-normalisering rakt av, vilket gjorde "kål"
// till "kal" och därmed en delsträng av "kallrökt". Kallrökt lax klassades som
// frukt & grönt. Samma fälla hade träffat kalkon, kalvkött och kalops.
const LÅNORDSDIAKRITER: Record<string, string> = {
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  á: 'a', à: 'a', â: 'a',
  ç: 'c', ñ: 'n',
};

/** "crème fraîche" och "creme fraiche" ska vara samma vara — olika receptsajter
 *  stavar lånord olika, och stavningen ska inte avgöra vilken hylla varan
 *  hamnar på. Svenska bokstäver lämnas orörda. */
function utanAccent(s: string): string {
  return s.replace(/[éèêëíìîïóòôúùûüáàâçñ]/g, c => LÅNORDSDIAKRITER[c] ?? c);
}

function matchar(namn: string, ord: string[], kw: string): boolean {
  const nyckel = utanAccent(kw);
  // Flerordsnyckelord kan aldrig vara ett enskilt ord — de jämförs mot hela
  // namnet. Också de utan accenter: annars matchade "crème fraiche 34%" men
  // inte "creme fraiche", vilket är samma vara stavad på två sätt.
  if (kw.includes(' ')) return utanAccent(namn).includes(nyckel);
  return ord.some(o => utanAccent(o).startsWith(nyckel));
}

/**
 * Undantag som prövas FÖRE reglerna, för varor där råvarans namn leder fel.
 *
 * Krossade tomater är en skafferivara, inte en färskvara — men innehåller
 * "tomat" och hamnade därför i frukt & grönt. Jäst står i kyldisken vid
 * mejeriet i svensk butik, inte i skafferiet. Sådant går inte att lösa med
 * nyckelord i råvaruregeln, eftersom första träffande regel vinner.
 *
 * Det HÄR är kureringen: ser du en vara ligga fel i /api/admin/category-gaps
 * eller i torrkörningen av repair:categories, lägg till en rad här.
 */
const UNDANTAG: { frasar: string[]; category: StoreCategory }[] = [
  {
    category: 'canned_dry',
    frasar: ['krossade tomater', 'passerade tomater', 'soltorkade tomater', 'tomatpuré', 'tomatpure', 'körsbärstomater på burk'],
  },
  {
    // Färsk jäst är kylvara och står vid mejeriet.
    category: 'dairy_eggs',
    frasar: ['jäst'],
  },
  {
    // Glutenfritt står i specialkosthyllan, inte hos den vanliga varan:
    // glutenfri pasta ligger inte bland pastan. Måste prövas FÖRE
    // råvaruregeln, som annars ser "pasta" och säger skafferi.
    // Engelska former med, eftersom oöversatta importnamn förekommer.
    category: 'special_diet',
    frasar: ['glutenfri', 'glutenfritt', 'glutenfria', 'gluten free', 'gluten-free'],
  },
  {
    // Sylt och rårörda bär är skafferi/kyl, inte bär. Måste stå FÖRE
    // bär-regeln nedan, som annars drar med sig allt som börjar på "lingon".
    category: 'canned_dry',
    frasar: [
      'rårörda lingon', 'lingonsylt', 'hjortronsylt', 'blåbärssylt', 'sylt', 'marmelad',
      // Torkade och malda former av grönsaker är kryddor, inte grönsaker.
      // Måste stå före råvaruregeln, som annars ser "vitlök" i "vitlökspulver".
      'vitlökspulver', 'lökpulver', 'paprikapulver', 'chilipulver', 'ingefärspulver', 'senapspulver',
    ],
  },
  {
    // Färska ärtsorter, FÖRE både frys-undantaget nedan och socker-regeln.
    // "sockerärtor" börjar på "socker" och blev torrvara — samma sorts fel som
    // "läsk" i "sidfläsk", fast via ordbörjan i stället för delsträng.
    category: 'fruit_veg',
    frasar: ['sockerärtor', 'ärtskidor', 'ärtskott'],
  },
  {
    // Ärtor och lingon köps nästan alltid frysta — lingon som de där bären man
    // toppar en biff Rydberg med, inte som sylt. Sylten fångas av
    // undantaget ovan, som prövas först. Exakt ordmatchning, så färska sorter
    // ovan inte dras med.
    category: 'frozen',
    frasar: ['ärtor', 'ärter', 'gröna ärtor', 'lingon'],
  },
];

/**
 * Bara de KURERADE undantagen — inga nyckelordsregler.
 *
 * Undantagen är uttryckliga påståenden om var en vara står i butiken
 * ("lingon köps frysta", "krossade tomater är skafferi"), skrivna för hand när
 * någon sett varan hamna fel. De ska därför väga tyngre än en automatisk
 * gissning på underkategori — inferSubCategory säger att lingon är ett bär,
 * vilket är sant men irrelevant för vilken hylla man går till.
 *
 * Returnerar null när inget undantag träffar, så kallaren kan gå vidare till
 * sina egna källor i stället för att få ett svagt svar.
 */
export function kureratUndantag(name: string): StoreCategory | null {
  const lower = name.toLowerCase().trim();
  const ord = lower.split(/[\s,.;:()[\]/\|+–—-]+/).filter(Boolean);

  if (ord[0] === 'torkad' || ord[0] === 'torkade' || ord[0] === 'torkat') return 'canned_dry';

  for (const u of UNDANTAG) {
    if (u.frasar.some(f => (f.includes(' ') ? lower.includes(f) : ord.includes(f)))) return u.category;
  }
  return null;
}

export function categorizeIngredient(name: string): StoreCategory {
  const lower = name.toLowerCase().trim();
  // Dela på skiljetecken, inte på "allt som inte är en svensk bokstav". Den
  // förra varianten listade tillåtna tecken, och då blev varje accent en
  // ordgräns: "crème fraîche" styckades i cr/me/fra/che och matchade förstås
  // ingenting. Lånorden i en matbutik är fulla av accenter.
  const ord = lower.split(/[\s,.;:()[\]/\|+–—-]+/).filter(Boolean);

  // Torkat prövas FÖRE reglerna. Som nyckelord i skafferi-regeln hade det inte
  // räckt: örterna ligger i frukt & grönt-regeln, som kommer först, så
  // "torkad timjan" blev färskvara. Det är själva ordet "torkad" som avgör
  // hyllan, oavsett vad som kommer efter.
  if (ord[0] === 'torkad' || ord[0] === 'torkade' || ord[0] === 'torkat') {
    return 'canned_dry';
  }

  for (const u of UNDANTAG) {
    if (u.frasar.some(f => (f.includes(' ') ? lower.includes(f) : ord.includes(f)))) {
      return u.category;
    }
  }
  for (const rule of RULES) {
    if (rule.keywords.some(kw => matchar(lower, ord, kw))) {
      return rule.category;
    }
  }
  return 'other';
}
