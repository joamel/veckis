import { describe, expect, it } from 'vitest';
import { LIST_IKONER, listIkon } from './listIkoner';

describe('listIkoner', () => {
  it('alla koder ryms i backendens 8 tecken', () => {
    for (const { kod } of LIST_IKONER) expect(kod.length).toBeLessThanOrEqual(8);
  });

  it('koderna är unika och har samma prefix', () => {
    const koder = LIST_IKONER.map(i => i.kod);
    expect(new Set(koder).size).toBe(koder.length);
    for (const kod of koder) expect(kod.startsWith('i:')).toBe(true);
  });

  it('översätter en kod till sin ikon', () => {
    expect(listIkon('i:korg')).toBe('basket-outline');
    expect(listIkon('i:vagn')).toBe('cart-outline');
  });

  it('ger null för gammal emoji, okänd kod och tomt fält', () => {
    expect(listIkon('🛒')).toBeNull();
    expect(listIkon('i:okand')).toBeNull();
    expect(listIkon(null)).toBeNull();
    expect(listIkon(undefined)).toBeNull();
    expect(listIkon('')).toBeNull();
  });
});
