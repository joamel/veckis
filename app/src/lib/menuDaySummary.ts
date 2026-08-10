import type { MealType } from '@veckis/shared';
import { common } from './svenska';

interface Summarizable {
  mealType: MealType | null;
  recipe: { title: string };
}

/**
 * Kort sammanfattning av en dags rätter för dag-grid-hinten: middagen (annars
 * första rätten) + "+N rätter" om det finns fler, så det får plats på en rad.
 */
export function dayItemsSummary(items: Summarizable[]): string {
  if (items.length === 0) return '';
  const primary = items.find(i => i.mealType === 'dinner') ?? items[0];
  const extra = items.length - 1;
  return extra > 0 ? `${primary.recipe.title} ${common.plusDishes(extra)}` : primary.recipe.title;
}
