export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

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
  recurrenceWeeks: number;
  createdBy: string;
}
