import { describe, it, expect, vi } from 'vitest';
import { matchaImportnamn, kanoniseringDuger, bevararSkyddadeOrd } from './importMatchning';
import type { TolkadVara } from './inkopstext';

const vara = (name: string, quantity: number | null = null, unit: string | null = null): TolkadVara =>
  ({ name, quantity, unit });

const BASVAROR = ['mjölk', 'mozzarella', 'crème fraiche', 'köttbullar', 'gul lök', 'rödlök', 'tandborste'];

/** Låtsas-AI: inga riktiga anrop i testerna. */
const kanonisera = (karta: Record<string, string> = {}) =>
  vi.fn(async (namn: string[]) => namn.map(n => karta[n] ?? n));

describe('kanoniseringDuger', () => {
  it('stoppar sammansättningar som är egna varor', () => {
    expect(kanoniseringDuger('kanelstänger', 'kanel')).toBe(false);
    expect(kanoniseringDuger('halloumispett', 'halloumi')).toBe(false);
    expect(kanoniseringDuger('fläskfiléspett', 'fläsk')).toBe(false);
    expect(kanoniseringDuger('kycklingspett', 'kyckling')).toBe(false);
  });

  it('stoppar omstavningar av enordsnamn', () => {
    expect(kanoniseringDuger('noelbröd', 'nöelbröd')).toBe(false);
    expect(kanoniseringDuger('kalkonchorizo', 'kalkonkorv')).toBe(false);
  });

  it('släpper igenom plural till singular', () => {
    expect(kanoniseringDuger('tomater', 'tomat')).toBe(true);
    expect(kanoniseringDuger('satsumas', 'satsuma')).toBe(true);
    expect(kanoniseringDuger('gurkor', 'gurka')).toBe(false); // inte prefix — lämnas
  });

  it('låter flerordsnamn kanoniseras fritt', () => {
    expect(kanoniseringDuger('arla standardmjölk', 'mjölk')).toBe(true);
    expect(kanoniseringDuger('tandkräm jordan kids', 'tandkräm')).toBe(true);
    expect(kanoniseringDuger('körsbärstomater eko', 'körsbärstomater')).toBe(true);
  });
});

describe('bevararSkyddadeOrd', () => {
  it('stoppar matchningar som tappar hyllan', () => {
    expect(bevararSkyddadeOrd('Lingon frysta', 'lingon')).toBe(false);
    expect(bevararSkyddadeOrd('Soja glutenfri', 'soja')).toBe(false);
    expect(bevararSkyddadeOrd('Grillad kyckling', 'kyckling')).toBe(false);
    expect(bevararSkyddadeOrd('Ginger joe alkoholfri', 'ginger joe')).toBe(false);
    expect(bevararSkyddadeOrd('Torkad timjan', 'timjan')).toBe(false);
  });

  it('släpper igenom när ordet finns kvar', () => {
    expect(bevararSkyddadeOrd('Frysta hallon', 'frysta hallon')).toBe(true);
    expect(bevararSkyddadeOrd('Köttbullar glutenfria', 'glutenfria köttbullar')).toBe(true);
  });

  it('rör inte varor utan skyddade ord', () => {
    expect(bevararSkyddadeOrd('Svartpeppar malen', 'svartpeppar')).toBe(true);
    expect(bevararSkyddadeOrd('Kanel, malen', 'kanel')).toBe(true);
    expect(bevararSkyddadeOrd('Arla standardmjölk', 'mjölk')).toBe(true);
  });
});

describe('matchaImportnamn', () => {
  it('hittar hushållets egen stavning och rör inte AI:n för den', async () => {
    const ai = kanonisera();
    const [v] = await matchaImportnamn([vara('Mozarella')], BASVAROR, ai);
    expect(v.name).toBe('mozzarella');
    expect(v.original).toBe('Mozarella');
    expect(v.källa).toBe('basvara');
    expect(ai).not.toHaveBeenCalled();
  });

  it('kanoniserar det som inte finns hos hushållet', async () => {
    const ai = kanonisera({ 'arla standardmjölk': 'mjölk' });
    const [v] = await matchaImportnamn([vara('Arla standardmjölk')], [], ai);
    expect(v.name).toBe('mjölk');
    expect(v.källa).toBe('kanonisering');
  });

  it('låter kanoniseringen landa i en befintlig basvara', async () => {
    const ai = kanonisera({ 'arla standardmjölk': 'mjölk' });
    const [v] = await matchaImportnamn([vara('Arla standardmjölk')], BASVAROR, ai);
    expect(v.name).toBe('mjölk');
    expect(v.källa).toBe('basvara');
  });

  it('lämnar okända varor som de är', async () => {
    const ai = kanonisera();
    const [v] = await matchaImportnamn([vara('Waterwipes')], BASVAROR, ai);
    expect(v.name).toBe('waterwipes');
    // Bara gemener skiljer → ingen ändring att visa i granskningen.
    expect(v.original).toBeNull();
    expect(v.källa).toBeNull();
  });

  it('säger inte att något ändrats när bara versalerna skiljer', async () => {
    const ai = kanonisera();
    const [v] = await matchaImportnamn([vara('Mjölk')], BASVAROR, ai);
    expect(v.name).toBe('mjölk');
    expect(v.original).toBeNull();
    expect(v.källa).toBeNull();
  });

  it('blandar aldrig ihop lökarna', async () => {
    const ai = kanonisera();
    const [gul, röd] = await matchaImportnamn([vara('Gul lök'), vara('Rödlök')], BASVAROR, ai);
    expect(gul.name).toBe('gul lök');
    expect(röd.name).toBe('rödlök');
  });

  it('behåller mängd och enhet', async () => {
    const ai = kanonisera();
    const [v] = await matchaImportnamn([vara('Mozarella', 2, 'st')], BASVAROR, ai);
    expect(v.quantity).toBe(2);
    expect(v.unit).toBe('st');
  });

  it('frågar AI:n en gång för hela importen', async () => {
    const ai = kanonisera();
    await matchaImportnamn([vara('Waterwipes'), vara('Blöjor'), vara('Napp')], BASVAROR, ai);
    expect(ai).toHaveBeenCalledTimes(1);
    expect(ai.mock.calls[0][0]).toHaveLength(3);
  });
});
