import { describe, expect, it } from 'vitest';
import { basvaruskrivning } from './basvaruval';

// Klassarens gissning för "valnötter" — den som skrev över folks val.
const GISSNING = 'snacks_sweets' as const;

describe('basvaruskrivning', () => {
  describe('tillägg av en vara utan kategorival', () => {
    const r = basvaruskrivning({}, GISSNING);

    it('rör inte kategorin på en befintlig basvara', () => {
      expect(r.uppdatera.category).toBeUndefined();
    });

    it('rör inte subkategorin heller', () => {
      expect(r.uppdatera).not.toHaveProperty('subCategory');
    });

    it('flyttar inte varor som redan ligger i listan', () => {
      expect(r.fårFlyttaVaror).toBe(false);
    });

    it('men fyller en NY basvara med gissningen — där finns inget val att förstöra', () => {
      expect(r.skapa.category).toBe(GISSNING);
    });
  });

  describe('ett medvetet kategorival', () => {
    const r = basvaruskrivning({ category: 'canned_dry' }, GISSNING);

    it('skriver kategorin', () => {
      expect(r.uppdatera.category).toBe('canned_dry');
    });

    it('får flytta varor som redan ligger i listan', () => {
      expect(r.fårFlyttaVaror).toBe(true);
    });

    it('slår gissningen även på en ny basvara', () => {
      expect(r.skapa.category).toBe('canned_dry');
    });
  });

  describe("'other' räknas inte som ett val", () => {
    // Zod-defaulten gjorde varje tillägg till ett "val" av Övrigt, och det var
    // så gissningen fick fäste. Ett tomt svar är inte ett svar.
    const r = basvaruskrivning({ category: 'other' }, GISSNING);

    it('skriver inte över en befintlig kategori', () => {
      expect(r.uppdatera.category).toBeUndefined();
    });

    it('flyttar inte varor', () => {
      expect(r.fårFlyttaVaror).toBe(false);
    });

    it('en ny basvara får klassarens svar i stället för Övrigt', () => {
      expect(r.skapa.category).toBe(GISSNING);
    });
  });

  describe('subkategorin', () => {
    it('null är ett val — "den här varan hör inte under någon sub"', () => {
      const r = basvaruskrivning({ subCategory: null }, GISSNING);
      expect(r.valdeSub).toBe(true);
      expect(r.uppdatera.subCategory).toBeNull();
      expect(r.fårFlyttaVaror).toBe(true);
    });

    it('ett namn skrivs rakt av', () => {
      const r = basvaruskrivning({ subCategory: 'nötter_frön_torra' }, GISSNING);
      expect(r.uppdatera.subCategory).toBe('nötter_frön_torra');
    });

    it('utelämnad subkategori nollställer inte den som redan finns', () => {
      const r = basvaruskrivning({ category: 'canned_dry' }, GISSNING);
      expect(r.uppdatera).not.toHaveProperty('subCategory');
    });
  });

  it('valet överlever att varan läggs till igen', () => {
    // Hela buggen i ett test: välj kategori, lägg sedan till varan som appen
    // gör det — utan kategori. Det andra anropet fick inte röra det första.
    const val = basvaruskrivning({ category: 'canned_dry' }, GISSNING);
    const tillägg = basvaruskrivning({}, GISSNING);

    expect(val.uppdatera.category).toBe('canned_dry');
    expect(tillägg.uppdatera.category).toBeUndefined();
  });
});
