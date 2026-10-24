import { describe, expect, it } from 'vitest';
import { acceptableShortening, resemblesOriginal, troligtIntervall } from './cleanupJobs';

describe('städjobbens spärrar mot modellens förslag', () => {
  it('ett kortare namn måste likna originalet', () => {
    expect(resemblesOriginal('finrivet citronskal', 'citronskal')).toBe(true);
    expect(resemblesOriginal('färsk spenat', 'creme fraiche')).toBe(false);
  });

  it('godtar en kortning men inte en förväxling eller ett skräpnamn', () => {
    expect(acceptableShortening('finrivet citronskal', 'citronskal')).toBe(true);
    expect(acceptableShortening('färsk spenat', 'creme fraiche')).toBe(false);
    expect(acceptableShortening('citronskal', 'citronskal')).toBe(false);
  });
});

describe('troligtIntervall (missade mängder)', () => {
  it('känner igen intervall som blev decimaltal', () => {
    expect(troligtIntervall(1.2)).toEqual({ from: 1, to: 2 });
    expect(troligtIntervall(3.4)).toEqual({ from: 3, to: 4 });
    expect(troligtIntervall(8.9)).toEqual({ from: 8, to: 9 });
  });

  it('lämnar vanliga mängder i fred', () => {
    for (const q of [1, 1.5, 2.5, 4.5, 0.5, 1.25, 2.4, 9, 12.13, null]) expect(troligtIntervall(q), String(q)).toBeNull();
  });
});
