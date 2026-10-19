/**
 * Taggar att föreslå för ett importerat recept.
 *
 * Regler (beslut 2026-10-19):
 *  - Bara hushållets EGNA taggar föreslås. Har hushållet ingen "snabb" blir
 *    det inget förslag — appen skapar aldrig taggar åt någon, annars växer
 *    taggmolnet med sådant ingen valt.
 *  - Kost (vegetariskt, veganskt, glutenfritt, laktosfritt) bara när RUBRIKEN
 *    säger det uttryckligen. Ingredienserna gissar inte: buljongtärningen kan
 *    vara av kött, och en felaktig glutenfri-tagg kan skada någon.
 *  - Snabb när tillagningstiden är högst QUICK_MAX_MINUTES.
 * Förslagen läggs till synligt, i redigeringsläget, och tas bort med ett tryck.
 */

export const QUICK_MAX_MINUTES = 20;

type Concept = {
  /** Hushållets taggar som betyder samma sak, i den ordning de väljs. */
  tags: string[];
  /** Träffar i rubriken (ordbörjan). Utelämnad = styrs av något annat. */
  title?: RegExp;
};

const QUICK: Concept = { tags: ['snabb', 'snabbt', 'snabba', 'snabbmat', 'snabba rätter', 'snabbis'] };

const DIET: Concept[] = [
  { tags: ['veganskt', 'vegansk', 'vegan', 'veganska'], title: /(^|[^\p{L}])vegan(sk|skt|ska)?(?![\p{L}])/iu },
  { tags: ['vegetariskt', 'vegetarisk', 'vegetariska', 'vego', 'veg', 'veggo', 'veggie'], title: /(^|[^\p{L}])(vegetarisk[a-z]*|vego|veggie)(?![\p{L}])/iu },
  { tags: ['glutenfritt', 'glutenfri', 'glutenfria'], title: /(^|[^\p{L}])glutenfri(tt|a)?(?![\p{L}])/iu },
  { tags: ['laktosfritt', 'laktosfri', 'laktosfria', 'mjölkfritt', 'mjölkfri'], title: /(^|[^\p{L}])(laktosfri|mjölkfri)(tt|a)?(?![\p{L}])/iu },
];

/** Hushållets tagg för begreppet, i hushållets stavning — eller null. */
function householdTagFor(concept: Concept, householdTags: Map<string, string>): string | null {
  for (const t of concept.tags) {
    const own = householdTags.get(t);
    if (own) return own;
  }
  return null;
}

export function suggestRecipeTags(
  recipe: { title: string; cookMinutes?: number | null },
  householdTags: string[],
): string[] {
  const own = new Map(householdTags.map(t => [t.toLowerCase().trim(), t]));
  const out: string[] = [];
  const add = (t: string | null) => { if (t && !out.includes(t)) out.push(t); };

  if (recipe.cookMinutes != null && recipe.cookMinutes > 0 && recipe.cookMinutes <= QUICK_MAX_MINUTES) {
    add(householdTagFor(QUICK, own));
  }
  for (const concept of DIET) {
    if (concept.title?.test(recipe.title)) add(householdTagFor(concept, own));
  }
  return out;
}
