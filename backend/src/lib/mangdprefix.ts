import { stripIngredient, startsWithUnit, ärMängdOrd } from './stripIngredient';

/**
 * Namn som bär med sig en mängd: "1/2 dl strösocker", "kg potatis", "port ris".
 *
 * De kommer från receptimporter där mängden aldrig lyftes ur namnet, och de
 * blir egna basvaror vid sidan av den riktiga varan — "1/2 dl strösocker" är
 * inte samma rad som "strösocker", så sökförslagen och kategorin delas inte.
 *
 * Beslutet är avsiktligt trubbigt: bara namn som BÖRJAR med en mängd eller en
 * enhet rörs. "torkad dragon" och "krossade tomater" ser ut som beskrivningar
 * men är egna varor, och de börjar inte med en enhet.
 */
export type Städbeslut =
  | { åtgärd: 'behåll' }
  | { åtgärd: 'byt'; till: string }
  | { åtgärd: 'radera'; varför: string };

const BÖRJAR_MED_SIFFRA = /^[\d½¼¾⅓⅔⅛⅜⅝⅞]/u;

export function stadaMangdprefix(namn: string): Städbeslut {
  const n = namn.trim();
  if (n.length === 0) return { åtgärd: 'radera', varför: 'tomt namn' };
  // Hela namnet ÄR en enhet ("förp", "dl") — ingen vara att rädda.
  if (ärMängdOrd(n)) return { åtgärd: 'radera', varför: 'bara en mängd, ingen vara' };
  if (!BÖRJAR_MED_SIFFRA.test(n) && !startsWithUnit(n)) return { åtgärd: 'behåll' };

  const kvar = stripIngredient(n);
  // Blev det bara en enhet kvar ("1/2 dl" → "dl") fanns ingen vara i namnet.
  if (kvar.length === 0 || ärMängdOrd(kvar) || startsWithUnit(kvar) || BÖRJAR_MED_SIFFRA.test(kvar)) {
    return { åtgärd: 'radera', varför: 'bara en mängd, ingen vara' };
  }
  if (kvar === n.toLowerCase()) return { åtgärd: 'behåll' };
  return { åtgärd: 'byt', till: kvar };
}
