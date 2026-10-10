import { describe, expect, it } from 'vitest';
import { learnInnerOrder, sectionKeyFor, splitTrips, suggestStoreOrder, type CheckEventLike, type InnerEventLike, eventsForSuggestion } from './storeOrderSuggestion';

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
  it('föreslår inget förrän det finns fyra handlingar', () => {
    const events = [1, 2, 3].flatMap(d => trip('a', d, ['meat_fish', 'fruit_veg']));
    expect(suggestStoreOrder(events, current, now)).toMatchObject({ trips: 3, changed: false, order: current });
  });

  it('sorterar om efter hur man går, och låter sektioner utan data stå kvar på sin plats', () => {
    // Man går kött → frukt → mejeri, men listan säger frukt → mejeri → kött.
    const events = [1, 2, 3, 4].flatMap(d => trip('a', d, ['meat_fish', 'fruit_veg', 'dairy_eggs']));
    const s = suggestStoreOrder(events, current, now);
    expect(s.changed).toBe(true);
    // canned_dry har ingen data och står kvar sist.
    expect(s.order).toEqual(['meat_fish', 'fruit_veg', 'dairy_eggs', 'canned_dry']);
    // Bara köttet flyttas — resten behåller sin inbördes ordning.
    expect(s.moves).toEqual([{ key: 'meat_fish', after: null }]);
  });

  it('nyare handlingar väger tyngre', () => {
    const gamla = [60, 61, 62].flatMap(d => trip('a', d, ['dairy_eggs', 'fruit_veg']));
    const nya = [1, 2, 3, 4].flatMap(d => trip('a', d, ['fruit_veg', 'dairy_eggs']));
    const s = suggestStoreOrder([...gamla, ...nya], ['dairy_eggs', 'fruit_veg'], now);
    expect(s.order).toEqual(['fruit_veg', 'dairy_eggs']);
  });

  it('en splittrad bild flyttar ingenting', () => {
    // 3 mot 2 är ingen bevisning — det krävs 80 % åt samma håll.
    const events = [
      ...[1, 2, 3].flatMap(d => trip('a', d, ['dairy_eggs', 'fruit_veg'])),
      ...[4, 5].flatMap(d => trip('a', d, ['fruit_veg', 'dairy_eggs'])),
    ];
    expect(suggestStoreOrder(events, ['fruit_veg', 'dairy_eggs'], now).changed).toBe(false);
  });

  it('ett par som setts tillsammans för få gånger flyttas inte', () => {
    const events = [
      ...[1, 2, 3, 4].flatMap(d => trip('a', d, ['dairy_eggs', 'fruit_veg'])),
      ...[5, 6].flatMap(d => trip('a', d, ['canned_dry', 'dairy_eggs'])),
    ];
    const s = suggestStoreOrder(events, current, now);
    expect(s.order.indexOf('canned_dry')).toBe(3);
  });

  it('en sektion som står på två ställen flyttas aldrig', () => {
    // Glutenfritt: ibland direkt efter frukten (torra hyllan), ibland efter
    // mejeriet (frysen). Ordningen mellan frukt, mejeri och kött är stabil.
    const order = ['fruit_veg', 'special_diet', 'dairy_eggs', 'meat_fish'];
    const events = [
      ...[1, 2, 3].flatMap(d => trip('a', d, ['fruit_veg', 'special_diet', 'dairy_eggs', 'meat_fish'])),
      ...[4, 5, 6].flatMap(d => trip('a', d, ['fruit_veg', 'dairy_eggs', 'meat_fish', 'special_diet'])),
    ];
    const s = suggestStoreOrder(events, order, now);
    expect(s.changed).toBe(false);
    expect(s.order).toEqual(order);
  });

  it('bockar i efterhand (en skur över många sektioner) räknas inte', () => {
    // Fyra handlingar där allt bockades vid kassan på några sekunder, i
    // omvänd ordning — ska inte vända listan.
    const kassan = (daysAgo: number) => {
      const start = now.getTime() - daysAgo * 86_400_000;
      return ['canned_dry', 'meat_fish', 'dairy_eggs', 'fruit_veg']
        .map((section, i) => ({ shopperKey: 'a', checkedAt: new Date(start + i * 1000), bulk: false, section }));
    };
    const s = suggestStoreOrder([1, 2, 3, 4].flatMap(kassan), current, now);
    expect(s).toMatchObject({ trips: 0, changed: false });
  });

  it('flera varor ur samma sektion i snabb följd är en vanlig promenad', () => {
    const t = (daysAgo: number) => {
      const start = now.getTime() - daysAgo * 86_400_000;
      return [
        { section: 'meat_fish', at: 0 }, { section: 'meat_fish', at: 2 }, { section: 'meat_fish', at: 4 },
        { section: 'fruit_veg', at: 120 }, { section: 'dairy_eggs', at: 240 },
      ].map(x => ({ shopperKey: 'a', checkedAt: new Date(start + x.at * 1000), bulk: false, section: x.section }));
    };
    const s = suggestStoreOrder([1, 2, 3, 4].flatMap(t), current, now);
    expect(s.order.slice(0, 3)).toEqual(['meat_fish', 'fruit_veg', 'dairy_eggs']);
  });

  it('ger changed: false när man redan går i listans ordning', () => {
    const events = [1, 2, 3, 4].flatMap(d => trip('a', d, current));
    expect(suggestStoreOrder(events, current, now)).toMatchObject({ changed: false, moves: [] });
  });
});

describe('learnInnerOrder', () => {
  const inner = (daysAgo: number, rows: [string, string | null, string | null][]): InnerEventLike[] => {
    const start = now.getTime() - daysAgo * 86_400_000;
    return rows.map(([section, subCategory, itemName], i) =>
      ({ shopperKey: 'a', checkedAt: new Date(start + i * 30_000), bulk: false, section, subCategory, itemName }));
  };

  it('en enda handling räcker för ordningen inom en sektion', () => {
    const o = learnInnerOrder(inner(1, [
      ['fruit_veg', 'grönsaker', 'gurka'],
      ['fruit_veg', 'grönsaker', 'tomat'],
      ['fruit_veg', 'frukt', 'äpplen'],
    ]), now);
    expect(o.items.gurka).toBeLessThan(o.items.tomat);
    expect(o.subs.grönsaker).toBeLessThan(o.subs.frukt);
  });

  it('platser räknas inom sektionen, inte över hela handlingen', () => {
    const o = learnInnerOrder(inner(1, [
      ['fruit_veg', 'grönsaker', 'gurka'],
      ['dairy_eggs', 'mjölk', 'mjölk'],
      ['dairy_eggs', 'ägg', 'ägg'],
    ]), now);
    // Gurkan är ensam i sin sektion — ingen ordning att lära.
    expect(o.items.gurka).toBeUndefined();
    expect(o.items.mjölk).toBe(0);
    expect(o.items.ägg).toBe(1);
  });
});
describe('sectionKeyFor', () => {
  const store = { parentOrder: ['dairy_eggs', 's:pasta_nudlar', 'canned_dry', 'c:Barn'], categoryMerge: { snacks_sweets: 'canned_dry' } };
  const e = (x: Partial<{ category: string; subCategory: string | null; customCategory: string | null }>) =>
    ({ category: 'other', subCategory: null, customCategory: null, ...x });

  it('följer butikens fria placering, egna kategorier och ihopslagning', () => {
    expect(sectionKeyFor(e({ category: 'canned_dry', subCategory: 'pasta_nudlar' }), store)).toBe('s:pasta_nudlar');
    expect(sectionKeyFor(e({ category: 'canned_dry', subCategory: 'konserver' }), store)).toBe('canned_dry');
    expect(sectionKeyFor(e({ category: 'other', customCategory: 'Barn' }), store)).toBe('c:Barn');
    expect(sectionKeyFor(e({ category: 'snacks_sweets' }), store)).toBe('canned_dry');
  });
});

describe('eventsForSuggestion', () => {
  const ev = (storeId: string, customCategory: string | null = null) =>
    ({ storeId, shopperKey: `k-${storeId}`, checkedAt: new Date(), bulk: false, category: 'dairy_eggs', subCategory: null, customCategory });

  it('tar med andra hushåll i samma butik när minst två bidrar', () => {
    const r = eventsForSuggestion([ev('mine')], [ev('a'), ev('b')]);
    expect(r.otherHouseholds).toBe(2);
    expect(r.events).toHaveLength(3);
  });

  it('ett enda annat hushåll räknas inte — dess väg ska inte gå att läsa ut', () => {
    const r = eventsForSuggestion([ev('mine')], [ev('a'), ev('a')]);
    expect(r.otherHouseholds).toBe(0);
    expect(r.events).toHaveLength(1);
  });

  it('andra hushålls egna kategorier räknas aldrig', () => {
    const r = eventsForSuggestion([], [ev('a', 'Barn'), ev('b', 'Hund'), ev('c')]);
    expect(r.otherHouseholds).toBe(0);
  });
});
