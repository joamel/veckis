/** Det som alltid finns hemma, och som reglaget överst i inventeringen gäller. */
const BASICS = new Set(['salt', 'flingsalt', 'havssalt', 'bordssalt', 'peppar', 'svartpeppar', 'vitpeppar', 'vatten']);

/** Ord som får stå runt basvarorna utan att raden blir något annat. */
const FILLER = new Set([
  'och', 'eller', 'efter', 'smak', 'lite', 'ev', 'eventuellt', 'till', 'servering',
  'nymald', 'nymalen', 'malen', 'grovmalen', 'grovt', 'grov', 'fint', 'fin',
  'kokande', 'kallt', 'kall', 'ljummet', 'ljum', 'varmt', 'varm', 'hett',
]);

/**
 * Är raden bara salt, peppar eller vatten? Hela ord och ALLA ord måste passa:
 * "salt och peppar" och "kokande vatten" räknas, men inte "pepparrot",
 * "saltgurka", "kokosvatten" eller "smör och salt" — det sista ska handlas.
 */
export function isPantryBasic(name: string): boolean {
  const words = name.toLowerCase().split(/[^a-zåäöéü]+/).filter(Boolean);
  if (!words.some(w => BASICS.has(w))) return false;
  return words.every(w => BASICS.has(w) || FILLER.has(w));
}

/** Nyckeln valet sparas under (per enhet, som tipsflaggorna). */
export const PANTRY_BASICS_KEY = 'pantry-basics-at-home';
