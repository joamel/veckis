import { afterEach, describe, expect, it } from 'vitest';
import { setCuratedOverrides } from './curatedOverrides';
import { categorizeIngredient, curatedSubCategory, explainCategory, kureratUndantag, legacyKeywordCategory } from './categorizeIngredient';
import { validateCuration } from './adminCuration';

afterEach(() => setCuratedOverrides([]));

describe('adminsidans handskrivna klassningar', () => {
  it('går före alla regler i koden, och förklaringen säger det', () => {
    expect(explainCategory('kakao')).toEqual({ category: 'canned_dry', source: 'underkategori' });
    setCuratedOverrides([{ name: 'Kakao', category: 'bread_bakery', subCategory: 'bakverk_kex' }]);
    expect(categorizeIngredient('kakao')).toBe('bread_bakery');
    expect(explainCategory('KAKAO')).toEqual({ category: 'bread_bakery', source: 'admin' });
    expect(kureratUndantag('kakao')).toBe('bread_bakery');
    expect(curatedSubCategory('kakao')).toBe('bakverk_kex');
  });

  it('en klassning utan underkategori behåller gissningen bara om den hör till kategorin', () => {
    setCuratedOverrides([{ name: 'halloumi', category: 'cheese', subCategory: null }, { name: 'kakao', category: 'bread_bakery', subCategory: null }]);
    expect(curatedSubCategory('halloumi')).toBe('matlagningsost');
    expect(curatedSubCategory('kakao')).toBeNull();
  });

  it('påverkar inte återskapandet av gamla gissningar', () => {
    setCuratedOverrides([{ name: 'kakao', category: 'cheese', subCategory: null }]);
    expect(legacyKeywordCategory('kakao')).toBe('bread_bakery');
  });

  it('förklarar varje regel', () => {
    expect(explainCategory('torkad timjan').source).toBe('torkad');
    expect(explainCategory('krossade tomater').source).toBe('undantag');
    expect(explainCategory('blorp').source).toBe('ingen');
  });
});

describe('validateCuration', () => {
  it('kräver att underkategorin hör till kategorin', () => {
    expect(validateCuration({ name: 'x', category: 'cheese', subCategory: 'matlagningsost' })).toBeNull();
    expect(validateCuration({ name: 'x', category: 'dairy_eggs', subCategory: 'matlagningsost' })).toMatch(/hör inte/);
    expect(validateCuration({ name: 'x', category: 'cheese', subCategory: 'påhittad' })).toMatch(/Okänd/);
    expect(validateCuration({ name: '  ', category: 'cheese', subCategory: null })).toMatch(/saknas/);
  });
});
