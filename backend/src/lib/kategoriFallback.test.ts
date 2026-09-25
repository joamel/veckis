import { describe, it, expect } from 'vitest';
import { känndKategori, duglingGlobalt } from './normalizeIngredients';

describe('känndKategori — other är inte ett svar', () => {
  it('frågar klassaren när kategorin saknas eller är other', () => {
    // Just de här två namnen saknar underkategori i taxonomin, vilket är
    // varför de hamnade under Övrigt globalt: aliaset föddes som 'other' ur
    // ett importerat recept och vann sedan över klassaren vid varje tillägg.
    expect(känndKategori('other', 'avokado')).toBe('fruit_veg');
    expect(känndKategori('other', 'bacon')).toBe('meat_fish');
    expect(känndKategori(undefined, 'bröd')).toBe('bread_bakery');
  });

  it('respekterar en kategori som faktiskt säger något', () => {
    expect(känndKategori('dairy_eggs', 'avokado')).toBe('dairy_eggs');
  });

  it('duglingGlobalt släpper inte fram alternativ-strängar', () => {
    // "nötfärs alt. vegofärs" ska aldrig föreslås i sökningen — det är ingen
    // vara. Alternativen lärs in var för sig; raden i listan behåller texten.
    expect(duglingGlobalt('nötfärs alt. vegofärs')).toBe(false);
    expect(duglingGlobalt('körsbärstomater eller romanticatomater')).toBe(false);
    expect(duglingGlobalt('nötfärs')).toBe(true);
    // "eller" inuti ett ord ska inte råka träffa.
    expect(duglingGlobalt('mellermjölk')).toBe(true);
  });

  it('duglingGlobalt släpper inte fram plusnamn', () => {
    // "vin+öl" är två varor; leden lärs in var för sig.
    expect(duglingGlobalt('vin+öl')).toBe(false);
    expect(duglingGlobalt('vin + öl')).toBe(false);
    // Även när bara ett led känns igen.
    expect(duglingGlobalt('vin+xyzzy')).toBe(false);
    // Plus utan andra led är en del av namnet.
    expect(duglingGlobalt('kvarg+')).toBe(true);
  });

  it('duglingGlobalt släpper inte fram snedstrecksnamn', () => {
    // Snedstreck betyder "eller" i en inköpslista — leden lärs in var för sig.
    expect(duglingGlobalt('lax/torsk/alaska pollock')).toBe(false);
    expect(duglingGlobalt('pommes/potatis')).toBe(false);
    // Även när bara ett led gick att tolka.
    expect(duglingGlobalt('grönsakstärning/-fond')).toBe(false);
    // Bråktal är ingen uppräkning. (Namn som BÖRJAR med siffra stoppas redan
    // av regeln ovan, så provet får ha siffran senare.)
    expect(duglingGlobalt('gurka 1/2')).toBe(true);
  });

  it('ger other när ingen vet', () => {
    expect(känndKategori('other', 'blorp')).toBe('other');
  });
});
