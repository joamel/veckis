import { describe, it, expect } from 'vitest';
import { hittaMinuter, formateraNedräkning, formateraTidsetikett } from './cookTimer';

describe('hittaMinuter', () => {
  it('hittar minuter i vanliga steg', () => {
    expect(hittaMinuter('Låt koka 10 min')).toBe(10);
    expect(hittaMinuter('Sjud i 25 minuter under lock')).toBe(25);
    expect(hittaMinuter('Stek 3 minut per sida')).toBe(3);
  });

  it('räknar om timmar till minuter', () => {
    expect(hittaMinuter('Låt jäsa 1 timme')).toBe(60);
    expect(hittaMinuter('I ugnen 1,5 timmar')).toBe(90);
    expect(hittaMinuter('Grädda 2 tim')).toBe(120);
  });

  it('tar det LÄGRE värdet i ett intervall', () => {
    // Man vill titta till maten när den tidigast kan vara klar.
    expect(hittaMinuter('Grädda 20-25 min')).toBe(20);
    expect(hittaMinuter('Grädda 20–25 minuter')).toBe(20);
  });

  it('ger null när steget inte nämner någon tid', () => {
    expect(hittaMinuter('Hacka löken fint')).toBeNull();
    expect(hittaMinuter('Servera genast')).toBeNull();
  });

  it('ignorerar tider som inte är spistimers', () => {
    // Jäsning över natten är ingen nedräkning man står och väntar på.
    expect(hittaMinuter('Låt stå i kylen 48 timmar')).toBeNull();
    expect(hittaMinuter('Koka 0 min')).toBeNull();
  });

  it('luras inte av siffror utan tidsenhet', () => {
    expect(hittaMinuter('Tillsätt 200 g smör')).toBeNull();
    expect(hittaMinuter('Sätt ugnen på 200 grader')).toBeNull();
  });
});

describe('formatering', () => {
  it('formaterar nedräkning som m:ss', () => {
    expect(formateraNedräkning(545)).toBe('9:05');
    expect(formateraNedräkning(60)).toBe('1:00');
    expect(formateraNedräkning(0)).toBe('0:00');
    expect(formateraNedräkning(-3)).toBe('0:00');
  });

  it('formaterar knappetiketten', () => {
    expect(formateraTidsetikett(10)).toBe('10 min');
    expect(formateraTidsetikett(60)).toBe('1 h');
    expect(formateraTidsetikett(90)).toBe('1 h 30 min');
  });
});
