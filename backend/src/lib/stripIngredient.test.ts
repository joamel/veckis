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

describe('stripIngredient — ledande mängd', () => {
  it('skalar bort tal + enhet, hopskrivet eller isär', () => {
    expect(stripIngredient('400 g ost')).toBe('ost');
    expect(stripIngredient('400g ost')).toBe('ost');
    expect(stripIngredient('2 dl grädde')).toBe('grädde');
    expect(stripIngredient('1/2 dl grädde')).toBe('grädde');
    expect(stripIngredient('½ dl grädde')).toBe('grädde');
    expect(stripIngredient('3-4 morötter')).toBe('morot');
  });

  it('skalar bort ett ensamt tal utan enhet', () => {
    expect(stripIngredient('2 gula lökar')).toBe('gula lökar');
  });

  it('lämnar namn som bara RÅKAR innehålla siffror ifred', () => {
    // Enhetsdelen måste vara en riktig enhet — annars vore "7up" en mängd.
    expect(stripIngredient('7up')).toBe('7up');
  });

  it('strippar aldrig till tomt', () => {
    expect(stripIngredient('400g')).toBe('400g');
    expect(stripIngredient('2')).toBe('2');
  });
});

describe('stripIngredient — alternativ och förpackningar', () => {
  it('BEHÅLLER alternativ — valet tillhör den som handlar', () => {
    // Ett försök att klippa vid "eller" backades: strippningen matar namnet på
    // varan i inköpslistan, så en vegetarian som överför rätten hade fått
    // "nötfärs" utan att se att sojafärs var ett alternativ.
    expect(stripIngredient('nötfärs alt. vegofärs')).toBe('nötfärs alt. vegofärs');
    expect(stripIngredient('havre- eller sojadryck')).toBe('havre- eller sojadryck');
  });

  it('skalar bort "förpackning" som den enhet den är', () => {
    expect(stripIngredient('förpackning bacon')).toBe('bacon');
  });

  it('rör inte namn där "eller" inte finns', () => {
    expect(stripIngredient('rökt skinka')).toBe('rökt skinka');
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
  it('flaggar tal-prefix — det som släppte igenom "400g ost"', () => {
    expect(startsWithUnit('400g ost')).toBe(true);
    expect(startsWithUnit('400 g ost')).toBe(true);
    expect(startsWithUnit('2 ägg')).toBe(true);
    expect(startsWithUnit('½ gurka')).toBe(true);
  });
});
