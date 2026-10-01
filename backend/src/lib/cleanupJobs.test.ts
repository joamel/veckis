import { describe, expect, it } from 'vitest';
import { acceptableShortening, resemblesOriginal } from './cleanupJobs';

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
