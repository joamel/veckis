import { describe, expect, it } from 'vitest';
import { orderTags } from './tagOrder';

const recipes = [
  ['vardag', 'kyckling'],
  ['vardag', 'favorit'],
  ['vardag', 'fisk'],
  ['helg', 'kyckling'],
  ['fisk'],
];

describe('orderTags', () => {
  it('lägger favoriter först, sedan fästa efter antal, sedan resten efter antal', () => {
    // Fästa i ordningen helg, fisk — men fisk har fler recept och går före.
    expect(orderTags(recipes, ['helg', 'fisk'], 'favorit')).toEqual(['favorit', 'fisk', 'helg', 'vardag', 'kyckling']);
  });

  it('har favoriter först även när den inte är fäst', () => {
    expect(orderTags(recipes, [], 'favorit')[0]).toBe('favorit');
  });

  it('visar varken favoriter eller fästa taggar som inget recept har', () => {
    expect(orderTags([['vardag']], ['helg'], 'favorit')).toEqual(['vardag']);
  });

  it('bokstavsordning vid lika många recept', () => {
    expect(orderTags([['b'], ['a'], ['c']], [], 'favorit')).toEqual(['a', 'b', 'c']);
  });
});
