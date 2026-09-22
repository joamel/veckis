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
  /** Vilken del av bilden som visas när den beskärs till 16:9. 0–1 per axel,
   *  null = mitten. Se schema.prisma för varför den lagras i stället för att
   *  bilden beskärs. */
  imageFocusX: number | null;
  imageFocusY: number | null;
  /** Total tillagningstid i minuter som receptet anger. null = okänd. */
  cookMinutes: number | null;
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
  /** Namnet som källan skrev det, satt bara när importen översatte det till
   *  svenska. null för allt annat. Receptvyns ↔-knapp växlar mellan name och
   *  originalName, på samma sätt som den växlar enhet. */
  originalName?: string | null;
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
