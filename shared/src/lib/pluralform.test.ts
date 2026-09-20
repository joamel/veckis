import { describe, it, expect } from 'vitest';
import { visningsnamn } from './pluralform';

describe('visningsnamn', () => {
  it('böjer till plural när antalet är fler än ett', () => {
    expect(visningsnamn('gurka', 5)).toBe('gurkor');
    expect(visningsnamn('tomat', 3)).toBe('tomater');
    expect(visningsnamn('lök', 2)).toBe('lökar');
    expect(visningsnamn('morot', 4)).toBe('morötter');
  });

  it('behåller singular vid ett, noll eller okänt antal', () => {
    expect(visningsnamn('gurka', 1)).toBe('gurka');
    expect(visningsnamn('gurka', null)).toBe('gurka');
    expect(visningsnamn('gurka', undefined)).toBe('gurka');
  });

  it('klarar ord som ser likadana ut i plural', () => {
    expect(visningsnamn('ägg', 6)).toBe('ägg');
    expect(visningsnamn('päron', 2)).toBe('päron');
  });

  it('rör inte flerordsnamn', () => {
    // Adjektivet måste kongruera med huvudordet: "gul lök" → "gula lökar".
    // Att böja bara sista ordet hade gett "gul lökar".
    expect(visningsnamn('gul lök', 3)).toBe('gul lök');
    expect(visningsnamn('krossade tomater', 2)).toBe('krossade tomater');
  });

  it('lämnar okända namn orörda', () => {
    // Aldrig sämre än idag: utan träff visas namnet precis som förut.
    expect(visningsnamn('quornbitar', 3)).toBe('quornbitar');
  });

  it('behåller inledande versal', () => {
    expect(visningsnamn('Gurka', 2)).toBe('Gurkor');
  });
});
