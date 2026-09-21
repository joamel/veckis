import { describe, it, expect } from 'vitest';
import { convertToMetric, isConvertibleUnit } from '@veckis/shared';

describe('isConvertibleUnit', () => {
  it('känner igen amerikanska/brittiska enheter', () => {
    expect(isConvertibleUnit('cup')).toBe(true);
    expect(isConvertibleUnit('oz')).toBe(true);
    expect(isConvertibleUnit('CUP')).toBe(true);
  });

  it('känner inte igen redan svenska enheter', () => {
    expect(isConvertibleUnit('dl')).toBe(false);
    expect(isConvertibleUnit('msk')).toBe(false);
    expect(isConvertibleUnit(null)).toBe(false);
  });
});

describe('convertToMetric', () => {
  it('skalar volym (cup → dl)', () => {
    expect(convertToMetric(0.5, 'cup')).toEqual({ quantity: 1.2, unit: 'dl' });
    // 4,1 och inte 4,2: faktorn är numera den exakta 2,366 i stället för den
    // avrundade 2,4, så felet växer inte längre med mängden. 2 cups och 1 pint
    // ger nu samma svar, vilket de ska — det är samma volym.
    expect(convertToMetric(1.75, 'cup')).toEqual({ quantity: 4.1, unit: 'dl' });
    expect(convertToMetric(2, 'cups')).toEqual(convertToMetric(1, 'pint'));
  });

  it('skalar vikt (oz/lb → g), och byter till kg vid runda tal', () => {
    expect(convertToMetric(8, 'oz')).toEqual({ quantity: 227, unit: 'g' });
    expect(convertToMetric(3, 'lb')).toEqual({ quantity: 1.4, unit: 'kg' });
  });

  it('byter enkla enheter 1:1 utan avrundningsfel', () => {
    expect(convertToMetric(0.75, 'teaspoon')).toEqual({ quantity: 0.75, unit: 'tsk' });
    expect(convertToMetric(2, 'cloves')).toEqual({ quantity: 2, unit: 'klyfta' });
  });

  it('returnerar null för redan svenska enheter eller saknad mängd', () => {
    expect(convertToMetric(2, 'dl')).toBeNull();
    expect(convertToMetric(null, 'cup')).toBeNull();
  });
});
