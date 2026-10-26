import { describe, it, expect } from 'vitest';
import { estimateImportSeconds, importStageTimes } from './importEstimate';

describe('estimateImportSeconds', () => {
  it('en kort önskan går fort', () => {
    expect(estimateImportSeconds('paste', 'frasiga våfflor')).toBe(6);
  });

  it('en veckomeny i en bildtext tar mycket längre', () => {
    expect(estimateImportSeconds('paste', 'x'.repeat(2200))).toBeGreaterThanOrEqual(18);
  });

  it('har ett tak', () => {
    expect(estimateImportSeconds('paste', 'x'.repeat(20000))).toBe(40);
  });

  it('Instagram-länkar räknas som långa, andra länkar som ett recept', () => {
    expect(estimateImportSeconds('link', 'https://www.instagram.com/p/abc/')).toBe(18);
    expect(estimateImportSeconds('link', 'https://www.ica.se/recept/kladdkaka/')).toBe(9);
  });
});

describe('importStageTimes', () => {
  it('byter text före och efter förväntad tid', () => {
    expect(importStageTimes(10)).toEqual([2000, 7000, 14000]);
  });
});
