import { describe, it, expect } from 'vitest';
import { convertUnitsInText, fahrenheitToCelsius } from './instructionUnits';

describe('fahrenheitToCelsius', () => {
  it('räknar om till närmaste femtal', () => {
    expect(fahrenheitToCelsius(350)).toBe(175);
    expect(fahrenheitToCelsius(400)).toBe(205);
    expect(fahrenheitToCelsius(425)).toBe(220);
    expect(fahrenheitToCelsius(212)).toBe(100);
    expect(fahrenheitToCelsius(32)).toBe(0);
  });
});

describe('convertUnitsInText', () => {
  it('byter temperaturer oavsett skrivsätt', () => {
    expect(convertUnitsInText('Preheat oven to 350°F.')).toBe('Preheat oven to 175 °C.');
    expect(convertUnitsInText('Baka i 400 °F i 20 minuter')).toBe('Baka i 205 °C i 20 minuter');
    expect(convertUnitsInText('Heat to 425 degrees F')).toBe('Heat to 220 °C');
    expect(convertUnitsInText('Heat to 425 degrees Fahrenheit')).toBe('Heat to 220 °C');
  });

  it('byter amerikanska mått', () => {
    expect(convertUnitsInText('Add 2 cups flour')).toContain('dl flour');
    expect(convertUnitsInText('Add 1 tablespoon sugar')).toContain('msk sugar');
    expect(convertUnitsInText('Add 1 1/2 cups milk')).toContain('dl milk');
  });

  it('rör inte svensk text', () => {
    const svensk = 'Sätt ugnen på 200 °C. Tillsätt 2 dl mjölk och 1 msk smör.';
    expect(convertUnitsInText(svensk)).toBe(svensk);
  });

  it('tar inte ett F i vanlig text för en temperatur', () => {
    // Fristående "F" kräver en siffra före; en bokstav i en mening rörs inte.
    expect(convertUnitsInText('Vispa till F-konsistens')).toBe('Vispa till F-konsistens');
    expect(convertUnitsInText('Grädda i 12 minuter')).toBe('Grädda i 12 minuter');
  });

  it('lämnar tal utan enhet i fred', () => {
    expect(convertUnitsInText('Dela degen i 4 delar')).toBe('Dela degen i 4 delar');
  });
});
