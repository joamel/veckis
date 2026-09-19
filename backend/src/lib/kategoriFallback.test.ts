import { describe, it, expect } from 'vitest';
import { känndKategori } from './normalizeIngredients';

describe('känndKategori — other är inte ett svar', () => {
  it('frågar klassaren när kategorin saknas eller är other', () => {
    // Just de här två namnen saknar underkategori i taxonomin, vilket är
    // varför de hamnade under Övrigt globalt: aliaset föddes som 'other' ur
    // ett importerat recept och vann sedan över klassaren vid varje tillägg.
    expect(känndKategori('other', 'avokado')).toBe('fruit_veg');
    expect(känndKategori('other', 'bacon')).toBe('meat_fish');
    expect(känndKategori(undefined, 'bröd')).toBe('bread_bakery');
  });

  it('respekterar en kategori som faktiskt säger något', () => {
    expect(känndKategori('dairy_eggs', 'avokado')).toBe('dairy_eggs');
  });

  it('ger other när ingen vet', () => {
    expect(känndKategori('other', 'blorp')).toBe('other');
  });
});
