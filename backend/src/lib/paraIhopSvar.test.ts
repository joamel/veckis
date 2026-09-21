import { describe, it, expect } from 'vitest';
import { paraIhopSvar } from './normalizeIngredients';

describe('paraIhopSvar', () => {
  const namn = ['färsk spenat', 'crème fraîche', 'tomater'];

  it('parar på namnet, inte på ordningen', () => {
    // Modellen svarar i omkastad ordning — resultatet ska ändå bli rätt.
    const svar = [
      { in: 'tomater', ut: 'tomat' },
      { in: 'färsk spenat', ut: 'spenat' },
      { in: 'crème fraîche', ut: 'crème fraîche' },
    ];
    expect(paraIhopSvar(namn, svar)).toEqual(['spenat', 'crème fraîche', 'tomat']);
  });

  it('behåller namn som modellen hoppade över', () => {
    // DEN HÄR var buggen: med positionsparning blev "färsk spenat" till
    // "creme fraiche" när ett namn saknades i svaret.
    const svar = [
      { in: 'crème fraîche', ut: 'creme fraiche' },
      { in: 'tomater', ut: 'tomat' },
    ];
    expect(paraIhopSvar(namn, svar)).toEqual(['färsk spenat', 'creme fraiche', 'tomat']);
  });

  it('ignorerar trasiga poster', () => {
    const svar = [{ in: 'tomater', ut: '' }, { ut: 'spenat' }, { in: 'färsk spenat' }, 'skräp'];
    expect(paraIhopSvar(namn, svar)).toEqual(namn);
  });

  it('klarar tomt svar utan att ändra något', () => {
    expect(paraIhopSvar(namn, [])).toEqual(namn);
  });
});
