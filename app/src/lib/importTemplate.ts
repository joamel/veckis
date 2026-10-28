import { recipes } from './svenska';

const { createModal } = recipes;

/**
 * Flera importerade recept (t.ex. en veckomeny från Instagram) kan sparas som
 * en veckomall. Här bor besluten kring det, så att de går att testa.
 */

type Importerat = { ingredients: unknown[]; instructions: string | null; day?: string | null };

/**
 * Ett recept som går att laga: minst två ingredienser OCH instruktioner.
 * Backend släpper igenom ett recept med bara det ena — det är bättre än inget
 * när man importerar ett enstaka recept, men en planerad vecka med ett tomt
 * recept i blir ett antiklimax. Ofullständiga förkryssas därför inte.
 */
export function isCompleteRecipe(r: Importerat): boolean {
  return r.ingredients.length >= 2 && !!r.instructions?.trim();
}

/** Förkryssa "Spara som veckomall" bara när texten själv var en veckomeny. */
export function looksLikeWeekMenu(recipes: Importerat[]): boolean {
  return recipes.filter(r => r.day).length >= 2;
}

/**
 * Förslag på mallens namn: kontot bakom inlägget när det går ("Veckomeny från
 * @handlis.app"), annars dagens datum. Namnet går alltid att ändra.
 */
export function suggestTemplateName(sourceName: string | null | undefined, text: string, now: Date): string {
  const konto = sourceName ?? text.match(/(?:^|\s)(@[a-z0-9._]{2,30})/i)?.[1] ?? null;
  if (konto) return createModal.photo.templateFromAccount(konto.replace(/\.$/, ''));
  const datum = now.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace(/\.$/, '');
  return createModal.photo.templateDated(datum);
}
