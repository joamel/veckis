import { describe, expect, it } from 'vitest';
import { isReviewAccount } from './reviewAccount';

describe('isReviewAccount', () => {
  it('är avstängd när variabeln saknas eller är tom', () => {
    expect(isReviewAccount('granskare@example.com', undefined)).toBe(false);
    expect(isReviewAccount('granskare@example.com', '')).toBe(false);
    expect(isReviewAccount('granskare@example.com', '   ')).toBe(false);
  });

  it('gäller bara exakt den konfigurerade adressen', () => {
    expect(isReviewAccount('granskare@example.com', 'granskare@example.com')).toBe(true);
    expect(isReviewAccount('annan@example.com', 'granskare@example.com')).toBe(false);
    // Ett plus-alias är en annan adress, inte samma konto.
    expect(isReviewAccount('granskare+x@example.com', 'granskare@example.com')).toBe(false);
  });

  it('bryr sig inte om versaler och blanksteg runt adressen', () => {
    expect(isReviewAccount('  Granskare@Example.com ', 'granskare@example.com')).toBe(true);
    expect(isReviewAccount('granskare@example.com', ' GRANSKARE@example.com ')).toBe(true);
  });
});
