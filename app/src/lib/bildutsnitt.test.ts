import { describe, expect, it } from 'vitest';
import { fokusEfterDrag, räknaUtsnitt, ärJusterad, MITTEN } from './bildutsnitt';

// Ramen som receptbilden visas i: 16:9, 320 px bred.
const ram = { bredd: 320, höjd: 180 };

describe('räknaUtsnitt', () => {
  it('fyller ramen exakt när bilden redan är 16:9', () => {
    const u = räknaUtsnitt(ram, { bredd: 1600, höjd: 900 })!;
    expect(u.bredd).toBeCloseTo(320);
    expect(u.höjd).toBeCloseTo(180);
    expect(u.överskottX).toBeCloseTo(0);
    expect(u.överskottY).toBeCloseTo(0);
  });

  it('ger vertikalt överskott för en stående bild', () => {
    // 4:3 skalas efter bredden → 320x240, alltså 60 px för högt.
    const u = räknaUtsnitt(ram, { bredd: 1200, höjd: 900 })!;
    expect(u.höjd).toBeCloseTo(240);
    expect(u.överskottY).toBeCloseTo(60);
    expect(u.överskottX).toBeCloseTo(0);
  });

  it('centrerar när ingen fokus valts — samma utsnitt som cover gav förut', () => {
    const u = räknaUtsnitt(ram, { bredd: 1200, höjd: 900 })!;
    expect(u.y).toBeCloseTo(-30); // halva överskottet
  });

  it('visar bildens överkant vid fokus 0 och nederkant vid 1', () => {
    const topp = räknaUtsnitt(ram, { bredd: 1200, höjd: 900 }, null, 0)!;
    const botten = räknaUtsnitt(ram, { bredd: 1200, höjd: 900 }, null, 1)!;
    expect(topp.y).toBeCloseTo(0);
    expect(botten.y).toBeCloseTo(-60);
  });

  it('hanterar panoramabilder på x-axeln', () => {
    // 32:9 skalas efter höjden → 640x180, alltså 320 px för brett.
    const u = räknaUtsnitt(ram, { bredd: 3200, höjd: 900 }, 0)!;
    expect(u.överskottX).toBeCloseTo(320);
    expect(u.x).toBeCloseTo(0);
  });

  it('returnerar null för mått som inte går att räkna på', () => {
    expect(räknaUtsnitt(ram, { bredd: 0, höjd: 0 })).toBeNull();
    expect(räknaUtsnitt({ bredd: 0, höjd: 0 }, { bredd: 100, höjd: 100 })).toBeNull();
  });
});

describe('fokusEfterDrag', () => {
  it('drar man nedåt visas mer av bildens ovansida', () => {
    expect(fokusEfterDrag(MITTEN, 30, 60)).toBeCloseTo(0);
  });

  it('drar man uppåt visas mer av bildens undersida', () => {
    expect(fokusEfterDrag(MITTEN, -30, 60)).toBeCloseTo(1);
  });

  it('går aldrig utanför bilden hur långt man än drar', () => {
    expect(fokusEfterDrag(MITTEN, 9999, 60)).toBe(0);
    expect(fokusEfterDrag(MITTEN, -9999, 60)).toBe(1);
  });

  it('rör inte fokus på en axel som inte har något överskott', () => {
    expect(fokusEfterDrag(0.3, 50, 0)).toBe(0.3);
  });

  it('utgår från mitten när ingen fokus satts', () => {
    expect(fokusEfterDrag(null, 0, 60)).toBe(MITTEN);
  });
});

describe('ärJusterad', () => {
  it('mitten räknas inte som en justering', () => {
    expect(ärJusterad(null, null)).toBe(false);
    expect(ärJusterad(MITTEN, MITTEN)).toBe(false);
  });

  it('ett värde vid sidan av mitten räknas', () => {
    expect(ärJusterad(null, 0.2)).toBe(true);
  });
});
