import { describe, it, expect } from 'vitest';
import { inferSubCategory, parentForSub, SUB_TAXONOMY } from '@veckis/shared';

describe('inferSubCategory', () => {
  it('matchar enkla varunamn', () => {
    expect(inferSubCategory('mjölk')).toBe('mjölk');
    expect(inferSubCategory('ägg')).toBe('ägg');
    expect(inferSubCategory('lax')).toBe('fisk');
    expect(inferSubCategory('toalettpapper')).toBe('toalett_hushållspapper');
  });

  it('matchar färdiga såser till rätt sub (kylda)', () => {
    expect(inferSubCategory('Bearnaisesås')).toBe('färdiga_såser_kylda');
    expect(inferSubCategory('hollandaise')).toBe('färdiga_såser_kylda');
  });

  it('skiljer chark från kött', () => {
    expect(inferSubCategory('Falukorv')).toBe('korv_charcuteri');
    expect(inferSubCategory('Salami')).toBe('korv_charcuteri');
    expect(inferSubCategory('Skinka')).toBe('skinka_pålägg');
    expect(inferSubCategory('Nötfärs')).toBe('färs');
    expect(inferSubCategory('Kycklingfilé')).toBe('kyckling_fågel');
  });

  it('skiljer delikatessost från hushållsost', () => {
    expect(inferSubCategory('Brie')).toBe('delikatessost');
    expect(inferSubCategory('Parmesan')).toBe('delikatessost');
    expect(inferSubCategory('Hushållsost')).toBe('ost');
    expect(inferSubCategory('Riven ost')).toBe('ost');
  });

  it('laktosfritt prioriteras över bas-mejeri', () => {
    expect(inferSubCategory('Laktosfri mjölk')).toBe('laktosfritt');
    expect(inferSubCategory('Laktosfri grädde')).toBe('laktosfritt');
  });

  it('mejerisubstitut hittas korrekt', () => {
    expect(inferSubCategory('Havremjölk')).toBe('mejerisubstitut');
    expect(inferSubCategory('Sojagrädde')).toBe('mejerisubstitut');
  });

  it('returnerar null när inget matchar', () => {
    expect(inferSubCategory('zzz fictitious item')).toBeNull();
    expect(inferSubCategory('')).toBeNull();
  });

  it('längsta matchande pattern vinner', () => {
    // "havremjölk" (10 char) ska slå "mjölk" (5 char) trots att båda matchar.
    expect(inferSubCategory('havremjölk')).toBe('mejerisubstitut');
  });

  it('case-insensitive', () => {
    expect(inferSubCategory('MJÖLK')).toBe('mjölk');
    expect(inferSubCategory('Toalettpapper')).toBe('toalett_hushållspapper');
  });

  it('alla inferred subs har giltig defaultParent', () => {
    const samples = ['mjölk', 'lax', 'broccoli', 'havremjölk', 'toalettpapper', 'olivolja'];
    for (const name of samples) {
      const sub = inferSubCategory(name);
      expect(sub, `${name} → sub`).toBeTruthy();
      const parent = parentForSub(sub!);
      expect(SUB_TAXONOMY[sub!].defaultParent).toBe(parent);
    }
  });
});
