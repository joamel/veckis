/**
 * "1 tsk timjan" i ett recept betyder torkad timjan — det är en annan vara
 * än timjan i kruka, och står i kryddhyllan i stället för bland örterna i
 * frukt & grönt. Recepten skriver sällan ut "torkad", så varan hamnade under
 * frukt & grönt (prod 2026-09-30: timjan torrvaror ×3, frukt & grönt ×2).
 *
 * Regeln är snäv med flit: bara örter som nästan alltid är torkade när de mäts
 * i kryddmått, och bara kryddmåtten krm/tsk. Persilja, dill, gräslök och
 * koriander i msk är för det mesta färskhackade och får inte gissas torkade.
 * Står det något färskt i raden ("färsk", "hackad", "blad" …) rörs den inte.
 */
const USUALLY_DRIED = new Set(['timjan', 'rosmarin', 'oregano', 'mejram', 'dragon', 'salvia', 'basilika']);
const SPICE_MEASURES = new Set(['krm', 'tsk']);
const FRESH_HINTS = /\b(färsk|färska|färskt|hackad|hackade|finhackad|finhackade|strimlad|plockade|plockad|blad|kvist|kvistar|kruka|knippe)\b/i;

export function withDriedPrefix(name: string, unit: string | null | undefined, rawLine: string = name): string {
  const n = name.toLowerCase().trim();
  if (!unit || !SPICE_MEASURES.has(unit.toLowerCase().trim())) return name;
  if (!USUALLY_DRIED.has(n)) return name;
  if (FRESH_HINTS.test(rawLine)) return name;
  return `torkad ${n}`;
}
