import { describe, it, expect } from 'vitest';
import { browserCategories, browserSubs, browserSections, browserTiles, headingSubs } from './browserOrder';

describe('browserCategories', () => {
  it('följer butikens ordning och lägger resten sist', () => {
    const cats = browserCategories(['dairy_eggs', 'fruit_veg']);
    expect(cats.slice(0, 2)).toEqual(['dairy_eggs', 'fruit_veg']);
    expect(new Set(cats).size).toBe(cats.length);
    expect(cats).toContain('canned_dry');
  });

  it('hoppar över okända nycklar', () => {
    expect(browserCategories(['s:taco_texmex', 'canned_dry'])[0]).toBe('canned_dry');
  });
});

describe('browserSubs', () => {
  it('sorterar dolda efter subOrder och lägger utbrutna sist', () => {
    const subs = browserSubs('canned_dry', ['kaffe_te'], ['taco_texmex', 'pasta_nudlar']);
    expect(subs.slice(0, 2)).toEqual(['taco_texmex', 'pasta_nudlar']);
    expect(subs[subs.length - 1]).toBe('kaffe_te');
  });

  it('har taco tidigt i standardordningen', () => {
    const subs = browserSubs('canned_dry', [], []);
    expect(subs.indexOf('taco_texmex')).toBeLessThan(subs.indexOf('konserver'));
  });
});

describe('browserSections', () => {
  it('grupperar per underkategori i given ordning, utan sub sist', () => {
    const sections = browserSections(
      [{ name: 'penne' }, { name: 'tacokrydda' }, { name: 'okänd grej' }, { name: 'tacoskal', usageCount: 3 }],
      ['taco_texmex', 'pasta_nudlar'],
    );
    expect(sections.map(s => s.sub)).toEqual(['taco_texmex', 'pasta_nudlar', null]);
    expect(sections[0].items.map(i => i.name)).toEqual(['tacoskal', 'tacokrydda']);
  });

  it('hushållets valda underkategori vinner över gissningen', () => {
    const sections = browserSections([{ name: 'salsa', subCategory: 'sås_dressing' }], ['taco_texmex', 'sås_dressing']);
    expect(sections[0].sub).toBe('sås_dressing');
  });
});

describe('browserTiles', () => {
  it('följer butikens ordning med egna rubriker som har innehåll', () => {
    const po = ['dairy_eggs', 'c:Frukost', 's:flingor_müsli', 'c:Tom', 'canned_dry'];
    const tiles = browserTiles(po, ['dairy_eggs', 'canned_dry']);
    expect(tiles.slice(0, 3)).toEqual(['dairy_eggs', 'c:Frukost', 'canned_dry']);
    expect(tiles).not.toContain('c:Tom');
    expect(headingSubs('c:Frukost', po)).toEqual(['flingor_müsli']);
  });

  it('en ihopslagen kategori visas inte för sig, men gör målrubriken synlig', () => {
    const tiles = browserTiles(['c:Barn', 'baby_kids', 'dairy_eggs'], [], { baby_kids: 'c:Barn' });
    expect(tiles).toContain('c:Barn');
    expect(tiles).not.toContain('baby_kids');
  });
});
