import { describe, it, expect } from 'vitest';
import type { StapleItem, StoreCategory } from '@veckis/shared';
import { quickListCandidates, quickListRows, stapleForName } from './quickList';

function staple(name: string, category: StoreCategory, inQuickList = true): StapleItem {
  return { id: name, householdId: 'h', name, category, subCategory: null, unit: null, defaultQuantity: null, usageCount: 0, inQuickList };
}

describe('quickListRows', () => {
  it('visar bara valda snabbvaror', () => {
    const rows = quickListRows([staple('mjölk', 'dairy_eggs'), staple('kaviar', 'canned_dry', false)], []);
    expect(rows.map(r => r.staple.name)).toEqual(['mjölk']);
  });

  it('sorterar i butiksordning, sedan på namn', () => {
    const rows = quickListRows([
      staple('yoghurt', 'dairy_eggs'),
      staple('tvättmedel', 'cleaning'),
      staple('bananer', 'fruit_veg'),
      staple('mjölk', 'dairy_eggs'),
    ], []);
    expect(rows.map(r => r.staple.name)).toEqual(['bananer', 'mjölk', 'yoghurt', 'tvättmedel']);
  });

  it('markerar varor som redan står obockade på listan, oavsett skiftläge', () => {
    const rows = quickListRows([staple('mjölk', 'dairy_eggs'), staple('bröd', 'bread_bakery')], [
      { name: 'Mjölk ', isChecked: false },
    ]);
    expect(rows.find(r => r.staple.name === 'mjölk')?.onList).toBe(true);
    expect(rows.find(r => r.staple.name === 'bröd')?.onList).toBe(false);
  });

  it('en avbockad rad räknas inte som på listan', () => {
    const rows = quickListRows([staple('mjölk', 'dairy_eggs')], [{ name: 'mjölk', isChecked: true }]);
    expect(rows[0].onList).toBe(false);
  });

  it('tom när inget är valt', () => {
    expect(quickListRows([], [{ name: 'mjölk', isChecked: false }])).toEqual([]);
  });
});

describe('stapleForName', () => {
  it('hittar basvaran oavsett skiftläge och mellanslag', () => {
    expect(stapleForName([staple('mjölk', 'dairy_eggs')], ' Mjölk')?.name).toBe('mjölk');
  });

  it('undefined när hushållet saknar basvaran', () => {
    expect(stapleForName([staple('mjölk', 'dairy_eggs')], 'ägg')).toBeUndefined();
  });
});

describe('quickListCandidates', () => {
  const since = new Date('2026-10-14T10:00:00Z');
  const bought = (name: string, extra: Record<string, unknown> = {}) =>
    ({ name, isChecked: true, checkedAt: '2026-10-14T11:00:00Z', recipeId: null, menuItemId: null, ...extra });
  const used = (name: string, usageCount: number, inQuickList = false) => ({ ...staple(name, 'other', inQuickList), usageCount });

  it('tar bara det som bockats av sedan starten', () => {
    const names = quickListCandidates([
      bought('mjölk'),
      bought('kaffe', { checkedAt: '2026-10-01T09:00:00Z' }),
      bought('ägg', { checkedAt: null }),
      bought('bröd', { isChecked: false }),
    ], [], since);
    expect(names).toEqual(['mjölk']);
  });

  it('utesluter varor från veckomenyn och recept', () => {
    const names = quickListCandidates([bought('mjölk'), bought('kycklingfilé', { menuItemId: 'm1' }), bought('lime', { recipeId: 'r1' })], [], since);
    expect(names).toEqual(['mjölk']);
  });

  it('utesluter det som redan är snabbvaror, och dubbletter', () => {
    const names = quickListCandidates([bought('mjölk'), bought('Mjölk'), bought('kaffe')], [used('kaffe', 5, true)], since);
    expect(names).toEqual(['mjölk']);
  });

  it('de oftast tillagda först', () => {
    const names = quickListCandidates([bought('tandkräm'), bought('mjölk'), bought('bananer')],
      [used('mjölk', 12), used('bananer', 4), used('tandkräm', 1)], since);
    expect(names).toEqual(['mjölk', 'bananer', 'tandkräm']);
  });
});
