import { describe, it, expect } from 'vitest';
import { estimateKey, smartMergeRequests, smartMergeRows } from './inventorySmartMerge';

type S = { qty: number | null; menuItemId: string };
const row = (name: string, unit: string | null, qty: number | null, sources: (number | null)[] = [qty], recipe = 'Gryta'): { key: string; name: string; unit: string | null; totalQty: number | null; measured: boolean; recipeTitles: string[]; sources: S[]; estimatedFrom?: { qty: number | null; unit: string | null }[] } => ({
  key: `${name}|${unit ?? ''}`, name, unit, totalQty: qty, measured: qty != null, recipeTitles: [recipe],
  sources: sources.map((q, i) => ({ qty: q, menuItemId: `m${i}` })) as S[],
});

describe('smartMergeRequests', () => {
  it('frågar bara om rader med exakt samma namn', () => {
    expect(smartMergeRequests([row('vispgrädde', 'dl', 2.5), row('grädde', null, null)])).toEqual([]);
    expect(smartMergeRequests([row('olja', 'msk', 1), row('rapsolja', 'msk', 2)])).toEqual([]);
  });
  it('frågar om styck mot vikt, och mängd utan enhet räknas som styck', () => {
    expect(smartMergeRequests([row('potatis', 'kg', 1), row('potatis', null, 4)]))
      .toEqual([{ name: 'potatis', unit: 'st', family: 'mass', recipeTitle: 'Gryta' }]);
  });
  it('frågar inte utan en rad att slå ihop med, och inte om det som hoppas över', () => {
    expect(smartMergeRequests([row('ägg', 'st', 2), row('ägg', null, null)])).toEqual([]);
    expect(smartMergeRequests([row('salt', 'tsk', 1), row('salt', null, null)], n => n === 'salt')).toEqual([]);
  });
});

describe('smartMergeRows', () => {
  const potatis = [row('potatis', 'kg', 1), row('potatis', 'st', 4)];
  const key = estimateKey({ name: 'potatis', unit: 'st', family: 'mass', recipeTitle: null });

  it('1 kg + 4 st potatis à 90 g blir 1,36 kg och minns sina delar', () => {
    const [r, ...rest] = smartMergeRows(potatis, { [key]: 90 });
    expect(rest).toEqual([]);
    expect(r.unit).toBe('kg');
    expect(r.totalQty).toBeCloseTo(1.36);
    expect(r.estimatedFrom).toEqual([{ qty: 1, unit: 'kg' }, { qty: 4, unit: 'st' }]);
    expect(r.sources.reduce((n, s) => n + (s.qty ?? 0), 0)).toBeCloseTo(1.36);
  });

  it('mängd som saknas uppskattas per recept', () => {
    const rows = [row('grädde', 'dl', 2), row('grädde', null, null, [null], 'Pannkakor')];
    const k = estimateKey({ name: 'grädde', unit: null, family: 'volume', recipeTitle: 'Pannkakor' });
    const [r] = smartMergeRows(rows, { [k]: 300 });
    // 2 dl + 3 dl — appens vanliga regel skriver det som 0,5 l.
    expect(r.unit).toBe('l');
    expect(r.totalQty).toBeCloseTo(0.5);
  });

  it('utan svar, eller uppdelad, står raderna kvar', () => {
    expect(smartMergeRows(potatis, {})).toHaveLength(2);
    expect(smartMergeRows(potatis, { [key]: null })).toHaveLength(2);
    expect(smartMergeRows(potatis, { [key]: 90 }, new Set(['potatis']))).toHaveLength(2);
  });

  it('slår aldrig ihop olika namn', () => {
    expect(smartMergeRows([row('grädde', 'dl', 2), row('vispgrädde', 'dl', 3)], {})).toHaveLength(2);
  });
});
