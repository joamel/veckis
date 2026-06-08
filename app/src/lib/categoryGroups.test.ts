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
});
