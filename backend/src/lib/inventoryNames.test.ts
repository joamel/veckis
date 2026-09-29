import { describe, expect, it } from 'vitest';
import type { StoreCategory } from '@prisma/client';
import { resolveInventoryNames } from './inventoryNames';

const alias = (entries: Array<[string, string, StoreCategory]>) =>
  new Map(entries.map(([raw, canonical, category]) => [raw, { canonical, category }]));

describe('resolveInventoryNames', () => {
  it('slår ihop varianter via poolens kanoniska namn', () => {
    const aliases = alias([['koncentrerad kycklingfond', 'kycklingfond', 'canned_dry']]);
    const [a, b] = resolveInventoryNames(['Koncentrerad kycklingfond', 'kycklingfond'], aliases, new Map());
    expect(a.canonical).toBe('kycklingfond');
    expect(b.canonical).toBe('kycklingfond');
  });

  it('hushållets val i listan vinner över poolen och klassaren', () => {
    const [r] = resolveInventoryNames(['matgrädde'], alias([['matgrädde', 'matgrädde', 'other']]), new Map([['matgrädde', 'dairy_eggs' as StoreCategory]]));
    expect(r.category).toBe('dairy_eggs');
  });

  it('en inlärd "other" räknas inte — klassaren får gissa', () => {
    const [r] = resolveInventoryNames(['mjölk'], alias([['mjölk', 'mjölk', 'other']]), new Map([['mjölk', 'other' as StoreCategory]]));
    expect(r.category).toBe('dairy_eggs');
  });

  it('strippar mängden och behåller originalnamnet som nyckel', () => {
    const [r] = resolveInventoryNames(['4 st kycklingfileer'], new Map(), new Map());
    expect(r).toMatchObject({ name: '4 st kycklingfileer', canonical: 'kycklingfileer', category: 'meat_fish' });
  });
});
