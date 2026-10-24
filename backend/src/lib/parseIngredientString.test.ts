import { describe, it, expect } from 'vitest';
import { parseIngredientString, parseQuantity } from './parseIngredientString';

describe('parseIngredientString — svenska', () => {
  it('parsar mängd, enhet och namn', () => {
    expect(parseIngredientString('2 dl mjöl')).toEqual({ name: 'mjöl', quantity: 2, unit: 'dl' });
    expect(parseIngredientString('½ tsk salt')).toEqual({ name: 'salt', quantity: 0.5, unit: 'tsk' });
    expect(parseIngredientString('1.5 kg potatis')).toEqual({ name: 'potatis', quantity: 1.5, unit: 'kg' });
  });

  it('ett intervall ger den övre gränsen, inte ett decimaltal', () => {
    // Förut blev "3-4 tomater" 3,4 och "1–2 tsk salt" 1,2.
    expect(parseIngredientString('3-4 tomater')).toEqual({ name: 'tomater', quantity: 4, unit: null });
    expect(parseIngredientString('1–2 tsk salt')).toEqual({ name: 'salt', quantity: 2, unit: 'tsk' });
    expect(parseIngredientString('1 - 1,5 dl grädde')).toEqual({ name: 'grädde', quantity: 1.5, unit: 'dl' });
  });

  it('läser mängden efter "ca", "cirka", "drygt" och "knappt"', () => {
    expect(parseIngredientString('ca 13 dl vetemjöl')).toEqual({ name: 'vetemjöl', quantity: 13, unit: 'dl' });
    expect(parseIngredientString('ca. 2 dl mjölk')).toEqual({ name: 'mjölk', quantity: 2, unit: 'dl' });
    expect(parseIngredientString('c:a 3 dl mjöl')).toEqual({ name: 'mjöl', quantity: 3, unit: 'dl' });
    expect(parseIngredientString('cirka 1 1/2 dl socker')).toEqual({ name: 'socker', quantity: 1.5, unit: 'dl' });
    expect(parseIngredientString('drygt 1 dl grädde')).toEqual({ name: 'grädde', quantity: 1, unit: 'dl' });
    expect(parseIngredientString('ungefär ½ tsk salt')).toEqual({ name: 'salt', quantity: 0.5, unit: 'tsk' });
  });

  it('rör inte ord som bara börjar likadant', () => {
    expect(parseIngredientString('cashewnötter')).toEqual({ name: 'cashewnötter', quantity: null, unit: null });
    expect(parseIngredientString('cayennepeppar')).toEqual({ name: 'cayennepeppar', quantity: null, unit: null });
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

describe('blandade tal', () => {
  it('summerar blandat tal med snedstreck', () => {
    // Formen bakedabundance.com skickar i sin JSON-LD.
    expect(parseIngredientString('1 3/4 cup all-purpose flour, spooned and leveled'))
      .toEqual({ name: 'all-purpose flour, spooned and leveled', quantity: 1.75, unit: 'cup' });
  });

  it('summerar blandat tal med unicode-bråk, med och utan mellanslag', () => {
    // Låg fel länge: mängden blev 1 och "¾ cup ..." hamnade i namnet.
    expect(parseIngredientString('1 ¾ cup all-purpose flour'))
      .toEqual({ name: 'all-purpose flour', quantity: 1.75, unit: 'cup' });
    expect(parseIngredientString('1¾ cup all-purpose flour'))
      .toEqual({ name: 'all-purpose flour', quantity: 1.75, unit: 'cup' });
    expect(parseQuantity('2 ½')).toBe(2.5);
    expect(parseQuantity('2½')).toBe(2.5);
  });

  it('läser inte ihop ett snedstrecksbråk utan mellanslag som blandat tal', () => {
    // "13/4" är tretton fjärdedelar, inte 1 + 3/4.
    expect(parseQuantity('13/4')).toBe(3.25);
  });
});
