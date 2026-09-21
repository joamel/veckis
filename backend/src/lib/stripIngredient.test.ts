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

describe('stripIngredient — ca-prefixet', () => {
  it('skalar bort ca framför en mängd', () => {
    expect(stripIngredient('ca 2 dl mjölk')).toBe('mjölk');
    expect(stripIngredient('ca. 1 msk olja')).toBe('olja');
    expect(stripIngredient('ungefär 3 morötter')).toBe('morot');
  });

  it('kapar INTE ord som råkar börja på ca', () => {
    // Regexen saknade krav på mellanslag efter "ca", så varje sådant ord
    // stympades: cayennepeppar blev "yennepeppar" och cashewnötter
    // "shewnötter". Buggen hittades i den globala poolen 2026-09-21.
    expect(stripIngredient('cayennepeppar')).toBe('cayennepeppar');
    expect(stripIngredient('cashewnötter')).toBe('cashewnöt');
    expect(stripIngredient('carbonara')).toBe('carbonara');
    expect(stripIngredient('camembert')).toBe('camembert');
  });

  it('tar bort ensamma parenteser', () => {
    expect(stripIngredient('cayennepeppar eller chiliflakes )')).toBe('cayennepeppar eller chiliflakes');
  });
});

describe('stripIngredient — ledande tillagningsord', () => {
  it('skalar bort tillagning som står först', () => {
    // Svenskan sätter tillagningsordet före varan, men strippningen tog bara
    // det som stod sist — så "riven ost" gick igenom orörd.
    expect(stripIngredient('finrivet ingefära')).toBe('ingefära');
    expect(stripIngredient('riven ost')).toBe('ost');
    expect(stripIngredient('finhackad lök')).toBe('lök');
    expect(stripIngredient('varmt kaffe')).toBe('kaffe');
    expect(stripIngredient('skalade potatisar')).toBe('potatis');
  });

  it('rör INTE ord som definierar produkten', () => {
    // De här står också först, men byter vara om de stryks: en burk krossade
    // tomater är inte tomater, kokt skinka är en charkvara, rökt lax är inte lax.
    expect(stripIngredient('krossade tomater')).toBe('krossade tomater');
    expect(stripIngredient('kokt skinka')).toBe('kokt skinka');
    expect(stripIngredient('rökt lax')).toBe('rökt lax');
    expect(stripIngredient('torkad timjan')).toBe('torkad timjan');
  });

  it('strippar aldrig till tomt', () => {
    expect(stripIngredient('riven')).toBe('riven');
  });

  it('flyttar produktbestämningen först', () => {
    // EN skrivning per vara: samma produkt skrevs på två sätt beroende på
    // recept och blev två rader i ordförrådet.
    expect(stripIngredient('kanel, malen')).toBe('malen kanel');
    expect(stripIngredient('skinka, kokt')).toBe('kokt skinka');
    expect(stripIngredient('tomater, krossade')).toBe('krossade tomater');
    expect(stripIngredient('lingon, rårörda')).toBe('rårörda lingon');
    // Redan rätt ordning lämnas som den är.
    expect(stripIngredient('malen kanel')).toBe('malen kanel');
  });

  it('flyttar INTE tillagningsord — de stryks i stället', () => {
    expect(stripIngredient('parmesan, riven')).toBe('parmesan');
    expect(stripIngredient('svartpeppar, nymalen')).toBe('svartpeppar');
  });

  it('skalar bort vad varan ska användas till', () => {
    // "till stekning" beskriver receptet, inte varan — i butiken finns smör.
    expect(stripIngredient('smör, till stekning')).toBe('smör');
    expect(stripIngredient('persilja till servering')).toBe('persilja');
    expect(stripIngredient('ägg till pensling')).toBe('ägg');
  });

  it('kapar inte namn som bara råkar innehålla till', () => {
    expect(stripIngredient('tillbehör: gröna ärtor')).toBe('tillbehör: gröna ärtor');
    expect(stripIngredient('dill')).toBe('dill');
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
