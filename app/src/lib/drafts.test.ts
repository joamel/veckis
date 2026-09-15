import { describe, it, expect } from 'vitest';
import { createDraftStore } from './drafts';

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
