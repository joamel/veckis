import { describe, it, expect } from 'vitest';
import { hittaLiknande, likhet, normaliseraForJamforelse } from './liknandeNamn';

// Hushållets befintliga basvaror i testerna.
const BASVAROR = [
  'mjölk', 'mozzarella', 'crème fraiche', 'köttbullar', 'spaghetti', 'yoghurt',
  'gul lök', 'rödlök', 'salladslök', 'purjolök', 'kanel', 'kanelstång',
  'basmatiris', 'jasminris', 'olivolja', 'sesamolja', 'tandborste',
];

describe('normaliseraForJamforelse', () => {
  it('tar bort versaler, diakriter och skiljetecken', () => {
    expect(normaliseraForJamforelse('Crème fraîche')).toBe('creme fraiche');
    expect(normaliseraForJamforelse('Müsli, seeds & nuts')).toBe('musli seeds nuts');
  });

  // Avsiktligt: det är därför "køttbullar" (dansk ø) matchar "köttbullar".
  it('plattar ut prickar och ringar', () => {
    expect(normaliseraForJamforelse('Kött')).toBe('kott');
    expect(normaliseraForJamforelse('Køttbullar')).toBe(normaliseraForJamforelse('Köttbullar'));
  });
});

describe('likhet', () => {
  it('ger 1 för samma namn oavsett stavning av diakriter', () => {
    expect(likhet('Crème fraîche', 'creme fraiche')).toBe(1);
  });

  it('ger lågt värde för olika varor', () => {
    expect(likhet('rödlök', 'gul lök')).toBeLessThan(0.7);
  });
});

describe('hittaLiknande', () => {
  it('hittar stavfel', () => {
    expect(hittaLiknande('mozarella', BASVAROR)).toBe('mozzarella');
    expect(hittaLiknande('creme fraise', BASVAROR)).toBe('crème fraiche');
    expect(hittaLiknande('crème fraishe', BASVAROR)).toBe('crème fraiche');
    expect(hittaLiknande('køttbullar', BASVAROR)).toBe('köttbullar');
    expect(hittaLiknande('spagetti', BASVAROR)).toBe('spaghetti');
  });

  it('matchar aldrig ihop varor man köper var för sig', () => {
    expect(hittaLiknande('rödlök', BASVAROR)).toBe('rödlök');
    expect(hittaLiknande('gul lök', BASVAROR)).toBe('gul lök');
    expect(hittaLiknande('jasminris', BASVAROR)).toBe('jasminris');
    expect(hittaLiknande('sesamolja', BASVAROR)).toBe('sesamolja');
  });

  it('gör inte en kanelstång av kanel', () => {
    expect(hittaLiknande('kanel', BASVAROR)).toBe('kanel');
    expect(hittaLiknande('kanelstänger', BASVAROR)).toBe('kanelstång');
  });

  it('ger null när inget liknar', () => {
    expect(hittaLiknande('vattenmelon', BASVAROR)).toBeNull();
    expect(hittaLiknande('blöjor', BASVAROR)).toBeNull();
  });

  it('rör inte korta namn — där blir varje avvikelse för stor', () => {
    expect(hittaLiknande('ris', ['ris', 'risp'])).toBeNull();
    expect(hittaLiknande('te', BASVAROR)).toBeNull();
  });

  it('kräver samma första bokstav', () => {
    expect(hittaLiknande('tandborste', ['handborste'])).toBeNull();
  });
});
