import { describe, it, expect } from 'vitest';
import type { StoreCategory } from '@veckis/shared';
import { applyInnerOrder, buildCategoryGroups, permuteKnown, placedClusters, placedHeadings, placedSubKey, type CategoryGroupItem } from './categoryGroups';

function item(name: string, category: string, extra: Partial<CategoryGroupItem> = {}): CategoryGroupItem {
  return { name, category, isChecked: false, subCategory: null, ...extra };
}

describe('buildCategoryGroups', () => {
  it('grupperar enligt butikens kategori-ordning', () => {
    const items = [item('Äpple', 'fruit_veg'), item('Mjölk', 'dairy_eggs')];
    const groups = buildCategoryGroups(items, ['dairy_eggs', 'fruit_veg'] as StoreCategory[]);
    expect(groups.map(g => g.category)).toEqual(['dairy_eggs', 'fruit_veg']);
  });

  it('sorterar inom en grupp: obockade före bockade, sedan på namn', () => {
    const items = [
      item('Banan', 'fruit_veg'),
      item('Avokado', 'fruit_veg', { isChecked: true }),
      item('Citron', 'fruit_veg'),
    ];
    const [group] = buildCategoryGroups(items, ['fruit_veg'] as StoreCategory[]);
    expect(group.items.map(i => i.name)).toEqual(['Banan', 'Citron', 'Avokado']);
  });

  it('klustrar varor per subkategori (kanonisk ordning) inom en samlad kategori', () => {
    const items = [
      item('Zucchini', 'fruit_veg', { subCategory: 'grönsaker' }), // rank 2
      item('Äpple', 'fruit_veg', { subCategory: 'frukt' }),        // rank 0
      item('Okänt', 'fruit_veg'),                                  // ingen sub → sist
      item('Blåbär', 'fruit_veg', { subCategory: 'bär' }),         // rank 1
    ];
    const [group] = buildCategoryGroups(items, ['fruit_veg'] as StoreCategory[]);
    // frukt < bär < grönsaker, sub-lösa sist — oavsett bokstavsordning.
    expect(group.items.map(i => i.name)).toEqual(['Äpple', 'Blåbär', 'Zucchini', 'Okänt']);
  });

  describe('egna rubriker (butikens layout, aldrig data på varan)', () => {
    const order = ['dairy_eggs', 'canned_dry'] as StoreCategory[];
    const items = [
      item('Mjölk', 'dairy_eggs'),
      item('Müsli', 'canned_dry', { subCategory: 'flingor_müsli' }),
      item('Sylt', 'canned_dry', { subCategory: 'sylt_marmelad' }),
      item('Pasta', 'canned_dry', { subCategory: 'pasta_nudlar' }),
    ];
    const expanded = ['flingor_müsli', 'sylt_marmelad'];

    it('utlyfta underkategorier direkt under en egen rubrik samlas i rubrikens sektion', () => {
      const po = ['c:Frukost', placedSubKey('flingor_müsli'), placedSubKey('sylt_marmelad'), 'dairy_eggs', 'canned_dry'];
      const groups = buildCategoryGroups(items, order, ['Frukost'], expanded, po);
      expect(groups.map(g => g.category)).toEqual(['Frukost', 'dairy_eggs', 'canned_dry']);
      expect(groups[0]).toMatchObject({ isCustom: true });
      expect(groups[0].items.map(i => i.name).sort()).toEqual(['Müsli', 'Sylt']);
      expect(groups[2].items.map(i => i.name)).toEqual(['Pasta']);
    });

    it('bara underkategorier DIREKT under rubriken hör till den — och de blir inget kluster', () => {
      const po = ['c:Frukost', placedSubKey('flingor_müsli'), 'dairy_eggs', placedSubKey('sylt_marmelad'), 'canned_dry'];
      expect([...placedHeadings(po)]).toEqual([[placedSubKey('flingor_müsli'), 'c:Frukost']]);
      const groups = buildCategoryGroups(items, order, ['Frukost'], expanded, po);
      expect(groups.map(g => g.category)).toEqual(['Frukost', 'dairy_eggs', 'sylt_marmelad', 'canned_dry']);
      expect(placedClusters(['c:Frukost', placedSubKey('flingor_müsli'), placedSubKey('honung')]).size).toBe(0);
    });

    it('en tom rubrik blir ingen sektion', () => {
      const groups = buildCategoryGroups([item('Mjölk', 'dairy_eggs')], order, ['Frukost'], [], ['c:Frukost', 'dairy_eggs']);
      expect(groups.map(g => g.category)).toEqual(['dairy_eggs']);
    });
  });

  it('renderar en expanderad sub direkt efter sin parent', () => {
    const items = [
      item('Tofu', 'special_diet', { subCategory: 'vegan' }),
      item('Salt', 'special_diet'),
    ];
    const groups = buildCategoryGroups(items, ['special_diet'] as StoreCategory[], [], ['vegan']);
    const cats = groups.map(g => g.category);
    // Parent-headern (direkta items) först, sedan vegan-subben.
    expect(cats).toEqual(['special_diet', 'vegan']);
    expect(groups[1]).toMatchObject({ isSub: true });
  });

  it('#5: parent vars items alla brutits ut i subs behåller sin ordnings-slot', () => {
    // special_diet har INGA direkta items (allt i vegan-subben) men ligger före
    // "other" i ordningen → subben ska hamna i special_diets slot, inte sist.
    const items = [
      item('Tofu', 'special_diet', { subCategory: 'vegan' }),
      item('Övrigt', 'other'),
    ];
    const groups = buildCategoryGroups(items, ['special_diet', 'other'] as StoreCategory[], [], ['vegan']);
    const cats = groups.map(g => g.category);
    expect(cats.indexOf('vegan')).toBeLessThan(cats.indexOf('other'));
    // Ingen tom special_diet-parent-header när den saknar direkta items.
    expect(cats).not.toContain('special_diet');
  });

  it('okänd kategori som inte finns i ordningen läggs efter de ordnade', () => {
    const items = [item('X', 'frozen'), item('Mjölk', 'dairy_eggs')];
    const groups = buildCategoryGroups(items, ['dairy_eggs'] as StoreCategory[]);
    expect(groups.map(g => g.category)).toEqual(['dairy_eggs', 'frozen']);
  });

  it('categoryMerge: varor grupperas under målkategorin, källan syns inte alls', () => {
    const items = [item('Blöjor', 'baby_kids'), item('Mjölk', 'dairy_eggs')];
    const groups = buildCategoryGroups(items, ['dairy_eggs', 'baby_kids'] as StoreCategory[], [], [], [], { baby_kids: 'other' });
    const cats = groups.map(g => g.category);
    expect(cats).not.toContain('baby_kids');
    expect(cats).toContain('other');
    const otherGroup = groups.find(g => g.category === 'other');
    expect(otherGroup?.items.map(i => i.name)).toEqual(['Blöjor']);
  });

  it('categoryMerge: en utbruten sub ÄRVS av målet som egen sektion, inte plattas ut', () => {
    // 'blöjor' är en riktig taxonomi-sub med defaultParent baby_kids.
    const items = [item('Pampers', 'baby_kids', { subCategory: 'blöjor' })];
    const groups = buildCategoryGroups(items, ['baby_kids', 'other'] as StoreCategory[], [], ['blöjor'], [], { baby_kids: 'other' });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ category: 'blöjor', isCustom: false, isSub: true });
    expect(groups[0].items.map(i => i.name)).toEqual(['Pampers']);
  });

  it('categoryMerge: en EJ utbruten sub hamnar ändå i målets direkta hink', () => {
    const items = [item('Pampers', 'baby_kids', { subCategory: 'blöjor' })];
    // 'blöjor' INTE i expandedSubs → ingen egen sektion, ska falla igenom till "other".
    const groups = buildCategoryGroups(items, ['baby_kids', 'other'] as StoreCategory[], [], [], [], { baby_kids: 'other' });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ category: 'other' });
    expect(groups[0].isSub).toBeFalsy();
    expect(groups[0].items.map(i => i.name)).toEqual(['Pampers']);
  });

  it('categoryMerge: kan slås ihop med en egen (custom) kategori', () => {
    const items = [item('Blöjor', 'baby_kids')];
    const groups = buildCategoryGroups(items, ['baby_kids'] as StoreCategory[], ['Min hylla'], [], [], { baby_kids: 'c:Min hylla' });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ category: 'Min hylla', isCustom: true });
  });

  it('categoryMerge: en utbruten sub ärvs ÄVEN när målet är en egen kategori', () => {
    const items = [item('Pampers', 'baby_kids', { subCategory: 'blöjor' })];
    const groups = buildCategoryGroups(items, ['baby_kids'] as StoreCategory[], ['Övrigt inkl baby'], ['blöjor'], [], { baby_kids: 'c:Övrigt inkl baby' });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ category: 'blöjor', isCustom: false, isSub: true });
  });

  describe('blandad ordning (underkategorier placerade fritt)', () => {
    const order = ['dairy_eggs', 'canned_dry', 'meat_fish'] as StoreCategory[];
    const items = [
      item('Mjölk', 'dairy_eggs'),
      item('Spagetti', 'canned_dry', { subCategory: 'pasta_nudlar' }),
      item('Krossade tomater', 'canned_dry', { subCategory: 'konserver' }),
      item('Kycklingfilé', 'meat_fish'),
    ];

    it('utan placering ligger en utbruten underkategori direkt efter sin kategori, som förut', () => {
      const groups = buildCategoryGroups(items, order, [], ['pasta_nudlar'], ['dairy_eggs', 'canned_dry', 'meat_fish']);
      expect(groups.map(g => g.category)).toEqual(['dairy_eggs', 'canned_dry', 'pasta_nudlar', 'meat_fish']);
    });

    it('en placerad underkategori ritas där den står — före mejeri, långt från skafferiet', () => {
      const po = [placedSubKey('pasta_nudlar'), 'dairy_eggs', 'canned_dry', 'meat_fish'];
      const groups = buildCategoryGroups(items, order, [], ['pasta_nudlar'], po);
      expect(groups.map(g => g.category)).toEqual(['pasta_nudlar', 'dairy_eggs', 'canned_dry', 'meat_fish']);
      expect(groups[0].items.map(i => i.name)).toEqual(['Spagetti']);
    });

    it('en placering för en underkategori som inte längre är utbruten ignoreras — varorna ligger i kategorin', () => {
      const po = ['dairy_eggs', placedSubKey('pasta_nudlar'), 'canned_dry', 'meat_fish'];
      const groups = buildCategoryGroups(items, order, [], [], po);
      expect(groups.map(g => g.category)).toEqual(['dairy_eggs', 'canned_dry', 'meat_fish']);
      expect(groups[1].items.map(i => i.name)).toContain('Spagetti');
    });

    it('en kategori vars enda innehåll placerats bort får ingen tom sektion', () => {
      const bara = [item('Spagetti', 'canned_dry', { subCategory: 'pasta_nudlar' }), item('Mjölk', 'dairy_eggs')];
      const groups = buildCategoryGroups(bara, order, [], ['pasta_nudlar'], ['dairy_eggs', 'canned_dry', placedSubKey('pasta_nudlar')]);
      expect(groups.map(g => g.category)).toEqual(['dairy_eggs', 'pasta_nudlar']);
    });
  });
  describe('kluster: flera utbrutna från samma kategori bredvid varandra', () => {
    const order = ['dairy_eggs', 'canned_dry', 'meat_fish'] as StoreCategory[];
    const items = [
      item('Mjölk', 'dairy_eggs'),
      item('Sylt', 'canned_dry', { subCategory: 'sylt_marmelad' }),
      item('Honung', 'canned_dry', { subCategory: 'honung' }),
      item('Krossade tomater', 'canned_dry', { subCategory: 'konserver' }),
    ];
    const expanded = ['sylt_marmelad', 'honung'];

    it('slås ihop till en sektion "(2)" med båda underkategoriernas varor', () => {
      const po = ['canned_dry', 'dairy_eggs', placedSubKey('sylt_marmelad'), placedSubKey('honung'), 'meat_fish'];
      const groups = buildCategoryGroups(items, order, [], expanded, po);
      expect(groups.map(g => g.category)).toEqual(['canned_dry', 'dairy_eggs', 'canned_dry#2']);
      const cluster = groups[2];
      expect(cluster.cluster).toMatchObject({ parentKey: 'canned_dry', index: 2 });
      expect(cluster.items.map(i => i.name).sort()).toEqual(['Honung', 'Sylt']);
    });

    it('en ensam utbruten behåller sitt eget namn, och avbrutna följder blir inga kluster', () => {
      const po = ['canned_dry', placedSubKey('sylt_marmelad'), 'dairy_eggs', placedSubKey('honung')];
      const groups = buildCategoryGroups(items, order, [], expanded, po);
      expect(groups.map(g => g.category)).toEqual(['canned_dry', 'sylt_marmelad', 'dairy_eggs', 'honung']);
      expect(groups.some(g => g.cluster)).toBe(false);
    });

    it('klustret avgörs av butiksordningen, inte av vad listan innehåller i dag', () => {
      const bara = items.filter(i => i.name !== 'Honung');
      const po = ['canned_dry', placedSubKey('sylt_marmelad'), placedSubKey('honung')];
      const groups = buildCategoryGroups(bara, order, [], expanded, po);
      expect(groups.find(g => g.cluster)?.category).toBe('canned_dry#2');
    });

    it('numrerar flera kluster från samma kategori 2, 3 …', () => {
      const po = [
        placedSubKey('sylt_marmelad'), placedSubKey('honung'),
        'dairy_eggs',
        placedSubKey('kaffe_te'), placedSubKey('mjöl_bakingredienser'),
      ];
      const clusters = placedClusters(po);
      expect(clusters.get(placedSubKey('sylt_marmelad'))?.index).toBe(2);
      expect(clusters.get(placedSubKey('kaffe_te'))?.index).toBe(3);
      expect(clusters.has('dairy_eggs')).toBe(false);
    });
  });
});

describe('inlärd ordning inom en sektion', () => {
  it('byter bara plats på det som har en inlärd plats', () => {
    // b och d är kända: d före b. a och c står kvar i sina luckor.
    expect(permuteKnown(['a', 'b', 'c', 'd'], x => ({ b: 0.9, d: 0.1 } as Record<string, number>)[x])).toEqual(['a', 'd', 'c', 'b']);
  });

  it('gurkan före tomaten, och grönsakerna före frukten, när man brukar gå så', () => {
    const items = [
      item('äpplen', 'fruit_veg', { subCategory: 'frukt' }),
      item('gurka', 'fruit_veg', { subCategory: 'grönsaker' }),
      item('tomat', 'fruit_veg', { subCategory: 'grönsaker' }),
      item('paprika', 'fruit_veg', { subCategory: 'grönsaker' }),
    ];
    const groups = buildCategoryGroups(items, ['fruit_veg'] as StoreCategory[], [], [], [], {},
      { subs: { grönsaker: 0, frukt: 1 }, items: { tomat: 0.2, gurka: 0.8 } });
    // Paprikan är okänd och står kvar i sin lucka (mitten i bokstavsordningen
    // gurka, paprika, tomat); gurka och tomat byter plats runt den.
    expect(groups[0].items.map(i => i.name)).toEqual(['tomat', 'paprika', 'gurka', 'äpplen']);
  });

  it('bockade varor ligger kvar sist och orörda', () => {
    const sorted = [item('gurka', 'fruit_veg'), item('tomat', 'fruit_veg'), item('lök', 'fruit_veg', { isChecked: true })];
    expect(applyInnerOrder(sorted, { subs: {}, items: { tomat: 0, gurka: 1, lök: 0 } }).map(i => i.name)).toEqual(['tomat', 'gurka', 'lök']);
  });
});
