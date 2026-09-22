import { stripIngredient } from './stripIngredient';
import { hittaLiknande } from './liknandeNamn';
import type { TolkadVara } from './inkopstext';

export type Matchkälla = 'basvara' | 'kanonisering';

export type MatchadVara = TolkadVara & {
  /** Namnet som stod i den importerade listan, när det skiljer sig från det
   *  som kommer att läggas till. Visas i granskningen, och går att välja. */
  original?: string | null;
  källa?: Matchkälla | null;
};

// Pluraländelser: "tomater" → "tomat" och "satsumas" → "satsuma" är samma vara
// i singular, inte en annan vara.
const PLURALSLUT = /^(?:s|r|n|er|ar|or|en|na|orna|erna|arna|ana)$/u;

/**
 * Får kanoniseringen ändra det här namnet?
 *
 * Ett ENORDSNAMN är oftast en sammansättning som betyder en egen vara i
 * hyllan: kanelstänger är inte kanel, halloumispett är inte halloumi och
 * fläskfiléspett är inte fläsk. Alla tre kapades av AI:n i en riktig lista
 * där kanel dessutom stod som egen rad — hopslagningen hade tagit bort en
 * vara användaren faktiskt ville ha. Där släpps bara pluraländelser igenom.
 *
 * Flerordsnamn är tvärtom nästan alltid beskrivningar av en vara: "Arla
 * standardmjölk" → mjölk, "Tandkräm Jordan kids" → tandkräm. Dem rör vi inte.
 */
export function kanoniseringDuger(original: string, kanoniskt: string): boolean {
  if (original === kanoniskt) return false;
  if (original.includes(' ')) return true;
  if (!original.startsWith(kanoniskt)) return false;
  return PLURALSLUT.test(original.slice(kanoniskt.length));
}

// Ord som skiljer två varor åt i butiken, inte bara i beskrivningen: de står
// i en annan hylla, eller så är det en annan produkt. Försvinner ett sådant
// ord i en matchning är matchningen fel — "lingon frysta" blev "lingon",
// "soja glutenfri" blev "soja" och "grillad kyckling" blev "kyckling".
//
// "malen", "riven" och "hackad" står medvetet INTE här: malen kanel är kanel.
const SKYDDADE_ORD = /\b(?:glutenfri\w*|laktosfri\w*|sockerfri\w*|alkoholfri\w*|alkohol|fryst\w*|frysta|djupfryst\w*|torkad\w*|rökt\w*|grillad\w*|panerad\w*|rostad\w*|inlagd\w*)\b/giu;

/** Behåller kandidaten alla skyddade ord som fanns i originalet? */
export function bevararSkyddadeOrd(original: string, kandidat: string): boolean {
  const iOriginal = original.toLowerCase().match(SKYDDADE_ORD) ?? [];
  if (iOriginal.length === 0) return true;
  const k = kandidat.toLowerCase();
  return iOriginal.every(ord => k.includes(ord.slice(0, 5)));
}

/**
 * Importerade namn → hushållets namn.
 *
 * Fyra steg, i den ordningen:
 *  1. Regelstädning (stripIngredient): tar bort tillagningsord och böjer
 *     enstaka ord till singular.
 *  2. Hushållets egna basvaror, exakt eller nästan (liknandeNamn): fångar
 *     stavfel och andra stavningar av varor NI redan har.
 *  3. AI-kanonisering: varumärken och omskrivningar ("Arla standardmjölk" →
 *     "mjölk"). Resultatet prövas mot basvarorna en gång till, eftersom det
 *     kanoniska namnet kan vara det ni redan använder.
 *  4. Vakterna ovan: en sammansättning blir inte sitt förled, och ett skyddat
 *     ord får aldrig försvinna.
 *
 * Steg 2 före steg 3 med flit: hushållets eget ordval väger tyngre än en
 * generell kanonisering, och det är gratis och omedelbart.
 */
export async function matchaImportnamn(
  varor: TolkadVara[],
  basvaror: string[],
  kanonisera: (namn: string[]) => Promise<string[]>,
): Promise<MatchadVara[]> {
  const basvaruNyckel = new Map(basvaror.map(b => [b.toLowerCase().trim(), b]));

  const steg1 = varor.map(v => {
    const städat = stripIngredient(v.name);
    const exakt = basvaruNyckel.get(städat);
    const liknande = exakt ?? hittaLiknande(städat, basvaror);
    // stripIngredient kan ha tagit bort ett skyddat ord ("lingon frysta" →
    // "lingon"); då är basvaran fel vara, och originalet får stå kvar.
    const träff = liknande && bevararSkyddadeOrd(v.name, liknande) ? liknande : null;
    return { vara: v, städat: bevararSkyddadeOrd(v.name, städat) ? städat : v.name.toLowerCase(), träff };
  });

  // Bara de som inte hittade en egen basvara går till AI:n — ett anrop för
  // hela importen, och svaren cachas av kanoniseraren.
  const kvar = steg1.filter(s => !s.träff);
  const kanoniska = kvar.length > 0 ? await kanonisera(kvar.map(s => s.städat)) : [];
  const kanoniskKarta = new Map(kvar.map((s, i) => [s, kanoniska[i] ?? s.städat]));

  return steg1.map((post): MatchadVara => {
    const { vara, städat, träff } = post;
    let namn = träff ?? städat;
    let källa: Matchkälla | null = träff ? 'basvara' : null;

    if (!träff) {
      const kanoniskt = kanoniskKarta.get(post) ?? städat;
      // Det kanoniska namnet kan vara det hushållet redan använder.
      const efterKanon = basvaruNyckel.get(kanoniskt) ?? hittaLiknande(kanoniskt, basvaror);
      if (efterKanon && bevararSkyddadeOrd(vara.name, efterKanon)) { namn = efterKanon; källa = 'basvara'; }
      else if (kanoniseringDuger(städat, kanoniskt) && bevararSkyddadeOrd(vara.name, kanoniskt)) {
        namn = kanoniskt;
        källa = 'kanonisering';
      }
    }

    const ändrat = namn.toLowerCase() !== vara.name.toLowerCase();
    return {
      ...vara,
      name: namn,
      original: ändrat ? vara.name : null,
      källa: ändrat ? källa : null,
    };
  });
}
