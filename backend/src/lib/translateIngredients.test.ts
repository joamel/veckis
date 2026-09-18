import { describe, it, expect } from 'vitest';
import { serEngelsktUt } from './translateIngredients';

describe('serEngelsktUt', () => {
  it('känner igen engelska receptrader', () => {
    expect(serEngelsktUt(['boneless chicken thighs', 'kosher salt'])).toBe(true);
    expect(serEngelsktUt(['all-purpose flour'])).toBe(true);
    // Markören kan sitta var som helst i namnet, inte bara först.
    expect(serEngelsktUt(['can of chopped tomatoes'])).toBe(true);
  });

  it('lämnar svenska recept ifred', () => {
    expect(serEngelsktUt(['vetemjöl', 'smör', 'kycklingfilé', 'gul lök'])).toBe(false);
    expect(serEngelsktUt([])).toBe(false);
  });

  it('räcker med EN engelsk rad för att hela receptet ska översättas', () => {
    // En engelsk sajt har aldrig bara en engelsk rad, och batchen kostar
    // lika mycket oavsett hur många namn som skickas med.
    expect(serEngelsktUt(['vetemjöl', 'heavy cream'])).toBe(true);
  });

  it('luras inte av svenska ord som innehåller en engelsk markör', () => {
    // "salta" och "oliver" innehåller "salt"/"oli" som delsträngar — gaten
    // matchar hela ord, inte delsträngar.
    expect(serEngelsktUt(['salta jordnötter', 'oliver'])).toBe(false);
  });
});
