import { occursOn, weekdayOf, type RecurrencePattern } from '@veckis/shared';
import type { WeekDay } from '@prisma/client';
import { prisma } from '../db';
import { sendPush, claimNotification } from './sendPush';

// Local timezone all household members are assumed to live in. Activity start
// times ("HH:MM") and "today" are interpreted in this zone, not the server's.
const TIMEZONE = 'Europe/Stockholm';

// Overdue-chore reminders fire once per day, at/after this local hour.
const CHORE_REMINDER_HOUR = 18;

// How often the scheduler wakes. 5 min keeps DB wake-ups low on serverless
// Postgres (Neon) — fine since reminder windows are minutes wide.
const TICK_MS = 5 * 60 * 1000;

// Quiet hours [QUIET_START, 24) ∪ [0, QUIET_END) in local time — the scheduler
// does no DB work then, so the database can stay suspended overnight.
const QUIET_START_HOUR = 23;
const QUIET_END_HOUR = 7;

function inQuietHours(minutesOfDay: number): boolean {
  const h = Math.floor(minutesOfDay / 60);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

interface LocalNow {
  date: Date;        // local date (time stripped) — for occursOn/weekday math
  dateStr: string;   // YYYY-MM-DD in TIMEZONE
  minutesOfDay: number; // local hour*60 + minute
}

function localNow(): LocalNow {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0');
  const y = get('year'), mo = get('month'), d = get('day');
  const h = get('hour'), mi = get('minute');
  return {
    date: new Date(y, mo - 1, d),
    dateStr: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    minutesOfDay: h * 60 + mi,
  };
}

function entryOccursToday(
  e: { day: WeekDay; recurrenceType: string; recurrenceDays: WeekDay[]; recurrenceWeeks: number;
       monthlyType: string; recurrenceWeekOfMonth: number | null; startDate: string | null;
       endDate: string | null; exceptions: string[] },
  now: LocalNow,
): boolean {
  if (e.exceptions.includes(now.dateStr)) return false;
  if (e.startDate && now.dateStr < e.startDate) return false;
  if (e.endDate && now.dateStr > e.endDate) return false;
  if (e.recurrenceType === 'none') {
    return weekdayOf(now.date) === (e.day as unknown as ReturnType<typeof weekdayOf>);
  }
  const days = e.recurrenceDays.length ? e.recurrenceDays : [e.day];
  const pattern: RecurrencePattern = {
    recurrenceType: e.recurrenceType as RecurrencePattern['recurrenceType'],
    recurrenceWeeks: e.recurrenceWeeks,
    recurrenceDays: days as RecurrencePattern['recurrenceDays'],
    monthlyType: e.monthlyType,
    recurrenceWeekOfMonth: e.recurrenceWeekOfMonth,
    startDate: e.startDate,
    endDate: e.endDate,
  };
  return occursOn(pattern, now.date);
}

function chorePattern(c: {
  frequency: string; days: WeekDay[]; recurrenceType: string; recurrenceWeeks: number;
  monthlyType: string; recurrenceWeekOfMonth: number | null; startDate: string | null; endDate: string | null;
}): RecurrencePattern {
  // Legacy chores stored cadence in `frequency` before recurrenceType existed.
  let rt = c.recurrenceType;
  if (rt === 'none') {
    if (c.frequency === 'daily') rt = 'daily';
    else if (c.frequency === 'weekly' || c.frequency === 'biweekly') rt = 'weekly';
    else if (c.frequency === 'monthly') rt = 'monthly';
  }
  return {
    recurrenceType: rt as RecurrencePattern['recurrenceType'],
    recurrenceWeeks: c.recurrenceWeeks || (c.frequency === 'biweekly' ? 2 : 1),
    recurrenceDays: c.days as RecurrencePattern['recurrenceDays'],
    monthlyType: c.monthlyType,
    recurrenceWeekOfMonth: c.recurrenceWeekOfMonth,
    startDate: c.startDate,
    endDate: c.endDate,
  };
}

async function runActivityReminders(now: LocalNow): Promise<void> {
  const entries = await prisma.scheduleEntry.findMany({ where: { startTime: { not: null }, remind: true } });
  const todays = entries.filter(e => entryOccursToday(e, now));
  if (todays.length === 0) return;

  const householdIds = [...new Set(todays.map(e => e.householdId))];
  const members = await prisma.householdMember.findMany({ where: { householdId: { in: householdIds } } });
  // householdId -> (memberId -> clerkUserId) and householdId -> all clerk ids
  const memberClerk = new Map<string, string>();
  const householdClerks = new Map<string, string[]>();
  for (const m of members) {
    if (m.clerkUserId) {
      memberClerk.set(m.id, m.clerkUserId);
      const arr = householdClerks.get(m.householdId) ?? [];
      arr.push(m.clerkUserId);
      householdClerks.set(m.householdId, arr);
    }
  }

  const prefs = await prisma.notificationPreference.findMany();
  const reminderMin = new Map(prefs.map(p => [p.clerkUserId, p.reminderMinutes]));

  for (const e of todays) {
    const [h, mi] = (e.startTime ?? '00:00').split(':').map(Number);
    const startMin = h * 60 + mi;
    const delta = startMin - now.minutesOfDay; // minutes until start
    if (delta < 0) continue; // already started

    const assignedIds = [...new Set([...(e.assignedToMany ?? []), ...(e.assignedTo ? [e.assignedTo] : [])])];
    let recipients = assignedIds.map(id => memberClerk.get(id)).filter((x): x is string => !!x);
    if (recipients.length === 0 && e.isShared) recipients = householdClerks.get(e.householdId) ?? [];
    recipients = [...new Set(recipients)];

    for (const userId of recipients) {
      const window = reminderMin.get(userId) ?? 30;
      if (delta > window) continue;
      const key = `activity:${e.id}:${now.dateStr}:${userId}`;
      if (await claimNotification(key)) {
        const when = delta <= 0 ? 'nu' : `om ${delta} min`;
        await sendPush([userId], 'activityReminder', {
          title: `${e.emoji ? e.emoji + ' ' : ''}${e.title}`,
          body: `Börjar ${when} (${e.startTime})`,
          data: { type: 'activityReminder', entryId: e.id },
        });
      }
    }
  }
}

async function runOverdueChores(now: LocalNow): Promise<void> {
  // Once a day, after the reminder hour, nudge about chores still not done today.
  if (now.minutesOfDay < CHORE_REMINDER_HOUR * 60) return;

  const chores = await prisma.chore.findMany({ include: { completions: true } });
  const due = chores.filter(c => occursOn(chorePattern(c), now.date));
  if (due.length === 0) return;

  const wday = weekdayOf(now.date);
  const isDoneToday = (c: (typeof due)[number]) =>
    c.completions.some(comp => comp.date === now.dateStr || (comp.date == null && comp.day === wday));

  const householdIds = [...new Set(due.map(c => c.householdId))];
  const members = await prisma.householdMember.findMany({ where: { householdId: { in: householdIds } } });
  const memberClerk = new Map<string, string>();
  const householdClerks = new Map<string, string[]>();
  for (const m of members) {
    if (m.clerkUserId) {
      memberClerk.set(m.id, m.clerkUserId);
      const arr = householdClerks.get(m.householdId) ?? [];
      arr.push(m.clerkUserId);
      householdClerks.set(m.householdId, arr);
    }
  }

  for (const c of due) {
    if (isDoneToday(c)) continue;
    let recipients = c.assignedTo ? [memberClerk.get(c.assignedTo)].filter((x): x is string => !!x) : [];
    if (recipients.length === 0 && c.isShared) recipients = householdClerks.get(c.householdId) ?? [];
    recipients = [...new Set(recipients)];

    for (const userId of recipients) {
      // Forgiving model: exactly one gentle nudge per occurrence (dedupe key is
      // chore+date) and only on the occurrence's own day — so a missed chore is
      // never nagged about on the following days; it just quietly returns next
      // time. No accumulating "overdue" guilt pile.
      const key = `chore:${c.id}:${now.dateStr}:${userId}`;
      if (await claimNotification(key)) {
        await sendPush([userId], 'choreOverdue', {
          title: `${c.emoji ? c.emoji + ' ' : ''}${c.title}`,
          body: 'Hinner du med den idag? Annars ingen stress – den kommer tillbaka.',
          data: { type: 'choreOverdue', choreId: c.id },
        });
      }
    }
  }
}

async function tick(): Promise<void> {
  const now = localNow();
  // Skip overnight so a serverless DB can stay suspended.
  if (inQuietHours(now.minutesOfDay)) return;
  try {
    await runActivityReminders(now);
    await runOverdueChores(now);
    // Prune the dedupe ledger ~once a day (first tick after the chore-reminder
    // hour). Keys are date-scoped, so rows older than a few days are dead weight.
    if (Math.floor(now.minutesOfDay / 60) === CHORE_REMINDER_HOUR && now.minutesOfDay % 60 < 5) {
      const cutoff = new Date(Date.now() - 3 * 86400000);
      await prisma.notificationLog.deleteMany({ where: { sentAt: { lt: cutoff } } });
    }
  } catch (err) {
    console.error('notificationScheduler tick error:', err instanceof Error ? err.message : err);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Starts the once-a-minute notification scheduler. Idempotent. */
export function startNotificationScheduler(): void {
  if (timer) return;
  timer = setInterval(() => { void tick(); }, TICK_MS);
  void tick(); // run immediately on boot
  console.log('Notification scheduler started');
}
