import { describe, it, expect } from 'vitest';
import { suggestMerge, isPackagingUnit, type EquivalenceMap } from './smartMerge';

const eq = (entries: Array<[string, number, 'g' | 'ml']>): EquivalenceMap =>
  new Map(entries.map(([unit, baseAmount, baseUnit]) => [unit, { baseAmount, baseUnit }]));

describe('suggestMerge', () => {
  it('1 paket + 390 g med paket=400g → 2 paket (hela förpackningar, ceil)', () => {
    const s = suggestMerge(
      [{ quantity: 1, unit: 'paket' }, { quantity: 390, unit: 'g' }],
      eq([['paket', 400, 'g']]),
    );
    expect(s).toEqual({ quantity: 2, unit: 'paket', basis: 'equivalence' });
  });

  it('ceil-exakt kant: 1 paket + 400 g (= 800 g) → exakt 2, inte 3', () => {
    const s = suggestMerge(
      [{ quantity: 1, unit: 'paket' }, { quantity: 400, unit: 'g' }],
      eq([['paket', 400, 'g']]),
    );
    expect(s).toEqual({ quantity: 2, unit: 'paket', basis: 'equivalence' });
  });

  it('volymfamilj: 1 burk (400 ml) + 2 dl → 2 burk', () => {
    const s = suggestMerge(
      [{ quantity: 1, unit: 'burk' }, { quantity: 2, unit: 'dl' }],
      eq([['burk', 400, 'ml']]),
    );
    expect(s).toEqual({ quantity: 2, unit: 'burk', basis: 'equivalence' });
  });

  it('okänd förpackningsenhet utan ekvivalens → null', () => {
    const s = suggestMerge(
      [{ quantity: 1, unit: 'paket' }, { quantity: 390, unit: 'g' }],
      new Map(),
    );
    expect(s).toBeNull();
  });

  it('blandade basfamiljer (paket=400g + lös dl) → null (ingen densitetsgissning)', () => {
    const s = suggestMerge(
      [{ quantity: 1, unit: 'paket' }, { quantity: 2, unit: 'dl' }],
      eq([['paket', 400, 'g']]),
    );
    expect(s).toBeNull();
  });

  it('två förpackningsenheter + lös massa → uttrycks i den STÖRSTA (paket)', () => {
    const s = suggestMerge(
      [
        { quantity: 1, unit: 'paket' },
        { quantity: 1, unit: 'burk' },
        { quantity: 100, unit: 'g' },
      ],
      eq([['paket', 400, 'g'], ['burk', 200, 'g']]),
    );
    // 400 + 200 + 100 = 700 g → ceil(700/400) = 2 paket
    expect(s).toEqual({ quantity: 2, unit: 'paket', basis: 'equivalence' });
  });

  it('ren volym utan förpackning → basis exact via combineQuantities', () => {
    const s = suggestMerge([{ quantity: 1, unit: 'dl' }, { quantity: 2, unit: 'msk' }], new Map());
    expect(s).not.toBeNull();
    expect(s!.basis).toBe('exact');
  });

  it('rad med tom enhet → null', () => {
    const s = suggestMerge(
      [{ quantity: 1, unit: 'paket' }, { quantity: 2, unit: null }],
      eq([['paket', 400, 'g']]),
    );
    expect(s).toBeNull();
  });

  it('icke-heltal avrundas uppåt: 1 paket (400g) + 50 g → 2 paket', () => {
    const s = suggestMerge(
      [{ quantity: 1, unit: 'paket' }, { quantity: 50, unit: 'g' }],
      eq([['paket', 400, 'g']]),
    );
    expect(s).toEqual({ quantity: 2, unit: 'paket', basis: 'equivalence' });
  });

  it('bara förpackningsenheter (2 paket + 1 paket) → 3 paket', () => {
    const s = suggestMerge(
      [{ quantity: 2, unit: 'paket' }, { quantity: 1, unit: 'paket' }],
      eq([['paket', 400, 'g']]),
    );
    expect(s).toEqual({ quantity: 3, unit: 'paket', basis: 'equivalence' });
  });

  it('kg + paket: 1 paket (500g smör) + 0.5 kg → 2 paket', () => {
    const s = suggestMerge(
      [{ quantity: 1, unit: 'paket' }, { quantity: 0.5, unit: 'kg' }],
      eq([['paket', 500, 'g']]),
    );
    expect(s).toEqual({ quantity: 2, unit: 'paket', basis: 'equivalence' });
  });

  it('tom entries-lista → null', () => {
    expect(suggestMerge([], new Map())).toBeNull();
  });
});

describe('isPackagingUnit', () => {
  it('paket/burk/påse är förpackningsenheter', () => {
    expect(isPackagingUnit('paket')).toBe(true);
    expect(isPackagingUnit('burk')).toBe(true);
    expect(isPackagingUnit('Påse')).toBe(true);
  });
  it('g/kg/dl/msk och tomt är det inte', () => {
    expect(isPackagingUnit('g')).toBe(false);
    expect(isPackagingUnit('kg')).toBe(false);
    expect(isPackagingUnit('dl')).toBe(false);
    expect(isPackagingUnit('msk')).toBe(false);
    expect(isPackagingUnit('')).toBe(false);
    expect(isPackagingUnit(null)).toBe(false);
  });
});
