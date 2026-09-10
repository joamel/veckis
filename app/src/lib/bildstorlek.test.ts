import { describe, it, expect } from 'vitest';
import { passaInom } from './bildstorlek';

describe('passaInom', () => {
  it('stående bild begränsas på höjden', () => {
    expect(passaInom(3000, 4000, 1568)).toEqual({ height: 1568 });
  });

  it('liggande bild begränsas på bredden', () => {
    expect(passaInom(4000, 3000, 1568)).toEqual({ width: 1568 });
  });

  it('kvadratisk bild räknas som liggande — bredden styr', () => {
    expect(passaInom(2000, 2000, 1568)).toEqual({ width: 1568 });
  });

  it('bild som redan får plats skalas inte upp', () => {
    expect(passaInom(800, 600, 1568)).toEqual({ width: 800 });
    expect(passaInom(600, 800, 1568)).toEqual({ height: 800 });
  });

  it('bild exakt på gränsen lämnas orörd', () => {
    expect(passaInom(1568, 1000, 1568)).toEqual({ width: 1568 });
  });

  it('extremt avlång bild begränsas på sin längsta sida', () => {
    expect(passaInom(400, 6000, 1568)).toEqual({ height: 1568 });
  });
});
