import { describe, it, expect } from 'vitest';
import { combineQuantities } from './unitOrder';

describe('combineQuantities', () => {
  it('returns null for empty input', () => {
    expect(combineQuantities([])).toBeNull();
  });

  it('keeps a single entry in its own unit', () => {
    expect(combineQuantities([{ quantity: 3, unit: 'dl' }])).toEqual({ quantity: 3, unit: 'dl' });
  });

  it('combines tsk + msk and picks msk as the largest reasonable unit', () => {
    // 1 msk + 3 tsk = 15 + 15 = 30 ml → 2 msk
    expect(combineQuantities([
      { quantity: 1, unit: 'msk' },
      { quantity: 3, unit: 'tsk' },
    ])).toEqual({ quantity: 2, unit: 'msk' });
  });

  it('promotes to dl when total volume is large enough', () => {
    // 5 msk = 75 ml → still msk
    expect(combineQuantities([
      { quantity: 5, unit: 'msk' },
    ])).toEqual({ quantity: 5, unit: 'msk' });
    // 200 ml → 2 dl
    expect(combineQuantities([
      { quantity: 100, unit: 'ml' },
      { quantity: 1, unit: 'dl' },
    ])).toEqual({ quantity: 2, unit: 'dl' });
  });

  it('promotes to l for >= 1 l and uses 0.5 l for exactly half', () => {
    expect(combineQuantities([{ quantity: 5, unit: 'dl' }])).toEqual({ quantity: 0.5, unit: 'l' });
    expect(combineQuantities([
      { quantity: 1, unit: 'l' },
      { quantity: 5, unit: 'dl' },
    ])).toEqual({ quantity: 1.5, unit: 'l' });
  });

  it('combines g + kg and picks kg only at half-kg or more', () => {
    expect(combineQuantities([
      { quantity: 300, unit: 'g' },
      { quantity: 200, unit: 'g' },
    ])).toEqual({ quantity: 0.5, unit: 'kg' });
    expect(combineQuantities([{ quantity: 100, unit: 'g' }])).toEqual({ quantity: 100, unit: 'g' });
    expect(combineQuantities([{ quantity: 300, unit: 'g' }])).toEqual({ quantity: 300, unit: 'g' });
  });

  it('returns null when mixing volume and mass', () => {
    expect(combineQuantities([
      { quantity: 1, unit: 'dl' },
      { quantity: 100, unit: 'g' },
    ])).toBeNull();
  });

  it('returns null for unknown units (e.g. "st", "påse")', () => {
    expect(combineQuantities([
      { quantity: 2, unit: 'st' },
      { quantity: 3, unit: 'st' },
    ])).toBeNull();
  });
});
