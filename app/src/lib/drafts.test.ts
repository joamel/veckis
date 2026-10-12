import { afterEach, describe, it, expect, vi } from 'vitest';
import { clearAllDrafts, createDraftStore, DRAFT_MAX_AGE_MS, setDraftBackend, type DraftBackend } from './drafts';

describe('createDraftStore', () => {
  it('två lager delar inte data, även med samma nyckel', () => {
    // Recept "abc" och butik "abc" är olika saker. Fabriken ger varje vy ett
    // eget lager, så ett utkast i den ena kan aldrig dyka upp i den andra.
    const a = createDraftStore<{ v: number }>();
    const b = createDraftStore<{ v: number }>();
    a.spara('abc', { v: 1 });
    expect(b.hamta('abc')).toBeNull();
    expect(a.hamta('abc')?.v).toBe(1);
  });

  it('sätter tidsstämpel och skriver över vid nytt sparande', () => {
    const s = createDraftStore<{ v: number }>();
    const före = Date.now();
    s.spara('x', { v: 1 });
    s.spara('x', { v: 2 });
    const u = s.hamta('x')!;
    expect(u.v).toBe(2);
    expect(u.sparadVid).toBeGreaterThanOrEqual(före);
  });

  it('slängt utkast är borta', () => {
    const s = createDraftStore<{ v: number }>();
    s.spara('x', { v: 1 });
    s.slang('x');
    expect(s.har('x')).toBe(false);
    expect(s.hamta('x')).toBeNull();
  });

  it('sparar en kopia, inte en referens till anroparens objekt', () => {
    // Butiksvyn skickar in state-objekt; muteras de efteråt får utkastet inte
    // ändras i smyg.
    const s = createDraftStore<{ lista: string[] }>();
    const lista = ['a'];
    s.spara('x', { lista });
    const u = s.hamta('x')!;
    expect(u).not.toBe(lista);
    expect(u.lista).toEqual(['a']);
  });
});

describe('utkast som överlever omstart', () => {
  /** En disk i minnet: det som skrivs ligger kvar till nästa "körning". */
  function fakeDisk(initial: string | null = null): DraftBackend & { text: string | null } {
    const d = {
      text: initial,
      read: () => d.text,
      write: (t: string) => { d.text = t; },
    };
    return d;
  }

  afterEach(() => {
    vi.useRealTimers();
    setDraftBackend(null);
  });

  it('ett sparat utkast finns kvar i ett nytt lager efter omstart', () => {
    vi.useFakeTimers();
    const disk = fakeDisk();
    setDraftBackend(disk);
    createDraftStore<{ v: number }>('recept').spara('r1', { v: 7 });
    vi.runAllTimers(); // skrivningen sker fördröjt

    // "Omstart": nytt lager, samma disk.
    setDraftBackend(disk);
    expect(createDraftStore<{ v: number }>('recept').hamta('r1')?.v).toBe(7);
  });

  it('lagren hålls isär på disk', () => {
    vi.useFakeTimers();
    const disk = fakeDisk();
    setDraftBackend(disk);
    createDraftStore<{ v: number }>('recept').spara('x', { v: 1 });
    vi.runAllTimers();
    setDraftBackend(disk);
    expect(createDraftStore<{ v: number }>('butik').hamta('x')).toBeNull();
  });

  it('slängda och för gamla utkast kommer inte tillbaka', () => {
    vi.useFakeTimers();
    const gammal = Date.now() - DRAFT_MAX_AGE_MS - 1000;
    const disk = fakeDisk(JSON.stringify({ recept: { old: { v: 1, sparadVid: gammal }, ny: { v: 2, sparadVid: Date.now() } } }));
    setDraftBackend(disk);
    const s = createDraftStore<{ v: number }>('recept');
    expect(s.har('old')).toBe(false);
    s.slang('ny');
    vi.runAllTimers();
    setDraftBackend(disk);
    expect(createDraftStore<{ v: number }>('recept').har('ny')).toBe(false);
  });

  it('en trasig fil ger tomma utkast, ingen krasch', () => {
    setDraftBackend(fakeDisk('{inte json'));
    expect(createDraftStore<{ v: number }>('recept').hamta('r1')).toBeNull();
  });

  it('utloggning tömmer både minnet och disken', () => {
    vi.useFakeTimers();
    const disk = fakeDisk();
    setDraftBackend(disk);
    const s = createDraftStore<{ v: number }>('recept');
    s.spara('r1', { v: 1 });
    clearAllDrafts();
    expect(s.har('r1')).toBe(false);
    vi.runAllTimers();
    setDraftBackend(disk);
    expect(createDraftStore<{ v: number }>('recept').har('r1')).toBe(false);
  });
});
