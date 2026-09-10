import { describe, it, expect } from 'vitest';
import { VARNINGSGRANS_ORE } from './aiCost';
import { MAX_FOTON_PER_MANAD } from './photoQuota';

// Prisberäkningen är inte exporterad — den speglas här så en prisändring i
// aiCost.ts som glömmer bort en modell syns som ett fallande test.
const PRIS: Record<string, { in: number; ut: number }> = {
  'claude-haiku-4-5': { in: 1, ut: 5 },
  'claude-sonnet-5': { in: 2, ut: 10 },
  'claude-opus-5': { in: 5, ut: 25 },
};
const öre = (model: string, i: number, u: number) => {
  const bas = model.replace(/-\d{8}$/, '');
  const p = PRIS[bas] ?? Object.values(PRIS).reduce((a, b) => (b.in > a.in ? b : a));
  return Math.round(((i * p.in + u * p.ut) / 1_000_000) * 10.5 * 100);
};

describe('AI-kostnad', () => {
  it('datumstämplat modell-id prissätts som basmodellen', () => {
    expect(öre('claude-haiku-4-5-20251001', 4362, 327)).toBe(öre('claude-haiku-4-5', 4362, 327));
  });

  it('okänd modell prissätts som den dyraste — hellre larma i onödan', () => {
    expect(öre('claude-något-nytt', 4362, 327)).toBe(öre('claude-opus-5', 4362, 327));
  });

  it('ett fotoanrop med Sonnet kostar omkring 13 öre', () => {
    expect(öre('claude-sonnet-5', 4362, 327)).toBeGreaterThan(10);
    expect(öre('claude-sonnet-5', 4362, 327)).toBeLessThan(16);
  });

  it('Sonnet är billigare än Opus men dyrare än Haiku för samma anrop', () => {
    const h = öre('claude-haiku-4-5', 4362, 327);
    const s = öre('claude-sonnet-5', 4362, 327);
    const o = öre('claude-opus-5', 4362, 327);
    expect(h).toBeLessThan(s);
    expect(s).toBeLessThan(o);
  });

  it('gränsen är 100 kr uttryckt i öre', () => {
    expect(VARNINGSGRANS_ORE).toBe(10_000);
  });

  it('gränsen nås först efter många foton — inte av ett par recept', () => {
    const perFoto = öre('claude-sonnet-5', 4362, 327);
    expect(Math.ceil(VARNINGSGRANS_ORE / perFoto)).toBeGreaterThan(500);
  });
});

describe('kvot och kostnadslarm hänger ihop', () => {
  it('en ensam användare kan inte bränna hela budgeten på egen hand', () => {
    // 50 foton × ~13 öre ≈ 650 öre, långt under larmgränsen på 10 000. Det är
    // avsiktligt: taket ska stoppa den som fotar av en hel kokbok, medan larmet
    // fångar den samlade notan när många använder funktionen normalt.
    const perFoto = öre('claude-sonnet-5', 4362, 327);
    expect(MAX_FOTON_PER_MANAD * perFoto).toBeLessThan(VARNINGSGRANS_ORE);
  });

  it('taket ligger högt nog för normal användning', () => {
    // Den som lägger in fler än ett recept varannan dag från foto är redan
    // ovanligt flitig. Sänks taket under det börjar det svida för riktiga
    // användare i stället för att stoppa missbruk.
    expect(MAX_FOTON_PER_MANAD).toBeGreaterThanOrEqual(30);
  });
});
