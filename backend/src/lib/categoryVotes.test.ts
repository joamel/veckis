import { describe, it, expect } from 'vitest';
import { categoryVotes, curatedAnswer, type StapleChoice } from './categoryVotes';

const staple = (householdId: string, name: string, category: string, subCategory: string | null = null): StapleChoice =>
  ({ householdId, name, category, subCategory });

describe('curatedAnswer', () => {
  it('följer samma kedja som ett tillägg: undantag, underkategorins kategori, klassaren', () => {
    expect(curatedAnswer('kaffefilter')).toEqual({ category: 'canned_dry', subCategory: 'kaffe_te' });
    expect(curatedAnswer('halloumi')).toEqual({ category: 'cheese', subCategory: 'matlagningsost' });
    expect(curatedAnswer('avokado').category).toBe('fruit_veg');
  });
});

describe('categoryVotes', () => {
  it('räknar hushåll som valt en annan kategori eller underkategori än klassaren', () => {
    const rows = categoryVotes([
      staple('a', 'Halloumi', 'cheese', 'delikatessost'),
      staple('b', 'halloumi', 'cheese', 'delikatessost'),
      staple('c', 'halloumi', 'cheese'),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'halloumi', households: 3, disagreeing: 2 });
    expect(rows[0].subCategories).toEqual([{ subCategory: 'delikatessost', households: 2 }]);
  });

  it('tar inte med varor där alla håller med klassaren', () => {
    expect(categoryVotes([staple('a', 'mjölk', 'dairy_eggs'), staple('b', 'mjölk', 'dairy_eggs', 'mjölk')])).toEqual([]);
  });

  it("'other' är inget val och räknas inte som oenighet", () => {
    expect(categoryVotes([staple('a', 'mjölk', 'other')])).toEqual([]);
  });

  it('sorterar flest oense först och kan kräva ett minsta antal', () => {
    const staples = [
      staple('a', 'mjölk', 'beverages'),
      staple('a', 'lingon', 'fruit_veg'),
      staple('b', 'lingon', 'fruit_veg'),
    ];
    expect(categoryVotes(staples).map(r => r.name)).toEqual(['lingon', 'mjölk']);
    expect(categoryVotes(staples, 2).map(r => r.name)).toEqual(['lingon']);
  });
});
