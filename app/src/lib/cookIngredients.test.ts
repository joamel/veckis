import { describe, it, expect } from 'vitest';
import { ärSynligPåSteg, kvarvarandePåSteg } from './cookIngredients';

describe('ärSynligPåSteg', () => {
  it('visar obockade ingredienser', () => {
    expect(ärSynligPåSteg(undefined, 0)).toBe(true);
    expect(ärSynligPåSteg(undefined, 5)).toBe(true);
  });

  it('visar det man bockat av på steget man står på', () => {
    // Kvitto på att trycket gick fram, och en chans att ångra.
    expect(ärSynligPåSteg(2, 2)).toBe(true);
  });

  it('döljer det som bockades av på ett tidigare steg', () => {
    expect(ärSynligPåSteg(0, 1)).toBe(false);
    expect(ärSynligPåSteg(2, 7)).toBe(false);
  });

  it('visar det igen när man backar — vägen tillbaka efter en felbock', () => {
    expect(ärSynligPåSteg(3, 1)).toBe(true);
  });
});

describe('kvarvarandePåSteg', () => {
  const ingredienser = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('krymper listan allt eftersom', () => {
    const bockade = new Map([['a', 0], ['b', 1]]);
    expect(kvarvarandePåSteg(ingredienser, bockade, 0).map(i => i.id)).toEqual(['a', 'b', 'c']);
    expect(kvarvarandePåSteg(ingredienser, bockade, 1).map(i => i.id)).toEqual(['b', 'c']);
    expect(kvarvarandePåSteg(ingredienser, bockade, 2).map(i => i.id)).toEqual(['c']);
  });

  it('lämnar listan orörd när inget är avbockat', () => {
    expect(kvarvarandePåSteg(ingredienser, new Map(), 3)).toHaveLength(3);
  });
});
