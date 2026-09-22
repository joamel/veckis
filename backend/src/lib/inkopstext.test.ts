import { describe, it, expect } from 'vitest';
import { tolkaInköpstext, tolkaInköpslista, MAX_VAROR } from './inkopstext';

const namn = (text: string) => tolkaInköpstext(text).map(v => v.name);
const utanAntal = (text: string) => tolkaInköpstext(text).map(({ antalRader: _a, ...v }) => v);

describe('tolkaInköpstext', () => {
  it('en vara per rad', () => {
    expect(namn('mjölk\nbröd\nägg')).toEqual(['mjölk', 'bröd', 'ägg']);
  });

  it('delar på komma med mellanslag men inte decimalkomma', () => {
    expect(namn('mjölk, bröd, ägg')).toEqual(['mjölk', 'bröd', 'ägg']);
    expect(utanAntal('1,5 l mjölk')).toEqual([{ name: 'mjölk', quantity: 1.5, unit: 'l' }]);
  });

  it('tar bort punkter, kryssrutor och numrering', () => {
    expect(namn('- mjölk\n• bröd\n* ost\n[ ] smör\n[x] ägg\n☐ kaffe\n1. te\n2) socker'))
      .toEqual(['mjölk', 'bröd', 'ost', 'smör', 'ägg', 'kaffe', 'te', 'socker']);
    expect(namn('- [ ] mjölk')).toEqual(['mjölk']);
  });

  it('läser mängd före namnet', () => {
    expect(utanAntal('2 l mjölk')).toEqual([{ name: 'mjölk', quantity: 2, unit: 'l' }]);
    expect(utanAntal('500 g nötfärs')).toEqual([{ name: 'nötfärs', quantity: 500, unit: 'g' }]);
    expect(utanAntal('3 gurkor')).toEqual([{ name: 'gurkor', quantity: 3, unit: null }]);
  });

  it('läser mängd efter namnet', () => {
    expect(utanAntal('mjölk 2 l')).toEqual([{ name: 'mjölk', quantity: 2, unit: 'l' }]);
    expect(utanAntal('ägg 12 st')).toEqual([{ name: 'ägg', quantity: 12, unit: 'st' }]);
    expect(utanAntal('bananer 6')).toEqual([{ name: 'bananer', quantity: 6, unit: null }]);
    expect(utanAntal('tomater (4)')).toEqual([{ name: 'tomater', quantity: 4, unit: null }]);
  });

  it('läser x-mängder åt båda håll', () => {
    expect(utanAntal('mjölk x2')).toEqual([{ name: 'mjölk', quantity: 2, unit: null }]);
    expect(utanAntal('mjölk 2x')).toEqual([{ name: 'mjölk', quantity: 2, unit: null }]);
    expect(utanAntal('2x mjölk')).toEqual([{ name: 'mjölk', quantity: 2, unit: null }]);
  });

  it('hoppar över rubriker, tomma rader och rader utan bokstäver', () => {
    expect(namn('Mejeri:\nmjölk\n\n   \n---\n123\nFrukt:\näpplen')).toEqual(['mjölk', 'äpplen']);
  });

  it('behåller namn med siffror mitt i', () => {
    expect(namn('coca cola zero')).toEqual(['coca cola zero']);
  });

  it('tar bort avslutande skiljetecken', () => {
    expect(namn('mjölk.\nbröd!')).toEqual(['mjölk', 'bröd']);
  });

  it('klarar windows-radslut', () => {
    expect(namn('mjölk\r\nbröd')).toEqual(['mjölk', 'bröd']);
  });

  it('hoppar över rubriker som slutar med stjärna', () => {
    expect(namn('❏ Frukt och grönt ✭\n ✔ Gurka\n✔ Raggmunk ✭\n ✔ Salt')).toEqual(['Gurka', 'Salt']);
  });

  it('tar bort tomma kryssrutor av andra sorter', () => {
    expect(namn('❏ Tandborste\n▢ Tvål\n□ Schampo')).toEqual(['Tandborste', 'Tvål', 'Schampo']);
  });

  it('läser gr och gram som g', () => {
    expect(utanAntal('Aubergine 300 gr')).toEqual([{ name: 'Aubergine', quantity: 300, unit: 'g' }]);
    expect(utanAntal('Jäst 25 gram')).toEqual([{ name: 'Jäst', quantity: 25, unit: 'g' }]);
  });

  it('sätter tillbaka en beskrivning efter komma på varan före', () => {
    expect(namn('Soja, glutenfri')).toEqual(['Soja glutenfri']);
    expect(namn('Köttbullar, glutenfria')).toEqual(['Köttbullar glutenfria']);
    expect(namn('Mjölk, bröd')).toEqual(['Mjölk', 'bröd']);
  });

  it('slår ihop samma vara utan mängd till en rad, men räknar raderna', () => {
    const [blomkål, dadlar] = tolkaInköpstext('Blomkål\nDadlar\nBlomkål');
    expect([blomkål.name, dadlar.name]).toEqual(['Blomkål', 'Dadlar']);
    // Ingen påhittad mängd — bara att den stod två gånger.
    expect(blomkål.quantity).toBeNull();
    expect(blomkål.antalRader).toBe(2);
    expect(dadlar.antalRader).toBe(1);
  });

  it('summerar mängder för samma vara — två recept behöver var sin liter', () => {
    expect(utanAntal('Mjölk 2 l\nMjölk 2 l')).toEqual([{ name: 'Mjölk', quantity: 4, unit: 'l' }]);
    expect(utanAntal('Mjölk 1 l\nMjölk 2 l')).toEqual([{ name: 'Mjölk', quantity: 3, unit: 'l' }]);
  });

  it('håller isär olika enheter', () => {
    expect(utanAntal('Mjölk 2 l\nMjölk 5 dl')).toEqual([
      { name: 'Mjölk', quantity: 2, unit: 'l' },
      { name: 'Mjölk', quantity: 5, unit: 'dl' },
    ]);
  });

  it('stannar vid taket och säger till', () => {
    const text = Array.from({ length: MAX_VAROR + 20 }, (_, i) => `vara${i}x`).join('\n');
    const { varor, kapad } = tolkaInköpslista(text);
    expect(varor).toHaveLength(MAX_VAROR);
    expect(kapad).toBe(true);
  });

  it('kapad är false under taket', () => {
    expect(tolkaInköpslista('mjölk\nbröd').kapad).toBe(false);
  });
});
