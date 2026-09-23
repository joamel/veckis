import { describe, it, expect } from 'vitest';
import { normalizeUnit } from './unitSynonyms';

describe('normalizeUnit', () => {
  it('samlar förpackningens varianter', () => {
    expect(normalizeUnit('förpackning')).toBe('förp');
    expect(normalizeUnit('Förpackningar')).toBe('förp');
    expect(normalizeUnit('frp')).toBe('förp');
    expect(normalizeUnit('förp')).toBe('förp');
  });

  it('samlar paket och styck', () => {
    expect(normalizeUnit('paket')).toBe('pkt');
    expect(normalizeUnit('pkt')).toBe('pkt');
    expect(normalizeUnit('stycken')).toBe('st');
    expect(normalizeUnit('STYCK')).toBe('st');
    expect(normalizeUnit('st')).toBe('st');
  });

  it('böjer plural till singular', () => {
    expect(normalizeUnit('burkar')).toBe('burk');
    expect(normalizeUnit('flaskor')).toBe('flaska');
    expect(normalizeUnit('påsar')).toBe('påse');
    expect(normalizeUnit('klyftor')).toBe('klyfta');
  });

  it('kortar utskrivna mått', () => {
    expect(normalizeUnit('gram')).toBe('g');
    expect(normalizeUnit('gr')).toBe('g');
    expect(normalizeUnit('kilo')).toBe('kg');
    expect(normalizeUnit('liter')).toBe('l');
    expect(normalizeUnit('matsked')).toBe('msk');
    expect(normalizeUnit('teskedar')).toBe('tsk');
  });

  it('räknar inte om något', () => {
    // Bara stavning — kg förblir kg, inte 1000 g.
    expect(normalizeUnit('kg')).toBe('kg');
    expect(normalizeUnit('dl')).toBe('dl');
  });

  it('lämnar okända enheter i fred', () => {
    expect(normalizeUnit('knyte')).toBe('knyte');
    expect(normalizeUnit('  Skvätt ')).toBe('skvätt');
  });

  it('ger null för tomt', () => {
    expect(normalizeUnit(null)).toBeNull();
    expect(normalizeUnit('')).toBeNull();
    expect(normalizeUnit('   ')).toBeNull();
  });
});
