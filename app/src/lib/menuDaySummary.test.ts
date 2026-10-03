import { describe, it, expect } from 'vitest';
import { dayItemsSummary } from './menuDaySummary';

describe('dayItemsSummary', () => {
  it('visar middagen före andra rätter', () => {
    expect(dayItemsSummary([
      { mealType: 'lunch', recipe: { title: 'Soppa' } },
      { mealType: 'dinner', recipe: { title: 'Lax' } },
    ])).toMatch(/^Lax /);
  });

  it('snabbrätt utan recept visar sitt eget namn', () => {
    expect(dayItemsSummary([
      { mealType: null, recipe: null, title: 'Köttbullar och makaroner' },
    ])).toBe('Köttbullar och makaroner');
  });
});
