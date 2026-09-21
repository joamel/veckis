import { describe, it, expect } from 'vitest';
import { normalisera, utanMellanslag, avstånd, ärSammaVara, ärPluralform } from './likhet';

describe('normalisera', () => {
  it('struntar i ordföljd och skiljetecken', () => {
    expect(normalisera('kycklingfond, koncentrerad')).toBe(normalisera('koncentrerad kycklingfond'));
  });
});

describe('utanMellanslag', () => {
  it('fångar ihopskrivningar', () => {
    expect(utanMellanslag('vitlöksklyftorfinhackade')).toBe(utanMellanslag('vitlöksklyftor finhackade'));
  });
});

describe('avstånd', () => {
  it('räknar redigeringar', () => {
    expect(avstånd('koncentrierad', 'konzentrierad')).toBe(1);
    expect(avstånd('lök', 'lok')).toBe(1);
    expect(avstånd('', 'abc')).toBe(3);
  });
});

describe('ärSammaVara', () => {
  it('slår ihop stavfel i långa ord', () => {
    expect(ärSammaVara('koncentrierad kycklingfond', 'konzentrierad kycklingfond')).toBe(true);
    expect(ärSammaVara('kycklingfond, koncentrerad', 'koncentrerad kycklingfond')).toBe(true);
    expect(ärSammaVara('vitlöksklyftorfinhackade', 'vitlöksklyftor finhackade')).toBe(true);
  });

  it('slår ihop singular och plural', () => {
    // Ordförrådet ska vara singular; visningen pluraliserar själv.
    expect(ärSammaVara('vårlök', 'vårlökar')).toBe(true);
    expect(ärSammaVara('tomat', 'tomater')).toBe(true);
    expect(ärSammaVara('äpple', 'äpplen')).toBe(true);
    expect(ärSammaVara('rödlök', 'rödlökar')).toBe(true);
  });

  it('slår INTE ihop korta ord som skiljer sig', () => {
    // Ett tecken i ett kort ord är oftast en annan vara, inte ett stavfel.
    expect(ärSammaVara('lök', 'lok')).toBe(false);
    expect(ärSammaVara('ris', 'ris kokt')).toBe(false);
  });

  it('slår inte ihop olika varor som råkar likna varandra', () => {
    expect(ärSammaVara('kycklingfilé', 'kalkonfilé')).toBe(false);
    expect(ärSammaVara('vetemjöl', 'rågmjöl')).toBe(false);
  });
});
