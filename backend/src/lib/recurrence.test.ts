import { describe, expect, it } from 'vitest';
import { occursOn, type RecurrencePattern } from '@veckis/shared';

const d = (s: string) => new Date(s + 'T00:00:00');

describe('occursOn — none', () => {
  it('matches only on the exact startDate', () => {
    const p: RecurrencePattern = { recurrenceType: 'none', startDate: '2026-05-15' };
    expect(occursOn(p, d('2026-05-15'))).toBe(true);
    expect(occursOn(p, d('2026-05-16'))).toBe(false);
    expect(occursOn(p, d('2026-05-14'))).toBe(false);
  });
});

describe('occursOn — daily', () => {
  it('every day from startDate', () => {
    const p: RecurrencePattern = { recurrenceType: 'daily', startDate: '2026-05-15' };
    expect(occursOn(p, d('2026-05-15'))).toBe(true);
    expect(occursOn(p, d('2026-05-16'))).toBe(true);
    expect(occursOn(p, d('2026-05-30'))).toBe(true);
  });
  it('before startDate does not occur', () => {
    const p: RecurrencePattern = { recurrenceType: 'daily', startDate: '2026-05-15' };
    expect(occursOn(p, d('2026-05-14'))).toBe(false);
  });
  it('respects endDate', () => {
    const p: RecurrencePattern = { recurrenceType: 'daily', startDate: '2026-05-15', endDate: '2026-05-20' };
    expect(occursOn(p, d('2026-05-20'))).toBe(true);
    expect(occursOn(p, d('2026-05-21'))).toBe(false);
  });
  it('every 3rd day', () => {
    const p: RecurrencePattern = { recurrenceType: 'daily', recurrenceWeeks: 3, startDate: '2026-05-15' };
    expect(occursOn(p, d('2026-05-15'))).toBe(true);
    expect(occursOn(p, d('2026-05-16'))).toBe(false);
    expect(occursOn(p, d('2026-05-18'))).toBe(true);
    expect(occursOn(p, d('2026-05-21'))).toBe(true);
  });
});

describe('occursOn — weekly', () => {
  it('matches weekdays in recurrenceDays', () => {
    const p: RecurrencePattern = { recurrenceType: 'weekly', recurrenceDays: ['mon', 'wed'], startDate: '2026-05-11' };
    expect(occursOn(p, d('2026-05-11'))).toBe(true); // Monday
    expect(occursOn(p, d('2026-05-12'))).toBe(false); // Tuesday
    expect(occursOn(p, d('2026-05-13'))).toBe(true); // Wednesday
    expect(occursOn(p, d('2026-05-18'))).toBe(true); // Next Monday
  });

  it('empty recurrenceDays never occurs', () => {
    const p: RecurrencePattern = { recurrenceType: 'weekly', recurrenceDays: [], startDate: '2026-05-11' };
    expect(occursOn(p, d('2026-05-11'))).toBe(false);
  });

  it('biweekly skips alternating weeks', () => {
    const p: RecurrencePattern = { recurrenceType: 'weekly', recurrenceWeeks: 2, recurrenceDays: ['mon'], startDate: '2026-05-11' };
    expect(occursOn(p, d('2026-05-11'))).toBe(true);  // week 0
    expect(occursOn(p, d('2026-05-18'))).toBe(false); // week 1
    expect(occursOn(p, d('2026-05-25'))).toBe(true);  // week 2
  });
});

describe('occursOn — monthly day_of_month', () => {
  it('first of every month (the user-reported bug)', () => {
    const p: RecurrencePattern = {
      recurrenceType: 'monthly',
      monthlyType: 'day_of_month',
      startDate: '2026-05-01',
    };
    expect(occursOn(p, d('2026-05-01'))).toBe(true);
    expect(occursOn(p, d('2026-05-02'))).toBe(false);
    expect(occursOn(p, d('2026-06-01'))).toBe(true);
    expect(occursOn(p, d('2026-07-01'))).toBe(true);
    expect(occursOn(p, d('2026-12-01'))).toBe(true);
    expect(occursOn(p, d('2027-01-01'))).toBe(true);
  });

  it('15th of every month', () => {
    const p: RecurrencePattern = { recurrenceType: 'monthly', monthlyType: 'day_of_month', startDate: '2026-05-15' };
    expect(occursOn(p, d('2026-05-15'))).toBe(true);
    expect(occursOn(p, d('2026-06-15'))).toBe(true);
    expect(occursOn(p, d('2026-06-14'))).toBe(false);
  });

  it('every other month', () => {
    const p: RecurrencePattern = {
      recurrenceType: 'monthly',
      monthlyType: 'day_of_month',
      recurrenceWeeks: 2,
      startDate: '2026-05-15',
    };
    expect(occursOn(p, d('2026-05-15'))).toBe(true);
    expect(occursOn(p, d('2026-06-15'))).toBe(false);
    expect(occursOn(p, d('2026-07-15'))).toBe(true);
  });

  it('does not match months before startDate', () => {
    const p: RecurrencePattern = { recurrenceType: 'monthly', monthlyType: 'day_of_month', startDate: '2026-05-15' };
    expect(occursOn(p, d('2026-04-15'))).toBe(false);
  });
});

describe('occursOn — monthly weekday_of_month', () => {
  it('second Monday of each month', () => {
    // 2026-05-11 is the second Monday of May 2026.
    const p: RecurrencePattern = {
      recurrenceType: 'monthly',
      monthlyType: 'weekday_of_month',
      recurrenceWeekOfMonth: 2,
      startDate: '2026-05-11',
    };
    expect(occursOn(p, d('2026-05-11'))).toBe(true);
    expect(occursOn(p, d('2026-05-18'))).toBe(false); // third Monday
    expect(occursOn(p, d('2026-05-04'))).toBe(false); // first Monday
    // 2026-06-08 is the second Monday of June 2026.
    expect(occursOn(p, d('2026-06-08'))).toBe(true);
    expect(occursOn(p, d('2026-06-01'))).toBe(false); // first Monday of June
  });

  it('first Friday of each month', () => {
    const p: RecurrencePattern = {
      recurrenceType: 'monthly',
      monthlyType: 'weekday_of_month',
      recurrenceWeekOfMonth: 1,
      startDate: '2026-05-01', // first Friday of May 2026
    };
    expect(occursOn(p, d('2026-05-01'))).toBe(true);
    expect(occursOn(p, d('2026-06-05'))).toBe(true);
    expect(occursOn(p, d('2026-06-12'))).toBe(false); // second Friday
  });
});

describe('occursOn — yearly', () => {
  it('same month+day each year', () => {
    const p: RecurrencePattern = { recurrenceType: 'yearly', startDate: '2026-05-15' };
    expect(occursOn(p, d('2026-05-15'))).toBe(true);
    expect(occursOn(p, d('2027-05-15'))).toBe(true);
    expect(occursOn(p, d('2027-05-16'))).toBe(false);
  });
});
