// Hur ett recept UTAN bild ritas i den nya designen: en ton (ljus eller mörk
// grön) och en matikon. Tidigare fick alla samma mörka yta med första
// bokstaven, vilket blev tungt och enformigt när få recept har bild — tio "P"
// i rad säger ingenting.

export type PlatshallarTon = 'ljus' | 'mork';
export type PlatshallarIkon =
  | 'pizza-outline' | 'fish-outline' | 'flame-outline' | 'leaf-outline'
  | 'egg-outline' | 'fast-food-outline' | 'ice-cream-outline' | 'restaurant-outline';

/** Stabil hash av ett id. Används av både murverkets höjder och
 *  platshållarens ton, så samma recept alltid ser likadant ut. */
export function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Delsträngar, inte hela ord: svenska rätter är ofta sammansättningar
// ("tomatsoppa", "laxpasta"). Första träffen vinner, så ordningen spelar roll:
// "fiskgryta" ska bli fisk, inte gryta.
const REGLER: [RegExp, PlatshallarIkon][] = [
  [/pizza/, 'pizza-outline'],
  [/fisk|lax|torsk|sej|räk|skaldjur|tonfisk|mussl|sushi|kolja|sill/, 'fish-outline'],
  [/burgare|taco|tortilla|wrap|kebab|korv/, 'fast-food-outline'],
  [/kaka|tårta|dessert|glass|paj|bulle|kladd|muffin|cheesecake|pudding/, 'ice-cream-outline'],
  // "lägg", "vägg", "bägge", "hägg" innehåller också "ägg".
  [/(^|[^lvbh])ägg|omelett|pannkak|våffl|frukost/, 'egg-outline'],
  [/soppa|gryta|curry|chili|stuvning/, 'flame-outline'],
  [/sallad|vegetar|vegan|grönsak|bowl/, 'leaf-outline'],
];

export function platshallare(id: string, sokord: string): { ton: PlatshallarTon; ikon: PlatshallarIkon } {
  const text = sokord.toLowerCase();
  const ikon = REGLER.find(([re]) => re.test(text))?.[1] ?? 'restaurant-outline';
  // Två ljusa på ett mörkt: mörka ytor tar mycket plats när få recept har bild.
  const ton: PlatshallarTon = idHash(id) % 3 === 0 ? 'mork' : 'ljus';
  return { ton, ikon };
}
