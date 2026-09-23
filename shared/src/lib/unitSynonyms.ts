/**
 * Samma enhet, olika stavning: "förpackning", "förp" och "frp" är ett och
 * samma mått, men lagrades som tre. Då blev det tre rader i listan, tre
 * varianter i ordförrådet, och sammanslagningen hittade inte ihop dem —
 * dubblettarket matchar på namn OCH enhet.
 *
 * Här väljs EN skriven form per enhet. Den korta vinner: en inköpslista läses
 * i förbifarten, och "2 förp" tar mindre plats än "2 förpackningar".
 * Pluralformen sköts vid visning (pluralform.ts), inte i lagringen.
 *
 * Bara synonymer — ingen omräkning. "kg" blir aldrig "g" här; det är
 * unitConversion.ts jobb.
 */

const SYNONYMS: Record<string, string> = {
  // Styck
  stycken: 'st', styck: 'st', stk: 'st', 'st.': 'st',
  // Förpackning
  förpackning: 'förp', förpackningar: 'förp', frp: 'förp', 'förp.': 'förp',
  // Paket
  paket: 'pkt', 'pkt.': 'pkt', pkg: 'pkt',
  // Burk, flaska, påse, kartong — plural till singular
  burkar: 'burk', flaskor: 'flaska', påsar: 'påse', kartonger: 'kartong',
  askar: 'ask', rullar: 'rulle', knippen: 'knippe', klyftor: 'klyfta',
  skivor: 'skiva', nävar: 'näve', nypor: 'nypa', krukor: 'kruka',
  // Vikt och volym, utskrivet eller slarvskrivet
  gram: 'g', gr: 'g', grm: 'g',
  kilo: 'kg', kilogram: 'kg', kilon: 'kg',
  hektogram: 'hg',
  liter: 'l', lit: 'l',
  deciliter: 'dl',
  centiliter: 'cl',
  milliliter: 'ml',
  matsked: 'msk', matskedar: 'msk',
  tesked: 'tsk', teskedar: 'tsk',
  kryddmått: 'krm',
};

/**
 * Enhetens kanoniska form. Okända enheter lämnas som de är (trimmade och i
 * gemener) — listan ska kunna innehålla mått vi aldrig hört talas om.
 */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const u = unit.trim().toLowerCase();
  if (!u) return null;
  return SYNONYMS[u] ?? u;
}
