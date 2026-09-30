import { describe, it, expect } from 'vitest';
import { categorizeIngredient, categorizeWithStored, kureratUndantag, legacyKeywordCategory } from './categorizeIngredient';

describe('categorizeIngredient — kaffefilter', () => {
  it('är en torrvara bredvid kaffet, inte en dryck', () => {
    expect(categorizeIngredient('kaffefilter')).toBe('canned_dry');
    // Kaffe & te står i torrvaruhyllan (taxonomin), inte bland läsk och juice.
    expect(categorizeIngredient('kaffe')).toBe('canned_dry');
    expect(categorizeIngredient('kaffekapslar')).toBe('canned_dry');
  });
});

describe('categorizeIngredient — taco', () => {
  it('är torrvaror, inte bröd, men tortillachips är snacks', () => {
    expect(categorizeIngredient('tortillabröd')).toBe('canned_dry');
    expect(categorizeIngredient('mjuka tortillas')).toBe('canned_dry');
    expect(categorizeIngredient('tacokrydda')).toBe('canned_dry');
    expect(categorizeIngredient('salsa')).toBe('canned_dry');
    expect(categorizeIngredient('tortillachips')).toBe('snacks_sweets');
  });
});

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

  it('täcker luckorna som category-gaps hittade', () => {
    // Skördade 2026-09-20 ur rapporten: namnen fanns i poolen med rätt lagrad
    // kategori, men ingen REGEL kände igen dem — så en ny användare hade fått
    // dem i Övrigt.
    expect(categorizeIngredient('toalettpapper')).toBe('cleaning');
    expect(categorizeIngredient('rimmat sidfläsk')).toBe('meat_fish');
    expect(categorizeIngredient('garam masala')).toBe('canned_dry');
    expect(categorizeIngredient('grönsaksfond')).toBe('canned_dry');
    expect(categorizeIngredient('torkad dragon')).toBe('canned_dry');
    expect(categorizeIngredient('quornbitar')).toBe('frozen');
    // "torkad" avgör hyllan oavsett vad som följer — och måste prövas före
    // örtregeln, som annars gör torkad timjan till färskvara.
    expect(categorizeIngredient('torkad timjan')).toBe('canned_dry');
    expect(categorizeIngredient('torkade aprikoser')).toBe('canned_dry');
    // Men färsk timjan är fortfarande frukt & grönt.
    expect(categorizeIngredient('färsk timjan')).toBe('fruit_veg');
    // Men fläsk-regeln får inte dra med sig läsk igen.
    expect(categorizeIngredient('läsk')).toBe('beverages');
  });

  it('skiljer bär från sylt', () => {
    expect(categorizeIngredient('lingon')).toBe('frozen');
    // Rårörda lingon och sylt är skafferi — undantaget måste prövas före
    // bär-regeln, annars drar den med sig allt som börjar på "lingon".
    expect(categorizeIngredient('rårörda lingon')).toBe('canned_dry');
    expect(categorizeIngredient('lingonsylt')).toBe('canned_dry');
  });

  it('viker inte ihop å, ä och ö med a och o', () => {
    // Regression från accent-normaliseringen: "kål" blev "kal" och därmed en
    // delsträng av "kallrökt", så kallrökt lax klassades som frukt & grönt.
    expect(categorizeIngredient('kallrökt lax')).toBe('meat_fish');
    expect(categorizeIngredient('kalkonfilé')).toBe('meat_fish');
    expect(categorizeIngredient('kål')).toBe('fruit_veg');
  });

  it('kureratUndantag svarar bara på undantagen', () => {
    // Skiljer de handskrivna påståendena från nyckelordsreglerna, så en
    // gissad underkategori kan gå före reglerna men aldrig före undantagen.
    expect(kureratUndantag('lingon')).toBe('frozen');
    expect(kureratUndantag('rårörda lingon')).toBe('canned_dry');
    expect(kureratUndantag('torkad timjan')).toBe('canned_dry');
    // Vanliga varor täcks av reglerna, inte av undantagen.
    expect(kureratUndantag('mjölk')).toBeNull();
    expect(kureratUndantag('kyckling')).toBeNull();
  });

  it('lägger pulverformer i kryddhyllan', () => {
    // "vitlök" i "vitlökspulver" gjorde en krydda till färskvara.
    expect(categorizeIngredient('vitlökspulver')).toBe('canned_dry');
    expect(categorizeIngredient('paprikapulver')).toBe('canned_dry');
    expect(categorizeIngredient('vitlök')).toBe('fruit_veg');
  });

  it('bryr sig inte om accenter', () => {
    // Ordindelningen listade tidigare tillåtna tecken, så varje accent blev en
    // ordgräns: "crème fraîche" styckades i cr/me/fra/che och matchade inget.
    // Sex förekomster i poolen låg i Övrigt av den anledningen.
    expect(categorizeIngredient('crème fraîche')).toBe('dairy_eggs');
    expect(categorizeIngredient('creme fraiche')).toBe('dairy_eggs');
    expect(categorizeIngredient('crème fraiche 34%')).toBe('dairy_eggs');
    expect(categorizeIngredient('burrata')).toBe('cheese');
  });

  it('svarar other när ingen regel träffar', () => {
    expect(categorizeIngredient('blorp')).toBe('other');
  });
});

describe('categorizeIngredient — underkategorin före nyckelorden (prod 2026-09-30)', () => {
  it('ger samma svar som listans kedja i stället för nyckelordens gissning', () => {
    // "kakao" börjar på "kaka" i brödregeln.
    expect(categorizeIngredient('kakao')).toBe('canned_dry');
    expect(categorizeIngredient('falukorv')).toBe('deli_charcuterie');
    expect(categorizeIngredient('oregano')).toBe('canned_dry');
    // "havre" och "soja" i torrvaruregeln.
    expect(categorizeIngredient('havredryck')).toBe('dairy_eggs');
    expect(categorizeIngredient('sojafärs')).toBe('special_diet');
    expect(categorizeIngredient('kex')).toBe('bread_bakery');
  });

  it('nya regler från skörden', () => {
    expect(categorizeIngredient('keso')).toBe('dairy_eggs');
    expect(categorizeIngredient('baksmör')).toBe('dairy_eggs');
    expect(categorizeIngredient('drickyoghurt')).toBe('dairy_eggs');
    expect(categorizeIngredient('pesto')).toBe('canned_dry');
    expect(categorizeIngredient('hamburgerdressing')).toBe('canned_dry');
    expect(categorizeIngredient('toapapper')).toBe('cleaning');
  });

  it('nyckelordsgissningen finns kvar för att känna igen gamla basvaror', () => {
    expect(legacyKeywordCategory('kakao')).toBe('bread_bakery');
    expect(legacyKeywordCategory('kaffe')).toBe('beverages');
  });

  it('ett lagrat svar går före nyckelorden men efter underkategorin', () => {
    expect(categorizeWithStored('kakao', 'bread_bakery')).toBe('canned_dry');
    expect(categorizeWithStored('glögg', 'beverages')).toBe('beverages');
    expect(categorizeWithStored('glögg', 'other')).toBe(categorizeIngredient('glögg'));
  });
});

describe('granskningen av alla varunamn 2026-09-30', () => {
  it('rättar fel kategori', () => {
    expect(categorizeIngredient('kvarg')).toBe('dairy_eggs');
    expect(categorizeIngredient('kokosmjölk')).toBe('canned_dry');
    expect(categorizeIngredient('kycklingbuljongtärning')).toBe('canned_dry');
    expect(categorizeIngredient('chiliflakes')).toBe('canned_dry');
    expect(categorizeIngredient('malen koriander')).toBe('canned_dry');
    expect(categorizeIngredient('koriander')).toBe('fruit_veg');
    // "rom" i ett recept är nästan alltid fiskrom — ingen gissning på sprit.
    expect(categorizeIngredient('rom')).not.toBe('beverages');
    expect(categorizeIngredient('löjrom')).toBe('meat_fish');
  });

  it('fyller luckor', () => {
    expect(categorizeIngredient('satsuma')).toBe('fruit_veg');
    expect(categorizeIngredient('gurkmeja')).toBe('canned_dry');
    expect(categorizeIngredient('ströbröd')).toBe('canned_dry');
    expect(categorizeIngredient('matyoghurt')).toBe('dairy_eggs');
    expect(categorizeIngredient('kalkonkorv')).toBe('deli_charcuterie');
  });
});
