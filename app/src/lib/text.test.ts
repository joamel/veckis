import { describe, it, expect } from 'vitest';
import { capitalize } from './text';

describe('capitalize', () => {
  it('versaliserar första bokstaven i ett enkelt ord', () => {
    expect(capitalize('hej')).toBe('Hej');
  });

  it('lämnar resten av strängen oförändrad', () => {
    expect(capitalize('hELLO wORLD')).toBe('HELLO wORLD');
  });

  it('hanterar tomma strängen', () => {
    expect(capitalize('')).toBe('');
  });

  it('hanterar null + undefined', () => {
    expect(capitalize(null)).toBe('');
    expect(capitalize(undefined)).toBe('');
  });

  it('hanterar svenska tecken', () => {
    expect(capitalize('åsa')).toBe('Åsa');
    expect(capitalize('öl')).toBe('Öl');
    expect(capitalize('ägg')).toBe('Ägg');
  });

  it('hanterar redan versaliserad', () => {
    expect(capitalize('Hej')).toBe('Hej');
  });

  it('hanterar enstaka tecken', () => {
    expect(capitalize('a')).toBe('A');
  });
});
