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

  it('täcker luckorna som category-gaps hittade', () => {
    // Skördade 2026-09-20 ur rapporten: namnen fanns i poolen med rätt lagrad
    // kategori, men ingen REGEL kände igen dem — så en ny användare hade fått
    // dem i Övrigt.
    expect(categorizeIngredient('toalettpapper')).toBe('personal_care');
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
