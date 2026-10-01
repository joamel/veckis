import { describe, expect, it } from 'vitest';
import { bevararSkyddadeOrd } from './importMatchning';
import { categorizeIngredient } from './categorizeIngredient';
import { inferSubCategory } from '@veckis/shared';

describe('konserver får inte kortas till den färska varan', () => {
  it('skyddar krossade, passerade, burk och konserv', () => {
    expect(bevararSkyddadeOrd('krossade tomater', 'tomat')).toBe(false);
    expect(bevararSkyddadeOrd('passerade tomater', 'tomater')).toBe(false);
    expect(bevararSkyddadeOrd('tomater på burk', 'tomat')).toBe(false);
    expect(bevararSkyddadeOrd('krossade tomater', 'krossade tomater')).toBe(true);
  });

  it('klassar tomatkonserver som konserver', () => {
    for (const n of ['krossade tomater', 'passerade tomater', 'tomatkross', 'tomater på burk', 'hela tomater på burk']) {
      expect(categorizeIngredient(n)).toBe('canned_dry');
      expect(inferSubCategory(n)).toBe('konserver');
    }
    expect(categorizeIngredient('tomat')).toBe('fruit_veg');
  });
});

describe('burk som enhet tas bort innan skyddet gäller', () => {
  it('pluralformer och en mängd efter kommat', async () => {
    const { stripIngredient } = await import('./stripIngredient');
    // Samma namn som utan mängd (rensningen böjer dessutom till singular).
    expect(stripIngredient('2 burkar kikärtor')).toBe(stripIngredient('kikärtor'));
    expect(stripIngredient('kikärtor, 1 burk')).toBe(stripIngredient('kikärtor'));
    expect(stripIngredient('1 burk krossade tomater')).toBe('krossade tomater');
    // Men burk som del av varan står kvar.
    expect(stripIngredient('burkmajs')).toBe('burkmajs');
    expect(stripIngredient('majs på burk')).toBe('majs på burk');
  });
});
