import { describe, expect, it } from 'vitest';
import { browserStepperFor } from './browserStepper';

const item = (id: string, name: string, quantity: number | null, unit: string | null, isChecked = false) =>
  ({ id, name, quantity, unit, isChecked });

describe('browserStepperFor', () => {
  it('0 när varan inte finns på listan', () => {
    expect(browserStepperFor([], 'biff')).toEqual({ mode: 'count', count: 0, target: null });
  });

  it('antal från raden utan enhet eller i st', () => {
    const a = item('a', 'Biff', 2, null);
    expect(browserStepperFor([a], 'biff')).toEqual({ mode: 'count', count: 2, target: a });
    const b = item('b', 'gurka', null, 'st');
    expect(browserStepperFor([b], 'Gurka')).toEqual({ mode: 'count', count: 1, target: b });
  });

  it('avbockade rader räknas inte', () => {
    expect(browserStepperFor([item('a', 'biff', 3, null, true)], 'biff')).toEqual({ mode: 'count', count: 0, target: null });
  });

  it('mängd i g visas som den är, inte som ett antal', () => {
    const a = item('a', 'nötfärs', 400, 'g');
    expect(browserStepperFor([a], 'nötfärs')).toEqual({ mode: 'measure', quantity: 400, unit: 'g', target: a });
  });

  it('en räknebar rad går före en rad i g', () => {
    const g = item('g', 'lök', 200, 'g');
    const st = item('st', 'lök', 3, 'st');
    expect(browserStepperFor([g, st], 'lök')).toEqual({ mode: 'count', count: 3, target: st });
  });
});
