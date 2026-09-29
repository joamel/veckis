import { describe, expect, it } from 'vitest';
import { cleanPastedUrl, extractUrl } from './extractUrl';

describe('extractUrl', () => {
  it('tar bort receptnamnet som ICA lägger före länken', () => {
    expect(extractUrl('Krämig kycklinggryta med curry https://www.ica.se/recept/kramig-kycklinggryta-722108/'))
      .toBe('https://www.ica.se/recept/kramig-kycklinggryta-722108/');
  });

  it('klarar radbrytning mellan text och länk, och text efter länken', () => {
    expect(extractUrl('Pasta carbonara\nhttps://www.ica.se/recept/pasta-carbonara-1/\nDelat från ICA'))
      .toBe('https://www.ica.se/recept/pasta-carbonara-1/');
  });

  it('lämnar en ren länk orörd, och tar bort skiljetecken som hänger med', () => {
    expect(extractUrl('  https://example.com/recept  ')).toBe('https://example.com/recept');
    expect(extractUrl('Se här: https://example.com/recept.')).toBe('https://example.com/recept');
    expect(extractUrl('(http://example.com/a)')).toBe('http://example.com/a');
  });

  it('tar den första länken när det finns flera', () => {
    expect(extractUrl('https://a.se/1 och https://b.se/2')).toBe('https://a.se/1');
  });

  it('ger tillbaka texten trimmad när ingen länk finns', () => {
    expect(extractUrl('  www.ica.se/recept  ')).toBe('www.ica.se/recept');
  });
});

describe('cleanPastedUrl', () => {
  it('rensar inklistrad text runt en länk', () => {
    expect(cleanPastedUrl('Kycklinggryta https://www.ica.se/recept/x-1/')).toBe('https://www.ica.se/recept/x-1/');
  });

  it('rör inte en adress man håller på att skriva', () => {
    expect(cleanPastedUrl('https://www.ica.')).toBe('https://www.ica.');
    expect(cleanPastedUrl('https://www.ica.se/recept/ ')).toBe('https://www.ica.se/recept/ ');
  });
});
