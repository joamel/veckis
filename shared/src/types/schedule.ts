export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'custom_days' | 'monthly';

export interface ScheduleEntry {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  day: WeekDay;
  startTime: string | null;
  endTime: string | null;
  assignedTo: string | null;
  isShared: boolean;
  recurrenceType: RecurrenceType;
  recurrenceDays: WeekDay[];
  recurrenceWeeks: number;
  createdBy: string;
}
