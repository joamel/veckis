import { describe, it, expect } from 'vitest';
import { evaluateTipGate } from './tipGate';

const base = { welcomeReady: true, skipAll: false, activeTitle: null, queuedTitles: [], title: 'Tips A' };

describe('evaluateTipGate', () => {
  it('blockerar tills välkomstmodalen är klar', () => {
    expect(evaluateTipGate({ ...base, welcomeReady: false })).toBe('blocked');
  });

  it('blockerar när master kill-switch (skipAll) är på', () => {
    expect(evaluateTipGate({ ...base, skipAll: true })).toBe('blocked');
  });

  it('visar ett nytt tip när inget är aktivt', () => {
    expect(evaluateTipGate(base)).toBe('show');
  });

  it('dubblett när samma tip redan är aktivt', () => {
    expect(evaluateTipGate({ ...base, activeTitle: 'Tips A' })).toBe('duplicate');
  });

  it('dubblett när samma tip redan ligger i kön', () => {
    expect(evaluateTipGate({ ...base, activeTitle: 'Tips B', queuedTitles: ['Tips A'] })).toBe('duplicate');
  });

  it('visar (köar) ett annat tip när ett redan är aktivt', () => {
    expect(evaluateTipGate({ ...base, activeTitle: 'Tips B', queuedTitles: ['Tips C'] })).toBe('show');
  });

  it('blockering går före dubblett-kollen', () => {
    // Även om titeln redan är aktiv ska skipAll/welcome blockera först.
    expect(evaluateTipGate({ ...base, skipAll: true, activeTitle: 'Tips A' })).toBe('blocked');
  });
});
