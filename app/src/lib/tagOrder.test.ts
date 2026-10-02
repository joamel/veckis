import { describe, expect, it } from 'vitest';
import { orderTags, tagChips } from './tagOrder';

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

describe('tagChips', () => {
  const recipes = [
    ['Vegetariskt', 'Snabbt'],
    ['Vegetariskt', 'Snabbt', 'Middag'],
    ['Vegetariskt', 'Middag'],
    ['Kyckling', 'Snabbt'],
    ['Kyckling', 'Middag'],
  ];

  it('utan val: alla taggar, med antal recept', () => {
    const chips = tagChips(recipes, new Set(), [], 'Favorit');
    expect(chips.map(c => c.tag).sort()).toEqual(['Kyckling', 'Middag', 'Snabbt', 'Vegetariskt']);
    expect(chips.find(c => c.tag === 'Snabbt')?.count).toBe(3);
  });

  it('en vald tagg döljer taggar som skulle ge noll och räknar på det som matchar', () => {
    const chips = tagChips(recipes, new Set(['Vegetariskt']), [], 'Favorit');
    expect(chips[0]).toEqual({ tag: 'Vegetariskt', count: 3, active: true });
    expect(chips.map(c => c.tag)).not.toContain('Kyckling');
    expect(chips.find(c => c.tag === 'Snabbt')?.count).toBe(2);
    expect(chips.find(c => c.tag === 'Middag')?.count).toBe(2);
  });

  it('valda taggar ligger kvar även när inget matchar', () => {
    const chips = tagChips([['A']], new Set(['B']), [], 'Favorit');
    expect(chips).toEqual([{ tag: 'B', count: 0, active: true }]);
  });
});
