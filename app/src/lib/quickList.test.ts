import { describe, it, expect } from 'vitest';
import type { StapleItem, StoreCategory } from '@veckis/shared';
import { amountOf, quickAmountLabel, quickListCandidates, quickListRows, stapleForName } from './quickList';

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
    ({ name, quantity: 1, unit: null, isChecked: true, checkedAt: '2026-10-14T11:00:00Z', recipeId: null, menuItemId: null, ...extra });
  const names = (c: { name: string }[]) => c.map(x => x.name);
  const used = (name: string, usageCount: number, inQuickList = false) => ({ ...staple(name, 'other', inQuickList), usageCount });

  it('tar bara det som bockats av sedan starten', () => {
    const found = quickListCandidates([
      bought('mjölk'),
      bought('kaffe', { checkedAt: '2026-10-01T09:00:00Z' }),
      bought('ägg', { checkedAt: null }),
      bought('bröd', { isChecked: false }),
    ], [], since);
    expect(names(found)).toEqual(['mjölk']);
  });

  it('utesluter varor från veckomenyn och recept', () => {
    const found = quickListCandidates([bought('mjölk'), bought('kycklingfilé', { menuItemId: 'm1' }), bought('lime', { recipeId: 'r1' })], [], since);
    expect(names(found)).toEqual(['mjölk']);
  });

  it('utesluter det som redan är snabbvaror, och dubbletter', () => {
    const found = quickListCandidates([bought('mjölk'), bought('Mjölk'), bought('kaffe')], [used('kaffe', 5, true)], since);
    expect(names(found)).toEqual(['mjölk']);
  });

  it('de oftast tillagda först', () => {
    const found = quickListCandidates([bought('tandkräm'), bought('mjölk'), bought('bananer')],
      [used('mjölk', 12), used('bananer', 4), used('tandkräm', 1)], since);
    expect(names(found)).toEqual(['mjölk', 'bananer', 'tandkräm']);
  });
});

describe('snabbvarans mängd', () => {
  it('en rad utan enhet med mängden 1 är bara namnet', () => {
    expect(amountOf({ quantity: 1, unit: null })).toEqual({ quickQuantity: null, quickUnit: null });
    expect(amountOf({ quantity: 1, unit: '  ' })).toEqual({ quickQuantity: null, quickUnit: null });
  });

  it('tar mängd och enhet från raden', () => {
    expect(amountOf({ quantity: 1.5, unit: 'l' })).toEqual({ quickQuantity: 1.5, quickUnit: 'l' });
    expect(amountOf({ quantity: 3, unit: null })).toEqual({ quickQuantity: 3, quickUnit: null });
  });

  it('enheten böjs efter antalet, som i listan', () => {
    expect(quickAmountLabel({ quickQuantity: 2, quickUnit: 'påse' })).toBe('2 påsar');
    expect(quickAmountLabel({ quickQuantity: 1, quickUnit: 'påse' })).toBe('1 påse');
  });

  it('visas med decimalkomma, och tomt för bara namnet', () => {
    // Samma form som listan: köksmåttet skriver liter i bråk.
    expect(quickAmountLabel({ quickQuantity: 1.5, quickUnit: 'l' })).toBe('1 1/2 l');
    expect(quickAmountLabel({ quickQuantity: 0.5, quickUnit: 'kg' })).toBe('0,5 kg');
    expect(quickAmountLabel({ quickQuantity: 3, quickUnit: null })).toBe('3');
    expect(quickAmountLabel({ quickQuantity: null, quickUnit: null })).toBe('');
    expect(quickAmountLabel({})).toBe('');
  });

  it('kandidaterna får mängden från det som handlades', () => {
    const found = quickListCandidates(
      [{ name: 'yoghurt', quantity: 1.5, unit: 'l', isChecked: true, checkedAt: '2026-10-14T11:00:00Z', recipeId: null, menuItemId: null }],
      [], new Date('2026-10-14T10:00:00Z'));
    expect(found).toEqual([{ name: 'yoghurt', quickQuantity: 1.5, quickUnit: 'l' }]);
  });
});
