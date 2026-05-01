export type ChoreFrequency = 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface Chore {
  id: string;
  householdId: string;
  title: string;
  description: string | null;
  frequency: ChoreFrequency;
  assignedTo: string | null;
  day: import('./schedule').WeekDay | null;
  isShared: boolean;
  createdBy: string;
  createdAt: string;
}

export interface ChoreCompletion {
  id: string;
  choreId: string;
  completedBy: string;
  completedAt: string;
  note: string | null;
}
