import { describe, it, expect } from 'vitest';

import { estimateUnitKey, parseEstimates } from './inventoryEstimate';

describe('parseEstimates', () => {
  it('läser tal i ordning, även i ett kodblock', () => {
    expect(parseEstimates('```json\n[90, null, 300]\n```', 3)).toEqual([90, null, 300]);
  });
  it('orimliga svar blir null', () => {
    expect(parseEstimates('[0, -5, 1000000, "90"]', 4)).toEqual([null, null, null, null]);
  });
  it('för korta svar fylls ut, för långa kapas', () => {
    expect(parseEstimates('[90]', 2)).toEqual([90, null]);
    expect(parseEstimates('[1, 2, 3]', 2)).toEqual([1, 2]);
  });
});

describe('estimateUnitKey', () => {
  it('skiljer sig från förpackningarnas nycklar', () => {
    expect(estimateUnitKey(' St ', 'mass')).toBe('~st:g');
    expect(estimateUnitKey('burk', 'volume')).toBe('~burk:ml');
  });
});
