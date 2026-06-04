import { describe, it, expect, beforeEach } from 'vitest';
import { checkWsRateLimit, __testing } from './wsRateLimit';

describe('checkWsRateLimit', () => {
  beforeEach(() => {
    __testing.clear();
  });

  it('släpper igenom första anslutningen', () => {
    expect(checkWsRateLimit('1.2.3.4')).toBe(true);
  });

  it('släpper igenom under gränsen', () => {
    for (let i = 0; i < __testing.maxPerWindow; i++) {
      expect(checkWsRateLimit('1.2.3.4')).toBe(true);
    }
  });

  it('blockerar när gränsen nås', () => {
    for (let i = 0; i < __testing.maxPerWindow; i++) checkWsRateLimit('1.2.3.4');
    expect(checkWsRateLimit('1.2.3.4')).toBe(false);
    expect(checkWsRateLimit('1.2.3.4')).toBe(false);
  });

  it('räknar separat per IP', () => {
    for (let i = 0; i < __testing.maxPerWindow; i++) checkWsRateLimit('1.2.3.4');
    expect(checkWsRateLimit('1.2.3.4')).toBe(false);
    // Annan IP får börja från noll
    expect(checkWsRateLimit('5.6.7.8')).toBe(true);
  });
});
