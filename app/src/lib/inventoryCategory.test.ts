import { describe, expect, it } from 'vitest';
import { inventoryCategory } from './inventoryCategory';

describe('inventoryCategory', () => {
  it('går på hushållets inlärda kategori först', () => {
    expect(inventoryCategory('Halloumi', { halloumi: 'dairy_eggs' }, 'other')).toBe('dairy_eggs');
  });

  it('gissar ur namnet när inget är inlärt — receptets "other" räcker inte', () => {
    expect(inventoryCategory('mjölk', {}, 'other')).toBe('dairy_eggs');
    expect(inventoryCategory('gul lök', {}, 'other')).toBe('fruit_veg');
    expect(inventoryCategory('krossade tomater', {}, undefined)).toBe('canned_dry');
  });

  it('en inlärd "other" väger lättare än en gissning ur namnet', () => {
    expect(inventoryCategory('mjölk', { mjölk: 'other' }, 'other')).toBe('dairy_eggs');
  });

  it('faller tillbaka på receptets kategori när inget annat finns', () => {
    expect(inventoryCategory('xyzvara', {}, 'frozen')).toBe('frozen');
  });
});
