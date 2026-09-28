import { describe, expect, it } from 'vitest';
import { storeMeta } from './storeMeta';

describe('storeMeta', () => {
  it('visar orten och postadressen var för sig', () => {
    expect(storeMeta({ street: 'Sparrisgatan 3', postcode: '75446', city: 'Årsta, Uppsala', postalCity: 'Uppsala' }))
      .toEqual({ locality: 'Årsta, Uppsala', address: 'Sparrisgatan 3, 754 46 Uppsala' });
  });

  it('visar orten även när butiksnamnet redan säger den', () => {
    expect(storeMeta({ street: null, postcode: null, city: 'Årsta, Stockholm', postalCity: null }))
      .toEqual({ locality: 'Årsta, Stockholm', address: '' });
  });

  it('klarar halva adresser, och upprepar inte en postort som är samma som orten', () => {
    expect(storeMeta({ street: 'Rinkeby Torget 8', city: 'Spånga' }).address).toBe('Rinkeby Torget 8');
    expect(storeMeta({ postcode: '16373', city: 'Rinkeby, Stockholm', postalCity: 'Spånga' }).address).toBe('163 73 Spånga');
    expect(storeMeta({ city: 'Gustavsberg', postalCity: 'Gustavsberg' }).address).toBe('');
  });
});
