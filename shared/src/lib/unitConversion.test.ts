import { describe, it, expect } from 'vitest';
import { convertToMetric, isConvertibleUnit, tillSvenskEnhet } from './unitConversion';


describe('tillSvenskEnhet', () => {
  it('konverterar engelska enheter', () => {
    expect(tillSvenskEnhet(0.75, 'teaspoon')).toEqual({ quantity: 0.75, unit: 'tsk' });
    // 4,7 — cup-faktorn är den exakta 2,366, samma som 1 pint ger.
    expect(tillSvenskEnhet(2, 'cups')).toEqual({ quantity: 4.7, unit: 'dl' });
    expect(tillSvenskEnhet(8, 'oz')).toEqual({ quantity: 227, unit: 'g' });
  });

  it('ger enheten även utan mängd', () => {
    // En basvara har ofta ingen standardmängd, men enheten ska ändå bli svensk.
    expect(tillSvenskEnhet(null, 'teaspoon')).toEqual({ quantity: null, unit: 'tsk' });
  });

  it('lämnar svenska och okända enheter ifred', () => {
    expect(tillSvenskEnhet(2, 'dl')).toEqual({ quantity: 2, unit: 'dl' });
    expect(tillSvenskEnhet(1, 'påse')).toEqual({ quantity: 1, unit: 'påse' });
    expect(tillSvenskEnhet(3, null)).toEqual({ quantity: 3, unit: null });
  });
});

describe('massa och volym hålls isär', () => {
  it('räknar aldrig om vikt till volym eller tvärtom', () => {
    // 200 grams är 200 g — samma dimension, bara ett annat ord.
    expect(tillSvenskEnhet(200, 'grams')).toEqual({ quantity: 200, unit: 'g' });
    expect(tillSvenskEnhet(1, 'kilograms')).toEqual({ quantity: 1, unit: 'kg' });
    // Massa stannar i massa, volym i volym.
    expect(tillSvenskEnhet(8, 'oz').unit).toBe('g');
    expect(tillSvenskEnhet(2, 'cups').unit).toBe('dl');
    expect(tillSvenskEnhet(1, 'pint').unit).toBe('dl');
    expect(tillSvenskEnhet(3, 'lbs').unit).toBe('kg');
  });

  it('kortar svenska enhetsord till sin kanoniska form', () => {
    // Tidigare lämnades "gram" och "liter" orörda, med motiveringen att de
    // redan var svenska. Men då blev samma enhet två i databasen: "200 gram"
    // och "200 g" är samma sak men slogs inte ihop, och ordförrådet fick två
    // varianter. Mängden räknas INTE om — bara stavningen väljs (se
    // unitSynonyms.ts).
    expect(tillSvenskEnhet(200, 'gram')).toEqual({ quantity: 200, unit: 'g' });
    expect(tillSvenskEnhet(1, 'liter')).toEqual({ quantity: 1, unit: 'l' });
    expect(tillSvenskEnhet(2, 'deciliter')).toEqual({ quantity: 2, unit: 'dl' });
    expect(tillSvenskEnhet(3, 'förpackningar')).toEqual({ quantity: 3, unit: 'förp' });
  });
});
