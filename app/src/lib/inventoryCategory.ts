import { inferSubCategory, SUB_TAXONOMY } from '@veckis/shared';

/**
 * Var i butiken en ingrediens hamnar, för att sortera inventeringen så att
 * man inte springer fram och tillbaka mellan kyl och skafferi.
 *
 *  1. hushållets inlärda kategori för namnet (samma källa som inköpslistan)
 *  2. den regelbaserade gissningen ur namnet ("mjölk" → mejeri)
 *  3. receptets egen kategori — oftast "other", därför sist
 *
 * Utan 1 och 2 grupperades inventeringen i praktiken per rätt: receptens
 * kategorier är satta olika per recept, eller inte alls.
 */
export function inventoryCategory(name: string, learned: Record<string, string>, recipeCategory?: string): string | undefined {
  const key = name.toLowerCase().trim();
  const fromLearned = learned[key];
  if (fromLearned && fromLearned !== 'other') return fromLearned;
  const sub = inferSubCategory(key);
  if (sub) return SUB_TAXONOMY[sub].defaultParent;
  return fromLearned ?? recipeCategory;
}
