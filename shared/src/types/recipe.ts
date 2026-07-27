import type { StoreCategory } from './shopping';
import type { WeekDay } from './schedule';

export interface Recipe {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  instructions: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  imagePublicId: string | null;
  servings: number;
  timesUsed: number;
  /** Gemener/trimmade etiketter ("vegetariskt", "snabbt", "favorit" …) */
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: StoreCategory;
}

/** Måltidstyp så flera rätter kan samsas på samma dag (frukost + middag …). */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'dessert';

/** Ordning för sortering/visning inom en dag. */
export const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'dessert'];

export interface WeekMenuItem {
  id: string;
  householdId: string;
  recipeId: string;
  day: WeekDay | null;
  mealType: MealType | null;
  weekYear: number;
  weekNumber: number;
  note: string | null;
  servings: number | null;
  transferred: boolean;
  createdBy: string;
  createdAt: string;
}
