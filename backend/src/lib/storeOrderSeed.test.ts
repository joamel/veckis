import { describe, it, expect } from 'vitest';
import type { StoreCategory } from '@prisma/client';
import { aggregateOrder, pickSeed, storeFormat, MIN_SEED_HOUSEHOLDS } from './storeOrderSeed';

const DEF = ['fruit_veg', 'meat_fish', 'dairy_eggs', 'bread_bakery', 'frozen'] as StoreCategory[];

describe('storeFormat', () => {
  it('skiljer ICA-formaten åt', () => {
    expect(storeFormat('ICA', 'ICA Maxi Stormarknad Lindhagen')).toBe('ICA Maxi');
    expect(storeFormat('ICA', 'ICA Kvantum Liljeholmen')).toBe('ICA Kvantum');
    expect(storeFormat('ICA', 'ICA Supermarket Sjöstan')).toBe('ICA Supermarket');
    expect(storeFormat('ICA', 'ICA Nära Ålstensgatan')).toBe('ICA Nära');
    expect(storeFormat('ICA', 'ICA Torget')).toBe('ICA');
  });
  it('skiljer Stora Coop från vanliga Coop', () => {
    expect(storeFormat('Coop', 'Stora Coop Bromma')).toBe('Stora Coop');
    expect(storeFormat('Coop', 'Coop Forum Kungens kurva')).toBe('Stora Coop');
    expect(storeFormat('Coop', 'Coop Hornstull')).toBe('Coop');
  });
  it('övriga kedjor är ett format', () => {
    expect(storeFormat('Willys', 'Willys Hemma Södermalm')).toBe('Willys Hemma');
    expect(storeFormat('Lidl', 'Lidl Västberga')).toBe('Lidl');
    expect(storeFormat(null, 'Lanthandeln')).toBeNull();
  });
});

describe('aggregateOrder', () => {
  it(`kräver ${MIN_SEED_HOUSEHOLDS} hushåll`, () => {
    expect(aggregateOrder([{ householdId: 'a', parentOrder: ['bread_bakery', 'fruit_veg', 'meat_fish', 'dairy_eggs', 'frozen'] }], DEF)).toBeNull();
  });

  it('lägger ihop hushållens ordning', () => {
    const order = aggregateOrder([
      { householdId: 'a', parentOrder: ['bread_bakery', 'fruit_veg', 'meat_fish', 'dairy_eggs', 'frozen'] },
      { householdId: 'b', parentOrder: ['bread_bakery', 'fruit_veg', 'dairy_eggs', 'meat_fish', 'frozen'] },
    ], DEF);
    expect(order?.slice(0, 2)).toEqual(['bread_bakery', 'fruit_veg']);
    expect(order?.at(-1)).toBe('frozen');
  });

  it('räknar inte standardordningen och inte samma hushåll två gånger', () => {
    expect(aggregateOrder([
      { householdId: 'a', parentOrder: ['bread_bakery', 'fruit_veg', 'meat_fish', 'dairy_eggs', 'frozen'] },
      { householdId: 'a', parentOrder: ['frozen', 'fruit_veg', 'meat_fish', 'dairy_eggs', 'bread_bakery'] },
      { householdId: 'b', parentOrder: [...DEF] },
    ], DEF)).toBeNull();
  });

  it('ignorerar egna rubriker och behåller alla standardkategorier', () => {
    const order = aggregateOrder([
      { householdId: 'a', parentOrder: ['c:Kassan', 'frozen', 'fruit_veg', 'meat_fish'] },
      { householdId: 'b', parentOrder: ['frozen', 'fruit_veg', 'c:Godis', 'meat_fish'] },
    ], DEF);
    expect(order).toHaveLength(DEF.length);
    expect(order?.[0]).toBe('frozen');
    expect(order?.some(k => k.startsWith('c:'))).toBe(false);
  });
});

describe('pickSeed', () => {
  const sorted = (h: string) => ({ householdId: h, parentOrder: ['bread_bakery', 'fruit_veg', 'meat_fish', 'dairy_eggs', 'frozen'] });
  it('tar den mest specifika nivån som har underlag', () => {
    const seed = pickSeed([
      { level: 'shared_store', label: 'ICA Maxi Lindhagen', candidates: [sorted('a')] },
      { level: 'chain_format', label: 'ICA Maxi', candidates: [sorted('a'), sorted('b')] },
      { level: 'chain', label: 'ICA', candidates: [sorted('a'), sorted('b'), sorted('c')] },
    ], DEF);
    expect(seed?.level).toBe('chain_format');
    expect(seed?.label).toBe('ICA Maxi');
  });
  it('null utan underlag', () => {
    expect(pickSeed([{ level: 'chain', label: 'ICA', candidates: [] }], DEF)).toBeNull();
  });
});
