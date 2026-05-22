export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'custom_days' | 'monthly' | 'yearly';

export interface ScheduleEntry {
  id: string;
  householdId: string;
  title: string;
  emoji: string | null;
  description: string | null;
  day: WeekDay;
  startTime: string | null;
  endTime: string | null;
  assignedTo: string | null;
  assignedToMany: string[];
  isShared: boolean;
  remind: boolean;
  recurrenceType: RecurrenceType;
  recurrenceDays: WeekDay[];
  recurrenceWeeks: number;
  monthlyType: string;
  recurrenceWeekOfMonth: number | null;
  exceptions: string[];
  startDate: string | null;
  endDate: string | null;
  createdBy: string;
}
