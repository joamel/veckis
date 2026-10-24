import { describe, it, expect } from 'vitest';
import { parseIngredientString, parseQuantity } from './parseIngredientString';
import { parseAmountText } from '@veckis/shared';

describe('parseIngredientString — svenska', () => {
  it('parsar mängd, enhet och namn', () => {
    expect(parseIngredientString('2 dl mjöl')).toMatchObject({ name: 'mjöl', quantity: 2, unit: 'dl' });
    expect(parseIngredientString('½ tsk salt')).toMatchObject({ name: 'salt', quantity: 0.5, unit: 'tsk' });
    expect(parseIngredientString('1.5 kg potatis')).toMatchObject({ name: 'potatis', quantity: 1.5, unit: 'kg' });
  });

  it('ett intervall sparar båda gränserna; quantity är den övre', () => {
    // Förut blev "3-4 tomater" 3,4 och "1–2 tsk salt" 1,2.
    expect(parseIngredientString('3-4 tomater')).toEqual({ name: 'tomater', quantity: 4, unit: null, quantityMin: 3, qualifier: null });
    expect(parseIngredientString('1–2 tsk salt')).toEqual({ name: 'salt', quantity: 2, unit: 'tsk', quantityMin: 1, qualifier: null });
    expect(parseIngredientString('1 - 1,5 dl grädde')).toEqual({ name: 'grädde', quantity: 1.5, unit: 'dl', quantityMin: 1, qualifier: null });
  });

  it('behåller ordet före mängden i stället för att stryka det', () => {
    expect(parseIngredientString('ca 13 dl vetemjöl')).toEqual({ name: 'vetemjöl', quantity: 13, unit: 'dl', quantityMin: null, qualifier: 'ca' });
    expect(parseIngredientString('ca. 2 dl mjölk')).toMatchObject({ name: 'mjölk', quantity: 2, unit: 'dl', qualifier: 'ca' });
    expect(parseIngredientString('c:a 3 dl mjöl')).toMatchObject({ name: 'mjöl', quantity: 3, qualifier: 'ca' });
    expect(parseIngredientString('cirka 1 1/2 dl socker')).toMatchObject({ name: 'socker', quantity: 1.5, qualifier: 'ca' });
    expect(parseIngredientString('drygt 1 dl grädde')).toMatchObject({ name: 'grädde', quantity: 1, qualifier: 'drygt' });
    expect(parseIngredientString('knappt 2 dl mjölk')).toMatchObject({ name: 'mjölk', quantity: 2, qualifier: 'knappt' });
    expect(parseIngredientString('ungefär ½ tsk salt')).toMatchObject({ name: 'salt', quantity: 0.5, qualifier: 'ca' });
    expect(parseIngredientString('ca 3-4 dl mjöl')).toMatchObject({ name: 'mjöl', quantity: 4, quantityMin: 3, qualifier: 'ca' });
  });

  it('"ev." markerar ett tillval, med eller utan mängd', () => {
    expect(parseIngredientString('ev. 1 dl russin')).toEqual({ name: 'russin', quantity: 1, unit: 'dl', quantityMin: null, qualifier: 'ev.' });
    expect(parseIngredientString('eventuellt salt')).toEqual({ name: 'salt', quantity: null, unit: null, quantityMin: null, qualifier: 'ev.' });
  });

  it('rör inte ord som bara börjar likadant', () => {
    expect(parseIngredientString('cashewnötter')).toMatchObject({ name: 'cashewnötter', quantity: null, qualifier: null });
    expect(parseIngredientString('cayennepeppar')).toMatchObject({ name: 'cayennepeppar', quantity: null, qualifier: null });
    expect(parseIngredientString('evergreen')).toMatchObject({ name: 'evergreen', qualifier: null });
  });

  it('lämnar okänd enhet i namnet i stället för att gissa', () => {
    expect(parseIngredientString('2 stora ägg')).toMatchObject({ name: 'stora ägg', quantity: 2, unit: null });
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
      .toMatchObject({ name: 'salted butter, softened', quantity: 0.5, unit: 'cup' });
  });

  it('tolkar enkla bråk korrekt (parseFloat trunkerar annars vid snedstrecket)', () => {
    expect(parseIngredientString('1/4 cup white sugar')).toMatchObject({ name: 'white sugar', quantity: 0.25, unit: 'cup' });
  });

  it('tolkar blandade tal ("1 3/4")', () => {
    expect(parseIngredientString('1 3/4 cup all-purpose flour, spooned and leveled'))
      .toMatchObject({ name: 'all-purpose flour, spooned and leveled', quantity: 1.75, unit: 'cup' });
  });

  it('känner igen fullständiga engelska enhetsord, inte bara förkortningar', () => {
    expect(parseIngredientString('2 teaspoons vanilla extract')).toMatchObject({ name: 'vanilla extract', quantity: 2, unit: 'teaspoons' });
    expect(parseIngredientString('3/4 teaspoon baking soda')).toMatchObject({ name: 'baking soda', quantity: 0.75, unit: 'teaspoon' });
  });

  it('lämnar parentetisk text i namnet (städas senare av stripIngredient)', () => {
    expect(parseIngredientString('1 cup chocolate chips (I use 1/2 cup dark and 1/2 cup semi-sweet)'))
      .toMatchObject({ name: 'chocolate chips (I use 1/2 cup dark and 1/2 cup semi-sweet)', quantity: 1, unit: 'cup' });
  });

  it('känner igen vikt- och styckenheter utan att ändra dem', () => {
    expect(parseIngredientString('8 oz cream cheese')).toMatchObject({ name: 'cream cheese', quantity: 8, unit: 'oz' });
    expect(parseIngredientString('2 cloves garlic')).toMatchObject({ name: 'garlic', quantity: 2, unit: 'cloves' });
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
      .toMatchObject({ name: 'all-purpose flour, spooned and leveled', quantity: 1.75, unit: 'cup' });
  });

  it('summerar blandat tal med unicode-bråk, med och utan mellanslag', () => {
    // Låg fel länge: mängden blev 1 och "¾ cup ..." hamnade i namnet.
    expect(parseIngredientString('1 ¾ cup all-purpose flour'))
      .toMatchObject({ name: 'all-purpose flour', quantity: 1.75, unit: 'cup' });
    expect(parseIngredientString('1¾ cup all-purpose flour'))
      .toMatchObject({ name: 'all-purpose flour', quantity: 1.75, unit: 'cup' });
    expect(parseQuantity('2 ½')).toBe(2.5);
    expect(parseQuantity('2½')).toBe(2.5);
  });

  it('läser inte ihop ett snedstrecksbråk utan mellanslag som blandat tal', () => {
    // "13/4" är tretton fjärdedelar, inte 1 + 3/4.
    expect(parseQuantity('13/4')).toBe(3.25);
  });
});

describe('parseAmountText (mängdfältet i receptredigeringen)', () => {
  it('läser ord, intervall och tal', () => {
    expect(parseAmountText('13')).toEqual({ quantity: 13, quantityMin: null, qualifier: null });
    expect(parseAmountText('ca 13')).toEqual({ quantity: 13, quantityMin: null, qualifier: 'ca' });
    expect(parseAmountText('3–4')).toEqual({ quantity: 4, quantityMin: 3, qualifier: null });
    expect(parseAmountText('ca 1,5–2')).toEqual({ quantity: 2, quantityMin: 1.5, qualifier: 'ca' });
    expect(parseAmountText('ev. 1')).toEqual({ quantity: 1, quantityMin: null, qualifier: 'ev.' });
    expect(parseAmountText('ev.')).toEqual({ quantity: null, quantityMin: null, qualifier: 'ev.' });
  });

  it('ett halvskrivet ord tar inte mängden med sig', () => {
    expect(parseAmountText('c 13')).toEqual({ quantity: 13, quantityMin: null, qualifier: null });
    expect(parseAmountText('ca')).toEqual({ quantity: null, quantityMin: null, qualifier: null });
    expect(parseAmountText('')).toEqual({ quantity: null, quantityMin: null, qualifier: null });
  });
});
