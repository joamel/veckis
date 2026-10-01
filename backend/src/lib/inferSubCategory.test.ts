import { describe, it, expect } from 'vitest';
import { inferSubCategory, parentForSub, SUB_TAXONOMY } from '@veckis/shared';

describe('inferSubCategory', () => {
  it('matchar enkla varunamn', () => {
    expect(inferSubCategory('mjölk')).toBe('mjölk');
    expect(inferSubCategory('ägg')).toBe('ägg');
    expect(inferSubCategory('lax')).toBe('fisk');
    expect(inferSubCategory('toalettpapper')).toBe('toalett_hushållspapper');
  });

  it('lägger kaffefilter under Kaffe & te (torrvaror)', () => {
    expect(inferSubCategory('kaffefilter')).toBe('kaffe_te');
    expect(parentForSub('kaffe_te')).toBe('canned_dry');
  });

  it('samlar taco-varorna under Taco & Tex-Mex (torrvaror)', () => {
    expect(inferSubCategory('tortillabröd')).toBe('taco_texmex');
    expect(inferSubCategory('mjuka tortillas')).toBe('taco_texmex');
    expect(inferSubCategory('tacokrydda')).toBe('taco_texmex');
    expect(inferSubCategory('salsa')).toBe('taco_texmex');
    expect(inferSubCategory('tortillachips')).toBe('chips_salt');
    expect(parentForSub('taco_texmex')).toBe('canned_dry');
  });

  it('matchar färdiga såser till rätt sub (kylda)', () => {
    expect(inferSubCategory('Bearnaisesås')).toBe('färdiga_såser_kylda');
    expect(inferSubCategory('hollandaise')).toBe('färdiga_såser_kylda');
  });

  it('skiljer chark från kött', () => {
    expect(inferSubCategory('Falukorv')).toBe('korv_charcuteri');
    expect(inferSubCategory('Salami')).toBe('lufttorkat_salami');
    expect(inferSubCategory('Skinka')).toBe('skinka_pålägg');
    expect(inferSubCategory('Nötfärs')).toBe('färs');
    expect(inferSubCategory('Kycklingfilé')).toBe('kyckling_fågel');
  });

  it('skiljer delikatessost från hushållsost', () => {
    expect(inferSubCategory('Brie')).toBe('delikatessost');
    expect(inferSubCategory('Parmesan')).toBe('delikatessost');
    expect(inferSubCategory('Hushållsost')).toBe('ost');
    expect(inferSubCategory('Riven ost')).toBe('matlagningsost');
    expect(inferSubCategory('Halloumi')).toBe('matlagningsost');
    expect(inferSubCategory('Fetaost')).toBe('matlagningsost');
    expect(inferSubCategory('Mozzarella')).toBe('matlagningsost');
    expect(parentForSub('matlagningsost')).toBe('cheese');
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

describe('specialkost på engelska', () => {
  it('känner igen oöversatta importnamn', () => {
    // Översättningen vid import är förstahandsskyddet, men den gäller bara
    // URL-importens JSON-LD-gren. Skrivs namnet in för hand, eller faller
    // AI-anropet, kan engelska ändå nå databasen — och där låg redan
    // "gluten free pasta" utan att matcha något mönster alls.
    expect(inferSubCategory('gluten free pasta')).toBe('glutenfritt');
    expect(inferSubCategory('gluten-free bread')).toBe('glutenfritt');
    expect(inferSubCategory('glutenfria makaroner')).toBe('glutenfritt');
    expect(inferSubCategory('lactose free milk')).toBe('laktosfritt');
  });
});

describe('inferSubCategory — torkat', () => {
  it('torkade örter står bland kryddorna, inte bland de färska', () => {
    expect(inferSubCategory('torkad timjan')).toBe('kryddor_buljong');
    expect(inferSubCategory('timjan')).toBe('örter_sallad');
    expect(inferSubCategory('torkad oregano')).toBe('kryddor_buljong');
    // Torkad frukt står med nötterna och fröna, inte bland den färska frukten.
    expect(inferSubCategory('torkade aprikoser')).toBe('nötter_frön_torra');
  });
});

describe('inferSubCategory — ärtor', () => {
  it('ärtor är frysta grönsaker, som klassarens undantag säger', () => {
    expect(inferSubCategory('ärtor')).toBe('frysta_grönsaker');
    expect(parentForSub('frysta_grönsaker')).toBe('frozen');
    expect(inferSubCategory('sockerärtor')).not.toBe('frysta_grönsaker');
  });
});

describe('inferSubCategory — Coops gångar (2026-10-01)', () => {
  it('nya underkategorier', () => {
    expect(inferSubCategory('drickyoghurt')).toBe('drickyoghurt_mellanmål');
    expect(inferSubCategory('köttbullar')).toBe('fryst_köttbullar_chark');
    expect(inferSubCategory('currypasta')).toBe('världens_mat');
    expect(inferSubCategory('kokosmjölk')).toBe('världens_mat');
    expect(inferSubCategory('potatismos')).toBe('soppor_mos');
    expect(inferSubCategory('bakplåtspapper')).toBe('folie_matförvaring');
  });

  it('bredare befintliga', () => {
    expect(inferSubCategory('vegoburgare')).toBe('fryst_vegetariskt');
    expect(inferSubCategory('fiskpinnar')).toBe('fryst_fisk');
    expect(inferSubCategory('russin')).toBe('nötter_frön_torra');
    expect(inferSubCategory('pastasås')).toBe('sås_dressing');
    expect(inferSubCategory('batterier')).toBe('batteri_elektronik');
  });
});

describe('inferSubCategory — chark och oliver (2026-10-01)', () => {
  it('lufttorkat, korv & bacon, pastej', () => {
    expect(inferSubCategory('parmaskinka')).toBe('lufttorkat_salami');
    expect(inferSubCategory('chorizo')).toBe('lufttorkat_salami');
    expect(inferSubCategory('bacon')).toBe('korv_charcuteri');
    expect(inferSubCategory('falukorv')).toBe('korv_charcuteri');
    expect(inferSubCategory('leverpastej')).toBe('pâté_terrin');
    expect(inferSubCategory('skinka')).toBe('skinka_pålägg');
  });

  it('oliver på burk i torrvaror, marinerade vid disken', () => {
    expect(inferSubCategory('oliver')).toBe('oliver_antipasto');
    expect(parentForSub('oliver_antipasto')).toBe('canned_dry');
    expect(inferSubCategory('marinerade oliver')).toBe('antipasto_delikatesser');
    expect(parentForSub('antipasto_delikatesser')).toBe('deli_charcuterie');
  });
});
