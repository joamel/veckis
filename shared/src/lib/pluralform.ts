/**
 * Pluralform för varunamn i inköpslistan.
 *
 * "5 gurka" är fel svenska; det heter "5 gurkor". Varunamnen lagras i
 * singular (kanonisk form), så pluralen måste tas fram vid visning.
 *
 * Svensk pluralböjning går INTE att räkna ut generellt: gurka→gurkor,
 * tomat→tomater, lök→lökar, ägg→ägg och morot→morötter följer fyra olika
 * deklinationer plus omljud. Därför en tabell över de varor som faktiskt
 * förekommer, och okända namn lämnas orörda — det är precis vad appen gör
 * idag, så resultatet kan aldrig bli sämre än utgångsläget.
 *
 * Flerordsnamn lämnas också orörda: adjektivet måste kongruera med
 * huvudordet ("gul lök" → "gula lökar"), och att böja bara sista ordet ger
 * "gul lökar".
 */
const PLURALER: Record<string, string> = {
  // -or (första deklinationen, ord på -a)
  gurka: 'gurkor', tomat: 'tomater', paprika: 'paprikor', oliv: 'oliver',
  banan: 'bananer', citron: 'citroner', lime: 'limefrukter', apelsin: 'apelsiner',
  morot: 'morötter', potatis: 'potatisar', lök: 'lökar', rödlök: 'rödlökar',
  vitlök: 'vitlökar', purjolök: 'purjolökar', salladslök: 'salladslökar',
  äpple: 'äpplen', päron: 'päron', persika: 'persikor', plommon: 'plommon',
  avokado: 'avokado', mango: 'mango', kiwi: 'kiwi', melon: 'meloner',
  zucchini: 'zucchini', aubergine: 'auberginer', champinjon: 'champinjoner',
  broccoli: 'broccoli', blomkål: 'blomkål', majskolv: 'majskolvar',
  // Kött, fisk, mejeri
  ägg: 'ägg', kycklingfilé: 'kycklingfiléer', laxfilé: 'laxfiléer',
  korv: 'korvar', biff: 'biffar', köttbulle: 'köttbullar', räka: 'räkor',
  // Skafferi och bageri
  bulle: 'bullar', limpa: 'limpor', baguette: 'baguetter', tortilla: 'tortillas',
  // Förpackningsenheter — de står i enhetsfältet och böjs med antalet:
  // "2 flaskor", "3 påsar". Måttenheter (dl, g, kg, msk, tsk) står MED FLIT
  // inte här: de böjs inte på svenska, och "2 dl" ska förbli "2 dl".
  burk: 'burkar', påse: 'påsar', paket: 'paket', flaska: 'flaskor',
  kruka: 'krukor', knippe: 'knippen', förpackning: 'förpackningar',
  kartong: 'kartonger', ask: 'askar', tub: 'tuber', klyfta: 'klyftor',
  skiva: 'skivor', näve: 'nävar', kolv: 'kolvar', pase: 'påsar',
  nöt: 'nötter', mandel: 'mandlar', dadel: 'dadlar', fikon: 'fikon',
};

/**
 * Namnet som det ska visas för ett givet antal.
 *
 * Singular vid 1 (och vid saknat antal), plural däröver. Okända namn och
 * flerordsnamn returneras oförändrade.
 */
export function visningsnamn(namn: string, antal: number | null | undefined): string {
  if (antal == null || antal <= 1) return namn;
  if (/\s/.test(namn.trim())) return namn;

  const nyckel = namn.trim().toLowerCase();
  const plural = PLURALER[nyckel];
  if (!plural) return namn;

  // Behåll ursprungets inledande versal ("Gurka" → "Gurkor").
  return namn[0] === namn[0].toUpperCase() && namn[0] !== namn[0].toLowerCase()
    ? plural[0].toUpperCase() + plural.slice(1)
    : plural;
}
