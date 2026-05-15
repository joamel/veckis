export function getISOWeek(date: Date): { weekYear: number; weekNumber: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNumber =
    1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { weekYear: d.getFullYear(), weekNumber };
}

export function addWeeks(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n * 7);
  return d;
}

// Returns the Monday (00:00 local) of the given ISO week
export function getISOWeekMonday(weekYear: number, weekNumber: number): Date {
  // Jan 4 is always in week 1 per ISO 8601
  const jan4 = new Date(weekYear, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7; // Monday = 0
  const week1Monday = new Date(weekYear, 0, 4 - jan4Day);
  const target = new Date(week1Monday);
  target.setDate(week1Monday.getDate() + (weekNumber - 1) * 7);
  target.setHours(0, 0, 0, 0);
  return target;
}
