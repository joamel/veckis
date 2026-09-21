import { describe, it, expect } from 'vitest';
import { formateraKöksmått } from './koksmatt';

describe('formateraKöksmått', () => {
  it('ger bråk som går att mäta upp', () => {
    // 4,7 dl finns inte i en måttsats; 4⅔ gör det, och skillnaden är 3 ml.
    expect(formateraKöksmått(4.7, 'dl')).toBe('4⅔');
    // 2,4 ligger närmare ⅓ (2,33) än ½ (2,5) — 7 ml mot 10 ml fel.
    expect(formateraKöksmått(2.4, 'dl')).toBe('2⅓');
    expect(formateraKöksmått(1.2, 'dl')).toBe('1¼');
    expect(formateraKöksmått(0.75, 'tsk')).toBe('¾');
    expect(formateraKöksmått(0.5, 'msk')).toBe('½');
  });

  it('lämnar heltal ifred', () => {
    expect(formateraKöksmått(3, 'dl')).toBe('3');
    expect(formateraKöksmått(1, 'st')).toBe('1');
  });

  it('rör inte vikt', () => {
    // "227 g" är vad vågen visar; "¼ kg" hjälper ingen.
    expect(formateraKöksmått(227, 'g')).toBe('227');
    expect(formateraKöksmått(1.4, 'kg')).toBe('1,4');
  });

  it('räknar upp när resten ligger närmast ett helt', () => {
    expect(formateraKöksmått(2.95, 'dl')).toBe('3');
  });
});
