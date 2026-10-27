import { describe, it, expect } from 'vitest';
import { flyttaRubrik } from './flyttaRubrik';

const rader = (...sektioner: (string | null)[]) => sektioner.map((section, i) => ({ namn: `r${i}`, section }));
const sektioner = (r: { section: string | null }[]) => r.map(x => x.section);

describe('flyttaRubrik', () => {
  it('en ny rubrik (sist, med en tom rad) dras upp över ingredienserna utan rubrik', () => {
    const r = rader(null, null, null, 'Fyllning', 'Fyllning', 'Deg');
    expect(sektioner(flyttaRubrik(r, 5, 0))).toEqual(['Deg', 'Deg', 'Deg', 'Fyllning', 'Fyllning', 'Fyllning']);
  });

  it('flyttad uppåt: raderna nedanför till nästa rubrik får den', () => {
    const r = rader('Deg', 'Deg', 'Deg', 'Deg', 'Fyllning', 'Fyllning');
    expect(sektioner(flyttaRubrik(r, 4, 2))).toEqual(['Deg', 'Deg', 'Fyllning', 'Fyllning', 'Fyllning', 'Fyllning']);
  });

  it('flyttad nedåt inom sin egen grupp: raderna den lämnar går till gruppen ovanför', () => {
    const r = rader('Deg', 'Deg', 'Fyllning', 'Fyllning', 'Fyllning');
    expect(sektioner(flyttaRubrik(r, 2, 4))).toEqual(['Deg', 'Deg', 'Deg', 'Deg', 'Fyllning']);
  });

  it('överst utan något ovanför: raderna blir utan rubrik', () => {
    const r = rader('Deg', 'Deg', 'Fyllning');
    expect(sektioner(flyttaRubrik(r, 0, 1))).toEqual([null, 'Deg', 'Fyllning']);
  });

  it('rad utan rubrik, samma plats eller utanför listan: oförändrat', () => {
    const r = rader(null, 'Deg');
    expect(flyttaRubrik(r, 0, 1)).toBe(r);
    expect(flyttaRubrik(r, 1, 1)).toBe(r);
    expect(flyttaRubrik(r, 1, 5)).toBe(r);
  });
});
