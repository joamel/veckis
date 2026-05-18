import type { RecurrenceType, WeekDay } from '../types/schedule';

const WEEKDAYS: WeekDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface RecurrencePattern {
  recurrenceType: RecurrenceType;
  recurrenceWeeks?: number | null;
  recurrenceDays?: WeekDay[];
  monthlyType?: string | null; // 'day_of_month' | 'weekday_of_month'
  recurrenceWeekOfMonth?: number | null;
  startDate?: string | null; // YYYY-MM-DD
  endDate?: string | null;
}

export function weekdayOf(date: Date): WeekDay {
  return WEEKDAYS[date.getDay()];
}

function toIsoDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function daysBetween(a: Date, b: Date): number {
  const MS = 86400000;
  // Strip time-of-day so we count whole days.
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((b0 - a0) / MS);
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function weekOfMonth(date: Date): number {
  // 1-indexed: which Nth occurrence of this weekday is `date` in its month?
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

/**
 * Returns true if the given recurrence pattern occurs on `date`.
 * Pure function — no React Native dependencies. Same logic works on backend.
 *
 * Patterns supported:
 *  - 'none'        : never occurs on a recurring schedule (use startDate=date for one-off)
 *  - 'daily'       : every recurrenceWeeks (default 1) days from startDate
 *  - 'weekly'      : every recurrenceWeeks (default 1) weeks, on each weekday in recurrenceDays
 *  - 'custom_days' : same as weekly
 *  - 'monthly'     : every recurrenceWeeks (default 1) months from startDate, anchored on
 *                    either day-of-month or Nth weekday of month
 *  - 'yearly'      : every recurrenceWeeks (default 1) years, on the same month+day as startDate
 */
export function occursOn(pattern: RecurrencePattern, date: Date): boolean {
  const dateStr = toIsoDateStr(date);
  if (pattern.startDate && dateStr < pattern.startDate) return false;
  if (pattern.endDate && dateStr > pattern.endDate) return false;

  const interval = Math.max(1, pattern.recurrenceWeeks ?? 1);
  const anchor = pattern.startDate ? parseIsoDate(pattern.startDate) : null;

  switch (pattern.recurrenceType) {
    case 'none':
      // A non-recurring item "occurs" only on its startDate (if any).
      return anchor != null && toIsoDateStr(anchor) === dateStr;

    case 'daily': {
      if (!anchor) return true;
      const diff = daysBetween(anchor, date);
      return diff >= 0 && diff % interval === 0;
    }

    case 'weekly':
    case 'custom_days': {
      const wday = weekdayOf(date);
      if (!pattern.recurrenceDays || pattern.recurrenceDays.length === 0) return false;
      if (!pattern.recurrenceDays.includes(wday)) return false;
      if (interval === 1) return true;
      if (!anchor) return true;
      // Compare ISO week boundaries by computing the Monday of each week.
      const mondayOf = (d: Date): Date => {
        const day = d.getDay() === 0 ? 7 : d.getDay();
        const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        m.setDate(m.getDate() - (day - 1));
        return m;
      };
      const weeksDiff = Math.floor(daysBetween(mondayOf(anchor), mondayOf(date)) / 7);
      return weeksDiff >= 0 && weeksDiff % interval === 0;
    }

    case 'monthly': {
      if (!anchor) return false;
      const monthsDiff = monthsBetween(anchor, date);
      if (monthsDiff < 0 || monthsDiff % interval !== 0) return false;
      if (pattern.monthlyType === 'weekday_of_month') {
        const targetWeekday = weekdayOf(anchor);
        if (weekdayOf(date) !== targetWeekday) return false;
        const targetWeek = pattern.recurrenceWeekOfMonth ?? weekOfMonth(anchor);
        return weekOfMonth(date) === targetWeek;
      }
      // Default: day_of_month
      return date.getDate() === anchor.getDate();
    }

    case 'yearly': {
      if (!anchor) return false;
      const yearsDiff = date.getFullYear() - anchor.getFullYear();
      if (yearsDiff < 0 || yearsDiff % interval !== 0) return false;
      return date.getMonth() === anchor.getMonth() && date.getDate() === anchor.getDate();
    }

    default:
      return false;
  }
}
