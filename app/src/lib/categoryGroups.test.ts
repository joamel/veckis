import { describe, it, expect } from 'vitest';
import type { StoreCategory } from '@veckis/shared';
import { buildCategoryGroups, type CategoryGroupItem } from './categoryGroups';

function item(name: string, category: string, extra: Partial<CategoryGroupItem> = {}): CategoryGroupItem {
  return { name, category, isChecked: false, subCategory: null, customCategory: null, ...extra };
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

  it('lägger custom-kategorier sist', () => {
    const items = [item('Special', 'other', { customCategory: 'Min hylla' }), item('Mjölk', 'dairy_eggs')];
    const groups = buildCategoryGroups(items, ['dairy_eggs', 'other'] as StoreCategory[], ['Min hylla']);
    expect(groups.at(-1)).toMatchObject({ category: 'Min hylla', isCustom: true });
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
    const groups = buildCategoryGroups(items, ['dairy_eggs', 'baby_kids'] as StoreCategory[], [], [], {}, [], { baby_kids: 'other' });
    const cats = groups.map(g => g.category);
    expect(cats).not.toContain('baby_kids');
    expect(cats).toContain('other');
    const otherGroup = groups.find(g => g.category === 'other');
    expect(otherGroup?.items.map(i => i.name)).toEqual(['Blöjor']);
  });

  it('categoryMerge: en utbruten sub ÄRVS av målet som egen sektion, inte plattas ut', () => {
    // 'blöjor' är en riktig taxonomi-sub med defaultParent baby_kids.
    const items = [item('Pampers', 'baby_kids', { subCategory: 'blöjor' })];
    const groups = buildCategoryGroups(items, ['baby_kids', 'other'] as StoreCategory[], [], ['blöjor'], {}, [], { baby_kids: 'other' });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ category: 'blöjor', isCustom: false, isSub: true });
    expect(groups[0].items.map(i => i.name)).toEqual(['Pampers']);
  });

  it('categoryMerge: en EJ utbruten sub hamnar ändå i målets direkta hink', () => {
    const items = [item('Pampers', 'baby_kids', { subCategory: 'blöjor' })];
    // 'blöjor' INTE i expandedSubs → ingen egen sektion, ska falla igenom till "other".
    const groups = buildCategoryGroups(items, ['baby_kids', 'other'] as StoreCategory[], [], [], {}, [], { baby_kids: 'other' });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ category: 'other' });
    expect(groups[0].isSub).toBeFalsy();
    expect(groups[0].items.map(i => i.name)).toEqual(['Pampers']);
  });

  it('categoryMerge: kan slås ihop med en egen (custom) kategori', () => {
    const items = [item('Blöjor', 'baby_kids')];
    const groups = buildCategoryGroups(items, ['baby_kids'] as StoreCategory[], ['Min hylla'], [], {}, [], { baby_kids: 'c:Min hylla' });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ category: 'Min hylla', isCustom: true });
  });

  it('categoryMerge: en utbruten sub ärvs ÄVEN när målet är en egen kategori', () => {
    const items = [item('Pampers', 'baby_kids', { subCategory: 'blöjor' })];
    const groups = buildCategoryGroups(items, ['baby_kids'] as StoreCategory[], ['Övrigt inkl baby'], ['blöjor'], {}, [], { baby_kids: 'c:Övrigt inkl baby' });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ category: 'blöjor', isCustom: false, isSub: true });
  });

  it('categoryMerge: en egen (custom) sub ärvs av målet', () => {
    const items = [item('Specialblöja', 'baby_kids', { customSubCategory: 'Ekologiska' })];
    const groups = buildCategoryGroups(items, ['baby_kids', 'other'] as StoreCategory[], [], [], {}, [], { baby_kids: 'other' });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ category: 'Ekologiska', isCustom: true, isSub: true, parentKey: 'other' });
    expect(groups[0].items.map(i => i.name)).toEqual(['Specialblöja']);
  });
});
