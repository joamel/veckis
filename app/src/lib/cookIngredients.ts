/**
 * Vilka ingredienser som ska synas i laga-lägets lista för ett givet steg.
 *
 * Regeln bor här och inte i skärmfilen för att gå att testa: den ser trivial
 * ut men har ett par kanter (kvitto på egen bock, väg tillbaka efter felbock)
 * som är lätta att råka bygga bort vid en senare ändring.
 */

/**
 * En ingrediens syns om den är obockad, ELLER om den bockades av på ett steg
 * man ännu inte lämnat.
 *
 * - Obockad → syns alltid.
 * - Bockad på det här steget → syns överstruken. Kvitto på att trycket gick
 *   fram, och en chans att ångra innan man går vidare.
 * - Bockad på ett TIDIGARE steg → dold. Den är redan i grytan och tar bara
 *   plats i listan.
 * - Bockad på ett SENARE steg (man har backat) → syns igen, eftersom listan
 *   ska visa läget som det var vid det steget. Det är också vägen tillbaka om
 *   man bockat fel och redan bläddrat vidare.
 */
export function ärSynligPåSteg(bockatPåSteg: number | undefined, cookStep: number): boolean {
  return bockatPåSteg === undefined || bockatPåSteg >= cookStep;
}

/** Filtrerar en ingredienslista enligt ärSynligPåSteg. */
export function kvarvarandePåSteg<T extends { id: string }>(
  ingredienser: T[],
  bockade: Map<string, number>,
  cookStep: number
): T[] {
  return ingredienser.filter(i => ärSynligPåSteg(bockade.get(i.id), cookStep));
}
