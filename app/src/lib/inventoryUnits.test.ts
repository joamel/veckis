import { describe, expect, it } from 'vitest';
import { mergeConvertibleUnits } from './inventoryUnits';

const row = (name: string, qty: number | null, unit: string | null, recipe = 'A') => ({
  key: `${name}|${unit ?? ''}`, name, unit, totalQty: qty, measured: qty != null, recipeTitles: [recipe],
  sources: [{ menuItemId: recipe, recipeId: recipe, qty }],
});

describe('mergeConvertibleUnits', () => {
  it('slår ihop msk och dl till en rad och räknar om varje rätts andel', () => {
    const [r] = mergeConvertibleUnits([row('grädde', 2, 'msk', 'A'), row('grädde', 3, 'dl', 'B')]);
    expect(r.unit).toBe('dl');
    expect(r.totalQty).toBe(3.3);
    expect(r.recipeTitles).toEqual(['A', 'B']);
    expect(r.sources.map(s => s.qty)).toEqual([0.3, 3]);
  });

  it('slår ihop g och kg', () => {
    const [r] = mergeConvertibleUnits([row('nötfärs', 500, 'g', 'A'), row('nötfärs', 1, 'kg', 'B')]);
    expect(r).toMatchObject({ unit: 'kg', totalQty: 1.5 });
  });

  it('lämnar styck mot gram, rader utan mängd och andra namn i fred', () => {
    const rader = [row('lök', 2, 'st'), row('lök', 200, 'g'), row('salt', null, null), row('mjölk', 2, 'dl')];
    expect(mergeConvertibleUnits(rader)).toHaveLength(4);
  });
});
