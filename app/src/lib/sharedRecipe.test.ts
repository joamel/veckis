import { describe, expect, it } from 'vitest';
import { sharedRecipeDraft } from './sharedRecipe';

describe('sharedRecipeDraft', () => {
  it('en delad länk hämtas som länk', () => {
    expect(sharedRecipeDraft({ text: 'https://www.arla.se/recept/kladdkaka/', webUrl: 'https://www.arla.se/recept/kladdkaka/' }))
      .toEqual({ mode: 'url', url: 'https://www.arla.se/recept/kladdkaka/' });
  });

  it('ICA:s delning med receptnamnet före länken hämtas som länk', () => {
    expect(sharedRecipeDraft({ text: 'Krämig kycklinggryta https://www.ica.se/recept/kramig-kycklinggryta-722108/' }))
      .toEqual({ mode: 'url', url: 'https://www.ica.se/recept/kramig-kycklinggryta-722108/' });
  });

  it('bara webUrl (ingen text) räcker', () => {
    expect(sharedRecipeDraft({ text: null, webUrl: 'https://www.koket.se/pannkakor' }))
      .toEqual({ mode: 'url', url: 'https://www.koket.se/pannkakor' });
  });

  it('en receptext tolkas som recept, även med en länk i', () => {
    const text = 'Kladdkaka\n200 g smör\n3 dl socker\n2 ägg\n1 1/2 dl vetemjöl\n4 msk kakao\nSmält smöret, rör ner socker och ägg, vänd ner mjöl och kakao. Grädda i 175 grader i 15 minuter.\nKälla: https://www.arla.se/recept/kladdkaka/';
    expect(sharedRecipeDraft({ text, webUrl: 'https://www.arla.se/recept/kladdkaka/' })).toEqual({ mode: 'paste', text });
  });

  it('tom delning ger inget', () => {
    expect(sharedRecipeDraft({ text: '  ', webUrl: null })).toBeNull();
    expect(sharedRecipeDraft({})).toBeNull();
  });
});
