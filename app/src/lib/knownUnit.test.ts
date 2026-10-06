import { describe, expect, it } from 'vitest';
import { knownUnitFor } from './knownUnit';

const units = { 'gul lök': 'st', mjölk: 'dl' };

describe('knownUnitFor', () => {
  it('hittar enheten oavsett versaler och extra mellanslag', () => {
    expect(knownUnitFor(units, 'Gul  lök ')).toBe('st');
    expect(knownUnitFor(units, 'mjölk')).toBe('dl');
  });

  it('bara exakt namn — en början av ett namn räcker inte', () => {
    expect(knownUnitFor(units, 'gul')).toBeNull();
    expect(knownUnitFor(units, '')).toBeNull();
  });
});
