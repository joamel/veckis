import { describe, it, expect, beforeEach } from 'vitest';
import { sparaUtkast, hamtaUtkast, slangUtkast, harUtkast } from './recipeDrafts';

const bas = {
  title: 'Pannkakor',
  description: '',
  instructions: '1. Vispa',
  imageUrl: '',
  servings: 4,
  tags: ['favorit'],
  ingredients: [{ name: 'Mjöl', quantity: '3', unit: 'dl' }],
};

describe('receptutkast', () => {
  beforeEach(() => { slangUtkast('r1'); slangUtkast('r2'); });

  it('sparar och hämtar tillbaka', () => {
    sparaUtkast('r1', bas);
    expect(hamtaUtkast('r1')).toMatchObject({ title: 'Pannkakor', instructions: '1. Vispa' });
  });

  it('håller isär recept', () => {
    sparaUtkast('r1', bas);
    expect(hamtaUtkast('r2')).toBeNull();
  });

  it('skriver över tidigare utkast för samma recept', () => {
    sparaUtkast('r1', bas);
    sparaUtkast('r1', { ...bas, title: 'Våfflor' });
    expect(hamtaUtkast('r1')?.title).toBe('Våfflor');
  });

  it('slängt utkast är borta', () => {
    sparaUtkast('r1', bas);
    slangUtkast('r1');
    expect(hamtaUtkast('r1')).toBeNull();
    expect(harUtkast('r1')).toBe(false);
  });

  it('tidsstämpeln sätts vid sparandet', () => {
    const före = Date.now();
    sparaUtkast('r1', bas);
    expect(hamtaUtkast('r1')!.sparadVid).toBeGreaterThanOrEqual(före);
  });

  it('okänt recept ger null, inte kastat fel', () => {
    expect(hamtaUtkast('finns-inte')).toBeNull();
  });
});
