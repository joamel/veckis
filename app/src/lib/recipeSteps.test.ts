import { describe, expect, it } from 'vitest';
import { applyStepText, joinSteps, sameSteps, splitSteps } from './recipeSteps';

describe('splitSteps', () => {
  it('ett steg per rad, utan numrering och tomma rader', () => {
    expect(splitSteps('1. Skär löken\n\n2) Stek\n3 . Häll på')).toEqual(['Skär löken', 'Stek', 'Häll på']);
  });

  it('tom text ger ett tomt steg att skriva i', () => {
    expect(splitSteps('')).toEqual(['']);
    expect(splitSteps('  \n ')).toEqual(['']);
  });

  it('tal som inte är numrering lämnas', () => {
    expect(splitSteps('200 g smör smälts')).toEqual(['200 g smör smälts']);
  });
});

describe('joinSteps', () => {
  it('hoppar över tomma steg', () => {
    expect(joinSteps(['Skär', '', '  Stek  ', ''])).toBe('Skär\nStek');
  });

  it('går fram och tillbaka utan förlust', () => {
    const text = 'Skär löken\nStek\nHäll på';
    expect(joinSteps(splitSteps(text))).toBe(text);
  });
});

describe('sameSteps', () => {
  it('numrering och tomma rader räknas inte som ändring', () => {
    expect(sameSteps('1. Skär\n\n2. Stek', 'Skär\nStek')).toBe(true);
    expect(sameSteps('Skär\nStek', 'Skär\nKoka')).toBe(false);
  });
});

describe('applyStepText', () => {
  it('vanlig text uppdaterar bara steget', () => {
    expect(applyStepText(['a', 'b'], 1, 'bc')).toEqual({ steps: ['a', 'bc'], focusIdx: 1 });
  });

  it('Enter i slutet skapar ett nytt tomt steg efter och flyttar fokus dit', () => {
    expect(applyStepText(['a', 'b', 'c'], 1, 'b\n')).toEqual({ steps: ['a', 'b', '', 'c'], focusIdx: 2 });
  });

  it('inklistrade rader blir egna steg', () => {
    expect(applyStepText([''], 0, '1. Skär\n2. Stek\n3. Ät')).toEqual({ steps: ['Skär', 'Stek', 'Ät'], focusIdx: 2 });
  });
});
