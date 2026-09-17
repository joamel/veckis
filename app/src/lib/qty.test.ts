import { describe, it, expect } from 'vitest';
import { normalizeQtyInput, skalaQty } from './qty';

describe('skalaQty', () => {
  it('rör inte mängden alls när receptet inte skalas', () => {
    // Buggen som gav upphov till regeln: "1 3/4 cup" ur ett importerat recept
    // visades som "2 cup" fast ingen skalning skett.
    expect(skalaQty(1.75)).toBe(1.75);
    expect(skalaQty(1.75, 1)).toBe(1.75);
    expect(skalaQty(1 / 3)).toBeCloseTo(1 / 3, 10);
    expect(skalaQty(0.25)).toBe(0.25);
  });

  it('snäpper skalade mängder till kvartar, även över 1', () => {
    // Tidigare gällde halvor över 1, vilket åt upp just kvartarna.
    expect(skalaQty(1.75, 2)).toBe(3.5);
    expect(skalaQty(0.875, 2)).toBe(1.75);
    expect(skalaQty(1, 1.3)).toBe(1.25);
    expect(skalaQty(1, 1 / 3)).toBe(0.25);
  });

  it('lämnar heltal i fred vid skalning', () => {
    expect(skalaQty(2, 3)).toBe(6);
    expect(skalaQty(0.5, 2)).toBe(1);
  });
});

describe('normalizeQtyInput', () => {
  it('gör punkt till komma och tillåter bara ett kommatecken', () => {
    expect(normalizeQtyInput('1.5')).toBe('1,5');
    expect(normalizeQtyInput('1,5,5')).toBe('1,55');
  });

  it('lägger till ledande noll', () => {
    expect(normalizeQtyInput(',5')).toBe('0,5');
  });

  it('kastar tecken som inte hör hemma i ett mängdfält', () => {
    expect(normalizeQtyInput('2 dl')).toBe('2');
  });
});
