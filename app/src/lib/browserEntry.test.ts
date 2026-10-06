import { describe, expect, it } from 'vitest';
import { browserEntryFor } from './browserEntry';

const item = (id: string, name: string, quantity: number | null, unit: string | null, isChecked = false) =>
  ({ id, name, quantity, unit, isChecked });

describe('browserEntryFor', () => {
  it('null när varan inte finns på listan', () => {
    expect(browserEntryFor([], 'biff')).toBeNull();
  });

  it('avbockade rader räknas inte', () => {
    expect(browserEntryFor([item('a', 'biff', 3, null, true)], 'biff')).toBeNull();
  });

  it('mängd med enhet, decimalkomma', () => {
    const a = item('a', 'Nötfärs', 0.5, 'kg');
    expect(browserEntryFor([a], 'nötfärs')).toEqual({ target: a, label: '0,5 kg' });
  });

  it('utan enhet bara antalet, utan mängd tom etikett', () => {
    expect(browserEntryFor([item('a', 'biff', 2, null)], 'biff')?.label).toBe('2');
    expect(browserEntryFor([item('a', 'biff', null, null)], 'biff')?.label).toBe('');
  });
});
