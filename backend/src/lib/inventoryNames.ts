import type { StoreCategory } from '@prisma/client';
import { stripIngredient } from './stripIngredient';
import { categorizeIngredient } from './categorizeIngredient';

export type ResolvedName = { name: string; canonical: string; category: StoreCategory };

/**
 * Vad en receptrad heter och var den hamnar i butiken, för inventeringen.
 *
 * Receptens egna namn slogs ihop bara när de var exakt lika, och kategorin
 * kom ur receptet — så varken det hushållet rättat i inköpslistan eller det
 * clean:dupes slagit ihop i poolen syntes där. Här gäller samma källor som
 * listan använder:
 *
 *  namn:     den inlärda kanoniska formen (IngredientAlias: "koncentrerad
 *            kycklingfond" → "kycklingfond"), annars det strippade namnet
 *  kategori: 1. hushållets eget val (StapleItem — skrivs när man ändrar
 *               kategori på en vara i listan), på kanoniskt eller strippat namn
 *            2. den kurerade poolen (IngredientAlias.category)
 *            3. nyckelordsklassaren
 *            "other" räknas inte som ett val i 1 och 2: det är vad allt fick
 *            innan någon brydde sig.
 */
export function resolveInventoryNames(
  names: string[],
  aliases: Map<string, { canonical: string; category: StoreCategory }>,
  householdCategories: Map<string, StoreCategory>,
): ResolvedName[] {
  return names.map(name => {
    const stripped = stripIngredient(name);
    const alias = aliases.get(stripped);
    const canonical = alias?.canonical ?? stripped;
    const own = householdCategories.get(canonical) ?? householdCategories.get(stripped);
    const category =
      (own && own !== 'other' ? own : null)
      ?? (alias && alias.category !== 'other' ? alias.category : null)
      ?? categorizeIngredient(canonical);
    return { name, canonical, category };
  });
}
