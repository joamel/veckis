export type ChoreFrequency = 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface Chore {
  id: string;
  householdId: string;
  title: string;
  emoji: string | null;
  description: string | null;
  frequency: ChoreFrequency;
  assignedTo: string | null;
  days: import('./schedule').WeekDay[];
  isShared: boolean;
  startDate: string | null;
  endDate: string | null;
  recurrenceType: import('./schedule').RecurrenceType;
  recurrenceWeeks: number;
  monthlyType: 'day_of_month' | 'weekday_of_month';
  recurrenceWeekOfMonth: number | null;
  createdBy: string;
  createdAt: string;
}

export interface ChoreCompletion {
  id: string;
  choreId: string;
  completedBy: string;
  performedByMemberId: string | null;
  completedAt: string;
  note: string | null;
  day: import('./schedule').WeekDay | null;
  date: string | null;
}
