import { describe, it, expect } from 'vitest';
import { tolkaIsoVaraktighet, tidUrJsonLd, städaMinuter } from './tillagningstid';

describe('tolkaIsoVaraktighet', () => {
  it('läser timmar och minuter', () => {
    expect(tolkaIsoVaraktighet('PT1H30M')).toBe(90);
    expect(tolkaIsoVaraktighet('PT45M')).toBe(45);
    expect(tolkaIsoVaraktighet('PT2H')).toBe(120);
  });

  it('klarar minuter över 60 och dagdel med noll', () => {
    expect(tolkaIsoVaraktighet('PT90M')).toBe(90);
    expect(tolkaIsoVaraktighet('P0DT1H10M')).toBe(70);
  });

  it('klarar decimaler och gemener', () => {
    expect(tolkaIsoVaraktighet('PT1.5H')).toBe(90);
    expect(tolkaIsoVaraktighet('pt20m')).toBe(20);
  });

  it('avrundar sekunder till hela minuter', () => {
    expect(tolkaIsoVaraktighet('PT10M30S')).toBe(11);
  });

  it('ger null för noll, tomt och skräp', () => {
    expect(tolkaIsoVaraktighet('PT0M')).toBeNull();
    expect(tolkaIsoVaraktighet('PT')).toBeNull();
    expect(tolkaIsoVaraktighet('P')).toBeNull();
    expect(tolkaIsoVaraktighet('')).toBeNull();
    expect(tolkaIsoVaraktighet('30 minuter')).toBeNull();
    expect(tolkaIsoVaraktighet(30)).toBeNull();
    expect(tolkaIsoVaraktighet(undefined)).toBeNull();
  });

  it('ger null över ett dygn — det är jäsning, inte middag', () => {
    expect(tolkaIsoVaraktighet('P2D')).toBeNull();
    expect(tolkaIsoVaraktighet('PT25H')).toBeNull();
  });
});

describe('tidUrJsonLd', () => {
  it('föredrar totalTime', () => {
    expect(tidUrJsonLd({ totalTime: 'PT1H', cookTime: 'PT20M', prepTime: 'PT10M' })).toBe(60);
  });

  it('summerar tillagning och förberedelse utan totalTime', () => {
    expect(tidUrJsonLd({ cookTime: 'PT20M', prepTime: 'PT10M' })).toBe(30);
  });

  it('tar den som finns', () => {
    expect(tidUrJsonLd({ cookTime: 'PT25M' })).toBe(25);
    expect(tidUrJsonLd({ prepTime: 'PT15M' })).toBe(15);
  });

  it('faller tillbaka när totalTime är oläslig', () => {
    expect(tidUrJsonLd({ totalTime: 'PT0M', cookTime: 'PT40M' })).toBe(40);
  });

  it('ger null utan tider', () => {
    expect(tidUrJsonLd({})).toBeNull();
    expect(tidUrJsonLd(null)).toBeNull();
  });
});

describe('städaMinuter', () => {
  it('släpper igenom rimliga tal och avrundar', () => {
    expect(städaMinuter(45)).toBe(45);
    expect(städaMinuter(44.6)).toBe(45);
  });

  it('ger null för annat', () => {
    expect(städaMinuter(0)).toBeNull();
    expect(städaMinuter(-5)).toBeNull();
    expect(städaMinuter('45')).toBeNull();
    expect(städaMinuter(null)).toBeNull();
    expect(städaMinuter(2000)).toBeNull();
  });
});
