import { describe, it, expect } from 'vitest';
import { formateraKöksmått } from './koksmatt';

describe('formateraKöksmått', () => {
  it('ger bråk som går att mäta upp', () => {
    // 4,7 dl finns inte i en måttsats; 4 2/3 gör det, och skillnaden är 3 ml.
    // ALLA bråk skrivs med snedstreck. Appens typsnitt saknar ⅓ och ⅔, och en
    // kolumn med "1¼" bredvid "2 1/3" ser ut som två olika sätt att skriva.
    expect(formateraKöksmått(4.7, 'dl')).toBe('4 2/3');
    // 2,4 ligger närmare en tredjedel (2,33) än en halv (2,5) — 7 ml mot 10.
    expect(formateraKöksmått(2.4, 'dl')).toBe('2 1/3');
    expect(formateraKöksmått(1.2, 'dl')).toBe('1 1/4');
    expect(formateraKöksmått(0.75, 'tsk')).toBe('3/4');
    expect(formateraKöksmått(0.5, 'msk')).toBe('1/2');
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
