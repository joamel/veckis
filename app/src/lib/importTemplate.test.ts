import { describe, it, expect } from 'vitest';
import { isCompleteRecipe, looksLikeWeekMenu, suggestTemplateName } from './importTemplate';

const recept = (ingredienser: number, instruktioner: string | null, day: string | null = null) =>
  ({ ingredients: Array.from({ length: ingredienser }, (_, i) => ({ name: `vara ${i}` })), instructions: instruktioner, day });

describe('isCompleteRecipe', () => {
  it('kräver både ingredienser och instruktioner', () => {
    expect(isCompleteRecipe(recept(5, '1. Koka'))).toBe(true);
    expect(isCompleteRecipe(recept(5, null))).toBe(false);
    expect(isCompleteRecipe(recept(5, '  '))).toBe(false);
    expect(isCompleteRecipe(recept(1, '1. Koka'))).toBe(false);
  });
});

describe('looksLikeWeekMenu', () => {
  it('är en veckomeny när minst två recept har en dag', () => {
    expect(looksLikeWeekMenu([recept(3, 'x', 'mon'), recept(3, 'x', 'tue')])).toBe(true);
    expect(looksLikeWeekMenu([recept(3, 'x', 'mon'), recept(3, 'x')])).toBe(false);
    expect(looksLikeWeekMenu([recept(3, 'x'), recept(3, 'x')])).toBe(false);
  });
});

describe('suggestTemplateName', () => {
  const now = new Date('2026-10-28T12:00:00');
  it('använder kontot från Instagram', () => {
    expect(suggestTemplateName('@handlis.app', '', now)).toBe('Veckomeny från @handlis.app');
  });
  it('hittar ett konto i den inklistrade texten', () => {
    expect(suggestTemplateName(null, 'Recept från @matmamman. Måndag – …', now)).toBe('Veckomeny från @matmamman');
  });
  it('annars dagens datum', () => {
    expect(suggestTemplateName(null, 'Måndag – Sticky sojakyckling', now)).toMatch(/^Veckomeny 28 okt$/);
  });
});
