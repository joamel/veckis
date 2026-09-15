import { describe, expect, it } from 'vitest';
import { idHash, platshallare } from './receptPlatshallare';

const ikon = (titel: string) => platshallare('x', titel).ikon;

describe('platshallare', () => {
  it('väljer ikon efter vad rätten är', () => {
    expect(ikon('Ugnsbakad lax med dill')).toBe('fish-outline');
    expect(ikon('Kycklingpizza')).toBe('pizza-outline');
    expect(ikon('Tomatsoppa')).toBe('flame-outline');
    expect(ikon('Grekisk sallad')).toBe('leaf-outline');
    expect(ikon('Amerikanska pannkakor')).toBe('egg-outline');
    expect(ikon('Fredagstacos')).toBe('fast-food-outline');
    expect(ikon('Kladdkaka')).toBe('ice-cream-outline');
  });

  it('första regeln vinner i sammansättningar', () => {
    expect(ikon('Fiskgryta')).toBe('fish-outline');
  });

  it('tar inte "ägg" ur ord som bara innehåller det', () => {
    expect(ikon('Lägg på grillen')).toBe('restaurant-outline');
    expect(ikon('Kokt ägg')).toBe('egg-outline');
    expect(ikon('Äggröra')).toBe('egg-outline');
  });

  it('läser taggar lika väl som titel', () => {
    expect(ikon('Mormors favorit vegetariskt')).toBe('leaf-outline');
  });

  it('faller tillbaka på tallrik och bestick', () => {
    expect(ikon('Mormors köttbullar')).toBe('restaurant-outline');
  });

  it('ger samma ton för samma recept, och båda tonerna förekommer', () => {
    expect(platshallare('abc', '').ton).toBe(platshallare('abc', 'annan titel').ton);
    const toner = new Set(Array.from({ length: 30 }, (_, i) => platshallare(`recept-${i}`, '').ton));
    expect(toner).toEqual(new Set(['ljus', 'mork']));
  });

  it('idHash är stabil och icke-negativ', () => {
    expect(idHash('cm123')).toBe(idHash('cm123'));
    expect(idHash('zzzzzzzzzzzzzzzzzzzzzzzz')).toBeGreaterThanOrEqual(0);
  });
});
