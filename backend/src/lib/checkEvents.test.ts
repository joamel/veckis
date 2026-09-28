import { describe, expect, it } from 'vitest';
import { checkTime, shopperKey } from './checkEvents';

const nu = new Date('2026-09-28T12:00:00Z');

describe('checkTime', () => {
  it('använder telefonens tidpunkt när den är rimlig', () => {
    expect(checkTime('2026-09-28T11:30:00Z', nu).toISOString()).toBe('2026-09-28T11:30:00.000Z');
  });

  it('godtar en bock som skickas dagar senare från offlinekön', () => {
    expect(checkTime('2026-09-25T09:00:00Z', nu).toISOString()).toBe('2026-09-25T09:00:00.000Z');
  });

  it('faller tillbaka på serverns tid när tidpunkten saknas eller är trasig', () => {
    expect(checkTime(undefined, nu)).toBe(nu);
    expect(checkTime('inte ett datum', nu)).toBe(nu);
  });

  it('godtar inte händelser i framtiden, eller urgamla', () => {
    expect(checkTime('2026-09-28T13:00:00Z', nu)).toBe(nu); // klockan går en timme före
    expect(checkTime('2026-08-01T12:00:00Z', nu)).toBe(nu); // över en vecka gammal
  });
});

describe('shopperKey', () => {
  it('är densamma för samma person i samma butik', () => {
    expect(shopperKey('user_1', 'store_a', 'hemligt')).toBe(shopperKey('user_1', 'store_a', 'hemligt'));
  });

  it('skiljer mellan personer och mellan butiker', () => {
    const k = shopperKey('user_1', 'store_a', 'hemligt');
    expect(shopperKey('user_2', 'store_a', 'hemligt')).not.toBe(k);
    expect(shopperKey('user_1', 'store_b', 'hemligt')).not.toBe(k);
  });

  it('går inte att räkna fram utan hemligheten', () => {
    expect(shopperKey('user_1', 'store_a', 'annan')).not.toBe(shopperKey('user_1', 'store_a', 'hemligt'));
  });

  it('innehåller inte användarens id', () => {
    expect(shopperKey('user_1', 'store_a', 'hemligt')).not.toContain('user_1');
  });
});
