/**
 * Osparade receptändringar. Tunt skal ovanpå det gemensamma utkastlagret i
 * drafts.ts — se där för varför utkast används i stället för att blockera
 * vägen ut ur redigeringsläget.
 */
import { createDraftStore, type MedTid } from './drafts';

export interface RecipeFields {
  title: string;
  description: string;
  instructions: string;
  imageUrl: string;
  servings: number | null;
  tags: string[];
  // originalName kan saknas i utkast sparade före fältet fanns — därför
  // valfritt här, och normaliserat till null när utkastet läses in.
  ingredients: Array<{ name: string; quantity: string; unit: string; originalName?: string | null }>;
}

export type RecipeDraft = MedTid<RecipeFields>;

const lager = createDraftStore<RecipeFields>();

export const sparaUtkast = (recipeId: string, draft: RecipeFields) => lager.spara(recipeId, draft);
export const hamtaUtkast = (recipeId: string): RecipeDraft | null => lager.hamta(recipeId);
export const slangUtkast = (recipeId: string) => lager.slang(recipeId);
export const harUtkast = (recipeId: string) => lager.har(recipeId);
