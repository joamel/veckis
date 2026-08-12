import { describe, it, expect } from 'vitest';
import { stripIngredient, startsWithUnit } from './stripIngredient';

describe('stripIngredient — leading units', () => {
  it('strips a stray leading unit when no quantity was present', () => {
    expect(stripIngredient('kg potatis')).toBe('potatis');
    expect(stripIngredient('dl grädde')).toBe('grädde');
    expect(stripIngredient('msk olja')).toBe('olja');
  });

  it('strips a unit and then normalises plural', () => {
    expect(stripIngredient('kg potatisar')).toBe('potatis');
  });

  it('leaves normal names untouched', () => {
    expect(stripIngredient('potatis')).toBe('potatis');
    expect(stripIngredient('färsk basilika')).toBe('färsk basilika');
  });

  it('does not strip a unit that is the whole name', () => {
    // "g" ensamt är inte ett ingrediensnamn men ska inte bli tomt
    expect(stripIngredient('g')).toBe('g');
  });
});

describe('startsWithUnit', () => {
  it('flags unit-prefixed names', () => {
    expect(startsWithUnit('kg potatis')).toBe(true);
    expect(startsWithUnit('dl grädde')).toBe(true);
  });
  it('does not flag clean names', () => {
    expect(startsWithUnit('potatis')).toBe(false);
    expect(startsWithUnit('grädde')).toBe(false);
    expect(startsWithUnit('kg')).toBe(false); // ensamt ord
  });
});
