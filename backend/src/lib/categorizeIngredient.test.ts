import { describe, it, expect } from 'vitest';
import { categorizeIngredient } from './categorizeIngredient';

describe('categorizeIngredient — delsträngsfällan', () => {
  it('matchar inte ett nyckelord mitt inne i ett ord', () => {
    // De här gav dryck före 2026-09-19: "sidfläsk" innehåller "läsk",
    // "toalettpapper" innehåller "te". Hittades när den kurerade klassaren
    // skulle bli sanning för hela ingredienspoolen.
    expect(categorizeIngredient('rimmat sidfläsk')).not.toBe('beverages');
    expect(categorizeIngredient('toalettpapper')).not.toBe('beverages');
    // "smör" i "jordnötssmör" gjorde en skafferivara till mejeri.
    expect(categorizeIngredient('jordnötssmör')).not.toBe('dairy_eggs');
  });

  it('matchar fortfarande svenska sammansättningar', () => {
    // Ordbörjan, inte helt ord — annars tappar vi hela poängen.
    expect(categorizeIngredient('kycklingfilé')).toBe('meat_fish');
    expect(categorizeIngredient('laxfilé')).toBe('meat_fish');
    expect(categorizeIngredient('potatismjöl')).not.toBe('beverages');
  });

  it('klarar enkla fall', () => {
    expect(categorizeIngredient('mjölk')).toBe('dairy_eggs');
    expect(categorizeIngredient('tomat')).toBe('fruit_veg');
    expect(categorizeIngredient('öl')).toBe('beverages');
  });

  it('låter undantag gå före råvaruregeln', () => {
    // Skafferivaror som bär råvarans namn — "tomat" drog dem till frukt & grönt.
    expect(categorizeIngredient('krossade tomater')).toBe('canned_dry');
    expect(categorizeIngredient('soltorkade tomater, klippta i bitar')).toBe('canned_dry');
    // Färsk jäst är kylvara och står vid mejeriet, inte i skafferiet.
    expect(categorizeIngredient('jäst')).toBe('dairy_eggs');
    // Men en vanlig tomat är fortfarande frukt & grönt.
    expect(categorizeIngredient('tomat')).toBe('fruit_veg');
    expect(categorizeIngredient('körsbärstomater')).toBe('fruit_veg');
  });

  it('lägger ärtor i frysen men inte färska ärtsorter', () => {
    expect(categorizeIngredient('ärtor')).toBe('frozen');
    expect(categorizeIngredient('gröna ärtor')).toBe('frozen');
    // Exakt ordmatchning: de här är färskvaror och ska inte dras med.
    expect(categorizeIngredient('sockerärtor')).toBe('fruit_veg');
  });

  it('svarar other när ingen regel träffar', () => {
    expect(categorizeIngredient('blorp')).toBe('other');
  });
});
