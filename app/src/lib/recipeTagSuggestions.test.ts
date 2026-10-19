import { describe, it, expect } from 'vitest';
import { suggestRecipeTags } from './recipeTagSuggestions';

const TAGGAR = ['vardag', 'snabb', 'vegetariskt', 'glutenfritt', 'barnvänligt'];

describe('suggestRecipeTags', () => {
  it('föreslår snabb vid högst 20 minuter', () => {
    expect(suggestRecipeTags({ title: 'Pasta', cookMinutes: 15 }, TAGGAR)).toEqual(['snabb']);
    expect(suggestRecipeTags({ title: 'Pasta', cookMinutes: 20 }, TAGGAR)).toEqual(['snabb']);
    expect(suggestRecipeTags({ title: 'Pasta', cookMinutes: 25 }, TAGGAR)).toEqual([]);
    expect(suggestRecipeTags({ title: 'Pasta', cookMinutes: null }, TAGGAR)).toEqual([]);
  });

  it('föreslår bara taggar hushållet redan har', () => {
    expect(suggestRecipeTags({ title: 'Vegansk chili', cookMinutes: 10 }, ['vardag'])).toEqual([]);
  });

  it('använder hushållets stavning', () => {
    expect(suggestRecipeTags({ title: 'Snabb wok', cookMinutes: 12 }, ['Snabbmat'])).toEqual(['Snabbmat']);
  });

  it('läser kost ur rubriken, aldrig ur något annat', () => {
    expect(suggestRecipeTags({ title: 'Vegetarisk lasagne' }, TAGGAR)).toEqual(['vegetariskt']);
    expect(suggestRecipeTags({ title: 'Glutenfria pannkakor' }, TAGGAR)).toEqual(['glutenfritt']);
    expect(suggestRecipeTags({ title: 'Lasagne' }, TAGGAR)).toEqual([]);
  });

  it('träffar inte mitt i ett ord', () => {
    expect(suggestRecipeTags({ title: 'Vegankorv? Nej, köttfärssås' }, ['veganskt'])).toEqual([]);
    expect(suggestRecipeTags({ title: 'Vego-burgare' }, ['vego'])).toEqual(['vego']);
  });

  it('kan föreslå flera', () => {
    expect(suggestRecipeTags({ title: 'Snabb vegetarisk glutenfri wok', cookMinutes: 15 }, TAGGAR))
      .toEqual(['snabb', 'vegetariskt', 'glutenfritt']);
  });
});
