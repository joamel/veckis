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
  servings: number;
  timesUsed: number;
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

export interface WeekMenuItem {
  id: string;
  householdId: string;
  recipeId: string;
  day: WeekDay | null;
  weekYear: number;
  weekNumber: number;
  note: string | null;
  servings: number | null;
  createdBy: string;
  createdAt: string;
}
