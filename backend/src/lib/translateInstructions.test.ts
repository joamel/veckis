import { describe, it, expect } from 'vitest';
import { ärEngelskText, översättInstruktioner } from './translateInstructions';

describe('ärEngelskText', () => {
  it('svensk tillagning med "salt" och "olivolja" är svensk', () => {
    expect(ärEngelskText(
      '1. Koka spaghettin i saltat vatten tills den är al dente.\n'
      + '2. Stek baconet i olivolja. Salt och peppar efter smak.\n'
      + '3. Vispa äggula med grädde och riven västerbottensost, och vänd ner i pastan.',
    )).toBe(false);
  });

  it('"sätt in i ugnen" gör inte texten engelsk', () => {
    expect(ärEngelskText('Sätt in i ugnen i 20 minuter.')).toBe(false);
  });

  it('engelsk tillagning är engelsk', () => {
    expect(ärEngelskText(
      '1. Bring a large pot of salted water to the boil and cook the pasta until al dente.\n'
      + '2. Fry the bacon in olive oil, then add the garlic.',
    )).toBe(true);
  });

  it('ett enstaka engelskt ord avgör inget', () => {
    expect(ärEngelskText('Toppa med bacon.')).toBe(false);
  });
});

describe('översättInstruktioner', () => {
  it('svensk text utan amerikanska mått lämnas utan original', async () => {
    expect(await översättInstruktioner('Koka pastan. Salt och peppar efter smak.')).toBeNull();
  });

  it('svensk text med Fahrenheit räknas om', async () => {
    expect(await översättInstruktioner('Grädda i 400°F i 20 minuter.')).not.toBeNull();
  });
});
