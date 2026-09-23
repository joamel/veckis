import { describe, it, expect } from 'vitest';
import { bottomGapFor } from './bottomGap';

describe('bottomGapFor', () => {
  it('lämnar designens avstånd ifred när ingen systemrad är i vägen', () => {
    // Svepnavigering utan handtag, eller webben.
    expect(bottomGapFor(20, 0)).toBe(20);
    // Svepnavigeringens handtag är lågt nog att rymmas i designens avstånd.
    expect(bottomGapFor(20, 12)).toBe(20);
  });

  it('lyfter över knappnavigeringens rad', () => {
    // De tre knapparna är ~48 dp — det var där "Spara ändringar" hamnade.
    expect(bottomGapFor(20, 48)).toBe(56);
  });

  it('klistrar aldrig det som ligger där mot raden', () => {
    expect(bottomGapFor(20, 24)).toBeGreaterThan(24);
  });
});
