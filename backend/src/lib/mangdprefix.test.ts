import { describe, it, expect } from 'vitest';
import { stadaMangdprefix } from './mangdprefix';

describe('stadaMangdprefix', () => {
  it('lyfter bort mängd och enhet ur namnet', () => {
    expect(stadaMangdprefix('1/2 dl strösocker')).toEqual({ åtgärd: 'byt', till: 'strösocker' });
    expect(stadaMangdprefix('kg potatis')).toEqual({ åtgärd: 'byt', till: 'potatis' });
    expect(stadaMangdprefix('port ris')).toEqual({ åtgärd: 'byt', till: 'ris' });
    expect(stadaMangdprefix('msk garam masala')).toEqual({ åtgärd: 'byt', till: 'garam masala' });
  });

  it('raderar namn som bara är en mängd', () => {
    expect(stadaMangdprefix('1/2 dl')).toMatchObject({ åtgärd: 'radera' });
    expect(stadaMangdprefix('förp')).toMatchObject({ åtgärd: 'radera' });
    expect(stadaMangdprefix('')).toMatchObject({ åtgärd: 'radera' });
  });

  it('rör inte riktiga varunamn', () => {
    expect(stadaMangdprefix('strösocker')).toEqual({ åtgärd: 'behåll' });
    expect(stadaMangdprefix('krossade tomater')).toEqual({ åtgärd: 'behåll' });
    expect(stadaMangdprefix('torkad dragon')).toEqual({ åtgärd: 'behåll' });
    expect(stadaMangdprefix('creme fraiche')).toEqual({ åtgärd: 'behåll' });
  });

  it('rör inte varor vars namn bara INNEHÅLLER en enhet', () => {
    // Börjar inte med enheten → lämnas i fred.
    expect(stadaMangdprefix('mjölk 2 l')).toEqual({ åtgärd: 'behåll' });
    expect(stadaMangdprefix('glass 1 liter')).toEqual({ åtgärd: 'behåll' });
  });
});
