import { describe, it, expect } from 'vitest';
import { parseIngredientString, parseQuantity } from './parseIngredientString';

describe('parseIngredientString — svenska', () => {
  it('parsar mängd, enhet och namn', () => {
    expect(parseIngredientString('2 dl mjöl')).toEqual({ name: 'mjöl', quantity: 2, unit: 'dl' });
    expect(parseIngredientString('½ tsk salt')).toEqual({ name: 'salt', quantity: 0.5, unit: 'tsk' });
    expect(parseIngredientString('1.5 kg potatis')).toEqual({ name: 'potatis', quantity: 1.5, unit: 'kg' });
  });

  it('behåller ett intervall som decimaltal (befintligt beteende)', () => {
    expect(parseIngredientString('3-4 tomater')).toEqual({ name: 'tomater', quantity: 3.4, unit: null });
  });

  it('lämnar okänd enhet i namnet i stället för att gissa', () => {
    expect(parseIngredientString('2 stora ägg')).toEqual({ name: 'stora ägg', quantity: 2, unit: null });
  });
});

describe('parseIngredientString — engelska/amerikanska mått sparas råa', () => {
  // Import ska inte ändra källans siffror/enhet — konvertering till svenska
  // enheter är ett explicit UI-val (se @veckis/shared unitConversion.ts),
  // inte något som händer tyst här.
  it('skiljer en enordsenhet från en flerordsbeskrivning i stället för att slå ihop dem', () => {
    // Regression: girig matchning tog tidigare två ord som "enhet" ("cup salted"),
    // vilket aldrig kändes igen och lät hela raden bli namn.
    expect(parseIngredientString('1/2 cup salted butter, softened'))
      .toEqual({ name: 'salted butter, softened', quantity: 0.5, unit: 'cup' });
  });

  it('tolkar enkla bråk korrekt (parseFloat trunkerar annars vid snedstrecket)', () => {
    expect(parseIngredientString('1/4 cup white sugar')).toEqual({ name: 'white sugar', quantity: 0.25, unit: 'cup' });
  });

  it('tolkar blandade tal ("1 3/4")', () => {
    expect(parseIngredientString('1 3/4 cup all-purpose flour, spooned and leveled'))
      .toEqual({ name: 'all-purpose flour, spooned and leveled', quantity: 1.75, unit: 'cup' });
  });

  it('känner igen fullständiga engelska enhetsord, inte bara förkortningar', () => {
    expect(parseIngredientString('2 teaspoons vanilla extract')).toEqual({ name: 'vanilla extract', quantity: 2, unit: 'teaspoons' });
    expect(parseIngredientString('3/4 teaspoon baking soda')).toEqual({ name: 'baking soda', quantity: 0.75, unit: 'teaspoon' });
  });

  it('lämnar parentetisk text i namnet (städas senare av stripIngredient)', () => {
    expect(parseIngredientString('1 cup chocolate chips (I use 1/2 cup dark and 1/2 cup semi-sweet)'))
      .toEqual({ name: 'chocolate chips (I use 1/2 cup dark and 1/2 cup semi-sweet)', quantity: 1, unit: 'cup' });
  });

  it('känner igen vikt- och styckenheter utan att ändra dem', () => {
    expect(parseIngredientString('8 oz cream cheese')).toEqual({ name: 'cream cheese', quantity: 8, unit: 'oz' });
    expect(parseIngredientString('2 cloves garlic')).toEqual({ name: 'garlic', quantity: 2, unit: 'cloves' });
  });
});

describe('parseQuantity', () => {
  it('tolkar unicode-bråk', () => {
    expect(parseQuantity('½')).toBe(0.5);
    expect(parseQuantity('¾')).toBe(0.75);
  });

  it('tolkar ascii-bråk', () => {
    expect(parseQuantity('1/2')).toBe(0.5);
    expect(parseQuantity('3/4')).toBe(0.75);
  });

  it('tolkar blandade tal (heltal + bråk)', () => {
    expect(parseQuantity('1 3/4')).toBe(1.75);
    expect(parseQuantity('2 1/2')).toBe(2.5);
  });

  it('tolkar decimaltal med komma eller punkt', () => {
    expect(parseQuantity('1,5')).toBe(1.5);
    expect(parseQuantity('1.5')).toBe(1.5);
  });
});
