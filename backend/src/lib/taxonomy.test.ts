import { describe, it, expect } from 'vitest';
import {
  ALL_SUB_CATEGORIES,
  SUB_TAXONOMY,
  parentForSub,
  subsForParent,
  subsAlsoUnder,
} from '@veckis/shared';

describe('SubCategory taxonomy', () => {
  it('every sub has en defaultParent + alsoUnder + label', () => {
    for (const sub of ALL_SUB_CATEGORIES) {
      const info = SUB_TAXONOMY[sub];
      expect(info.defaultParent, `${sub} saknar defaultParent`).toBeTruthy();
      expect(Array.isArray(info.alsoUnder), `${sub}.alsoUnder är ej array`).toBe(true);
      expect(info.label.length, `${sub} saknar label`).toBeGreaterThan(0);
    }
  });

  it('parentForSub matchar SUB_TAXONOMY', () => {
    expect(parentForSub('ost')).toBe('dairy_eggs');
    expect(parentForSub('fisk')).toBe('meat_fish');
    expect(parentForSub('glass')).toBe('frozen');
    expect(parentForSub('laktosfritt')).toBe('dairy_eggs');
  });

  it('subsForParent listar bara subs vars defaultParent matchar', () => {
    const meatSubs = subsForParent('meat_fish');
    expect(meatSubs).toContain('nöt');
    expect(meatSubs).toContain('färdiga_såser_kylda');
    expect(meatSubs).not.toContain('skinka_pålägg'); // tillhör deli_charcuterie
    expect(meatSubs).not.toContain('ost');
    expect(meatSubs).not.toContain('mjölk');
    // Deli-parent får sina egna subs
    const deliSubs = subsForParent('deli_charcuterie');
    expect(deliSubs).toContain('skinka_pålägg');
    expect(deliSubs).toContain('delikatessost');
  });

  it('subsAlsoUnder fångar cross-parent-länkar utan att duplicera defaultParent', () => {
    // delikatessost har defaultParent=deli_charcuterie + alsoUnder=[dairy_eggs]
    expect(subsAlsoUnder('dairy_eggs')).toContain('delikatessost');
    // skinka_pålägg har defaultParent=deli_charcuterie + alsoUnder=[meat_fish]
    expect(subsAlsoUnder('meat_fish')).toContain('skinka_pålägg');
    // glutenfritt har defaultParent=special_diet + alsoUnder=[bread_bakery]
    expect(subsAlsoUnder('bread_bakery')).toContain('glutenfritt');
    // En sub kan inte vara i både subsForParent(X) och subsAlsoUnder(X) för
    // samma X — alsoUnder ska inte upprepa defaultParent.
    for (const sub of ALL_SUB_CATEGORIES) {
      const def = SUB_TAXONOMY[sub].defaultParent;
      expect(SUB_TAXONOMY[sub].alsoUnder, `${sub}.alsoUnder upprepar defaultParent`).not.toContain(def);
    }
  });

  it('inga dubblerade label-värden inom samma parent', () => {
    // Två subs under samma parent får inte ha identiska labels (skulle förvirra
    // butikskonfigens UI).
    const byParent = new Map<string, string[]>();
    for (const sub of ALL_SUB_CATEGORIES) {
      const p = SUB_TAXONOMY[sub].defaultParent;
      const arr = byParent.get(p) ?? [];
      arr.push(SUB_TAXONOMY[sub].label);
      byParent.set(p, arr);
    }
    for (const [parent, labels] of byParent.entries()) {
      const set = new Set(labels);
      expect(set.size, `Dubbletter under ${parent}: ${labels}`).toBe(labels.length);
    }
  });

  it('approx 70 subs (sanity check)', () => {
    expect(ALL_SUB_CATEGORIES.length).toBeGreaterThanOrEqual(60);
    expect(ALL_SUB_CATEGORIES.length).toBeLessThanOrEqual(80);
  });
});
