import { describe, it, expect } from 'vitest';
import { ingredientHeading, withSections } from './ingredientSections';

describe('ingredientHeading', () => {
  it('känner igen rubriker med kolon, i versaler och i fetstil', () => {
    expect(ingredientHeading('Deg:')).toBe('Deg');
    expect(ingredientHeading('Till såsen:')).toBe('Till såsen');
    expect(ingredientHeading('TILL SÅSEN')).toBe('Till såsen');
    expect(ingredientHeading('<strong>Topping</strong>')).toBe('Topping');
  });

  it('släpper igenom vanliga ingredienser', () => {
    expect(ingredientHeading('2 dl mjölk')).toBeNull();
    expect(ingredientHeading('salt')).toBeNull();
    expect(ingredientHeading('Salt och peppar')).toBeNull();
    expect(ingredientHeading('1 msk smör:')).toBeNull();
    expect(ingredientHeading('Salt: efter smak')).toBeNull();
  });

  it('kortord i versaler och för långa rader är ingen rubrik', () => {
    expect(ingredientHeading('OK')).toBeNull();
    expect(ingredientHeading('Det här är en alldeles för lång rad för en rubrik:')).toBeNull();
  });
});

describe('withSections', () => {
  it('ger samma vara olika rubriker och tar bort rubrikraderna', () => {
    const rader = ['Deg:', '5 dl mjölk', '2 ägg', 'Sås:', '3 dl mjölk'];
    expect(withSections(rader, l => ({ rad: l }))).toEqual([
      { rad: '5 dl mjölk', section: 'Deg' },
      { rad: '2 ägg', section: 'Deg' },
      { rad: '3 dl mjölk', section: 'Sås' },
    ]);
  });

  it('rader före första rubriken saknar rubrik', () => {
    expect(withSections(['salt', 'Sås:', 'grädde'], l => ({ rad: l }))).toEqual([
      { rad: 'salt', section: null },
      { rad: 'grädde', section: 'Sås' },
    ]);
  });
});
