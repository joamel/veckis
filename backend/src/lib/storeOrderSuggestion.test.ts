import { describe, expect, it } from 'vitest';
import { sectionKeyFor, splitTrips, suggestStoreOrder, type CheckEventLike } from './storeOrderSuggestion';

const now = new Date('2026-09-29T12:00:00Z');
const min = 60_000;
/** En handling: sektioner i bockordning, en minut isär, med start `daysAgo` dagar sedan. */
function trip(shopper: string, daysAgo: number, sections: string[]): CheckEventLike[] {
  const start = now.getTime() - daysAgo * 86_400_000;
  return sections.map((section, i) => ({ shopperKey: shopper, checkedAt: new Date(start + i * min), bulk: false, section }));
}

const current = ['fruit_veg', 'dairy_eggs', 'meat_fish', 'canned_dry'];

describe('splitTrips', () => {
  it('delar vid mer än 45 minuters tystnad och per person, och hoppar över massbockar', () => {
    const events = [
      ...trip('a', 2, ['fruit_veg', 'dairy_eggs']),
      ...trip('a', 1, ['fruit_veg']),
      ...trip('b', 2, ['meat_fish']),
      { shopperKey: 'a', checkedAt: new Date(now.getTime() - 2 * 86_400_000 + 5 * min), bulk: true, section: 'canned_dry' },
    ];
    const trips = splitTrips(events);
    expect(trips).toHaveLength(3);
    expect(trips.flat().some(e => e.bulk)).toBe(false);
  });
});

describe('suggestStoreOrder', () => {
  it('föreslår inget förrän det finns tre handlingar', () => {
    const events = [...trip('a', 3, ['meat_fish', 'fruit_veg']), ...trip('a', 2, ['meat_fish', 'fruit_veg'])];
    expect(suggestStoreOrder(events, current, now)).toMatchObject({ trips: 2, changed: false, order: current });
  });

  it('sorterar om efter hur man går, och låter sektioner utan data stå kvar på sin plats', () => {
    // Man går kött → frukt → mejeri, men listan säger frukt → mejeri → kött.
    const events = [1, 2, 3].flatMap(d => trip('a', d, ['meat_fish', 'fruit_veg', 'dairy_eggs']));
    const s = suggestStoreOrder(events, current, now);
    expect(s.changed).toBe(true);
    // canned_dry har ingen data och står kvar sist.
    expect(s.order).toEqual(['meat_fish', 'fruit_veg', 'dairy_eggs', 'canned_dry']);
  });

  it('nyare handlingar väger tyngre', () => {
    const gamla = [60, 61, 62].flatMap(d => trip('a', d, ['dairy_eggs', 'fruit_veg']));
    const nya = [1, 2].flatMap(d => trip('a', d, ['fruit_veg', 'dairy_eggs']));
    const s = suggestStoreOrder([...gamla, ...nya], ['dairy_eggs', 'fruit_veg'], now);
    expect(s.order).toEqual(['fruit_veg', 'dairy_eggs']);
  });

  it('en sektion som bara setts en gång flyttas inte', () => {
    const events = [
      ...[1, 2, 3].flatMap(d => trip('a', d, ['dairy_eggs', 'fruit_veg'])),
      ...trip('a', 4, ['canned_dry', 'dairy_eggs']),
    ];
    const s = suggestStoreOrder(events, current, now);
    expect(s.order.indexOf('canned_dry')).toBe(3);
  });

  it('ger changed: false när man redan går i listans ordning', () => {
    const events = [1, 2, 3].flatMap(d => trip('a', d, current));
    expect(suggestStoreOrder(events, current, now).changed).toBe(false);
  });
});

describe('sectionKeyFor', () => {
  const store = { parentOrder: ['dairy_eggs', 's:pasta_nudlar', 'canned_dry', 'c:Barn', 'cs:canned_dry:Bebis'], categoryMerge: { snacks_sweets: 'canned_dry' } };
  const e = (x: Partial<{ category: string; subCategory: string | null; customCategory: string | null; customSubCategory: string | null }>) =>
    ({ category: 'other', subCategory: null, customCategory: null, customSubCategory: null, ...x });

  it('följer butikens fria placering, egna kategorier och ihopslagning', () => {
    expect(sectionKeyFor(e({ category: 'canned_dry', subCategory: 'pasta_nudlar' }), store)).toBe('s:pasta_nudlar');
    expect(sectionKeyFor(e({ category: 'canned_dry', subCategory: 'konserver' }), store)).toBe('canned_dry');
    expect(sectionKeyFor(e({ category: 'other', customCategory: 'Barn' }), store)).toBe('c:Barn');
    expect(sectionKeyFor(e({ category: 'canned_dry', customSubCategory: 'Bebis' }), store)).toBe('cs:canned_dry:Bebis');
    expect(sectionKeyFor(e({ category: 'snacks_sweets' }), store)).toBe('canned_dry');
  });
});
