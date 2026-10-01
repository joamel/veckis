import { describe, it, expect } from 'vitest';
import { effectiveStapleCategory, looksLikeGuess } from './stapleChoice';

describe('looksLikeGuess', () => {
  it('känner igen nyckelordsgissningen från när basvaran skapades', () => {
    // "kakao" börjar på "kaka" i brödregeln — prod: Bröd i fem hushåll.
    expect(looksLikeGuess('kakao', 'bread_bakery', null)).toBe(true);
    expect(looksLikeGuess('kaffe', 'beverages', null)).toBe(true);
  });

  it('känner igen en gissning som bara aliaset minns (klassaren har ändrats sedan)', () => {
    // tortillabröd var bröd före 2026-09-30; aliaset föddes med samma gissning.
    expect(looksLikeGuess('tortillabröd', 'bread_bakery', 'bread_bakery')).toBe(true);
  });

  it("'other' är aldrig ett val", () => {
    expect(looksLikeGuess('keso', 'other', null)).toBe(true);
  });

  it('en kategori som varken klassaren eller aliaset sa är ett val', () => {
    expect(looksLikeGuess('mjölk', 'frozen', 'dairy_eggs')).toBe(false);
    expect(looksLikeGuess('keso', 'dairy_eggs', null)).toBe(true); // lika med den nya klassaren
    expect(looksLikeGuess('blorp', 'frozen', null)).toBe(false);
  });
});

describe('effectiveStapleCategory', () => {
  it('visar valet, men den kurerade kategorin för en gissning', () => {
    expect(effectiveStapleCategory({ name: 'kakao', category: 'bread_bakery', categoryChosen: false })).toBe('canned_dry');
    expect(effectiveStapleCategory({ name: 'kakao', category: 'bread_bakery', categoryChosen: true })).toBe('bread_bakery');
    expect(effectiveStapleCategory({ name: 'kakao', category: 'bread_bakery', categoryChosen: null })).toBe('bread_bakery');
  });
});

describe('looksLikeGuess — äldre gissningar', () => {
  it('känner igen delsträngsklassarens gissningar från före 2026-09-19', () => {
    // "sidfläsk" innehåller "läsk".
    expect(looksLikeGuess('rimmat sidfläsk', 'beverages', null)).toBe(true);
  });

  it('en kategori som strider mot ett handskrivet undantag är en gissning', () => {
    expect(looksLikeGuess('krossade tomater', 'fruit_veg', null)).toBe(true);
    expect(looksLikeGuess('torkad timjan', 'fruit_veg', null)).toBe(true);
  });
});

describe('looksLikeGuess — utbrutna kategorier', () => {
  it('ost som ligger kvar under Mejeri från innan Ost blev egen kategori är en gissning', () => {
    expect(looksLikeGuess('halloumi', 'dairy_eggs', null)).toBe(true);
    expect(looksLikeGuess('fetaost', 'dairy_eggs', null)).toBe(true);
  });
});
