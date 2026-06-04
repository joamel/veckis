import { describe, it, expect } from 'vitest';
import { getISOWeek, addWeeks, getISOWeekMonday } from './week';

// ISO 8601-vecka är klassisk källa till off-by-one-buggar — vecka 1 ska
// innehålla 4:e januari, vecka 53 finns bara vissa år (varje 5-6 år), och
// januari-dagar kan tillhöra föregående år. Vi testar både normala och
// kritiska gränsfall.

describe('getISOWeek', () => {
  it('mitten av året — vecka 30 år 2024 (måndag 22 juli)', () => {
    const { weekYear, weekNumber } = getISOWeek(new Date(2024, 6, 22));
    expect(weekYear).toBe(2024);
    expect(weekNumber).toBe(30);
  });

  it('1 januari 2024 (måndag) — vecka 1 / 2024', () => {
    const { weekYear, weekNumber } = getISOWeek(new Date(2024, 0, 1));
    expect(weekYear).toBe(2024);
    expect(weekNumber).toBe(1);
  });

  it('1 januari 2023 (söndag) tillhör vecka 52 / 2022', () => {
    const { weekYear, weekNumber } = getISOWeek(new Date(2023, 0, 1));
    expect(weekYear).toBe(2022);
    expect(weekNumber).toBe(52);
  });

  it('31 december 2024 (tisdag) tillhör vecka 1 / 2025', () => {
    const { weekYear, weekNumber } = getISOWeek(new Date(2024, 11, 31));
    expect(weekYear).toBe(2025);
    expect(weekNumber).toBe(1);
  });

  it('2020 har vecka 53 (4 januari 2021, måndag)', () => {
    // 2020 startade med torsdag → kort vecka 53 finns
    const { weekYear, weekNumber } = getISOWeek(new Date(2020, 11, 28));
    expect(weekYear).toBe(2020);
    expect(weekNumber).toBe(53);
  });

  it('4 januari är alltid i vecka 1', () => {
    // ISO 8601-regel: vecka 1 är veckan som innehåller 4:e januari
    for (const year of [2020, 2021, 2022, 2023, 2024, 2025]) {
      const { weekYear, weekNumber } = getISOWeek(new Date(year, 0, 4));
      expect(weekYear).toBe(year);
      expect(weekNumber).toBe(1);
    }
  });
});

// Hjälpare som jämför lokala datum-komponenter (år/månad/dag). Vi undviker
// .toISOString() här eftersom den konverterar till UTC och kan skifta dagen
// beroende på tidszon — tester ska vara stabila oavsett var de körs.
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('addWeeks', () => {
  it('lägger till 1 vecka', () => {
    const result = addWeeks(new Date(2024, 0, 1), 1);
    expect(ymd(result)).toBe('2024-01-08');
  });

  it('drar bort 2 veckor', () => {
    const result = addWeeks(new Date(2024, 0, 15), -2);
    expect(ymd(result)).toBe('2024-01-01');
  });

  it('hoppar över årsskiftet', () => {
    const result = addWeeks(new Date(2024, 11, 30), 2);
    expect(ymd(result)).toBe('2025-01-13');
  });

  it('mutar inte input-datumet', () => {
    const input = new Date(2024, 0, 1);
    addWeeks(input, 5);
    expect(input.getTime()).toBe(new Date(2024, 0, 1).getTime());
  });
});

describe('getISOWeekMonday', () => {
  it('vecka 1 / 2024 = måndag 1 januari', () => {
    const monday = getISOWeekMonday(2024, 1);
    expect(monday.getFullYear()).toBe(2024);
    expect(monday.getMonth()).toBe(0);
    expect(monday.getDate()).toBe(1);
    expect(monday.getDay()).toBe(1); // 1 = monday
  });

  it('vecka 1 / 2023 = måndag 2 januari (eftersom 1 jan 2023 var söndag i v52 / 2022)', () => {
    const monday = getISOWeekMonday(2023, 1);
    expect(monday.getDate()).toBe(2);
    expect(monday.getMonth()).toBe(0);
    expect(monday.getDay()).toBe(1);
  });

  it('returnerar alltid en måndag', () => {
    for (const week of [1, 10, 26, 52]) {
      const monday = getISOWeekMonday(2024, week);
      expect(monday.getDay()).toBe(1);
    }
  });

  it('sätter tiden till 00:00 lokalt', () => {
    const monday = getISOWeekMonday(2024, 10);
    expect(monday.getHours()).toBe(0);
    expect(monday.getMinutes()).toBe(0);
    expect(monday.getSeconds()).toBe(0);
    expect(monday.getMilliseconds()).toBe(0);
  });
});
