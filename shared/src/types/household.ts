export interface Household {
  id: string;
  name: string;
  emoji: string | null;
  createdAt: string;
}

export interface HouseholdMember {
  id: string;
  householdId: string;
  clerkUserId: string | null;
  displayName: string;
  role: 'admin' | 'member';
  joinedAt: string;
}

export interface InviteCode {
  code: string;
  householdId: string;
  expiresAt: string;
}
