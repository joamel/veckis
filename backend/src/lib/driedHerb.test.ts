import { describe, it, expect } from 'vitest';
import { withDriedPrefix } from './driedHerb';

describe('withDriedPrefix', () => {
  it('gör en ört i kryddmått till torkad', () => {
    expect(withDriedPrefix('timjan', 'tsk')).toBe('torkad timjan');
    expect(withDriedPrefix('oregano', 'krm')).toBe('torkad oregano');
  });

  it('rör inte färska, andra mått eller örter som oftast är färska', () => {
    expect(withDriedPrefix('timjan', 'kvist')).toBe('timjan');
    expect(withDriedPrefix('timjan', null)).toBe('timjan');
    expect(withDriedPrefix('basilika', 'tsk', 'färsk basilika')).toBe('basilika');
    expect(withDriedPrefix('timjan', 'tsk', 'hackad timjan')).toBe('timjan');
    expect(withDriedPrefix('persilja', 'tsk')).toBe('persilja');
    expect(withDriedPrefix('timjan', 'msk')).toBe('timjan');
  });
});
