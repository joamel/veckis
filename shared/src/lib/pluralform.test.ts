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

  it('böjer förpackningsenheter', () => {
    // Enheten står i ett eget fält men är också ett substantiv: "2 flaskor".
    expect(visningsnamn('flaska', 2)).toBe('flaskor');
    expect(visningsnamn('burk', 3)).toBe('burkar');
    expect(visningsnamn('påse', 4)).toBe('påsar');
    expect(visningsnamn('paket', 2)).toBe('paket');
  });

  it('rör inte måttenheter', () => {
    // De böjs inte på svenska — "2 dl", inte "2 dlar".
    expect(visningsnamn('dl', 2)).toBe('dl');
    expect(visningsnamn('g', 500)).toBe('g');
    expect(visningsnamn('msk', 3)).toBe('msk');
    expect(visningsnamn('st', 5)).toBe('st');
  });

  it('behåller inledande versal', () => {
    expect(visningsnamn('Gurka', 2)).toBe('Gurkor');
  });
});
