export interface Household {
  id: string;
  name: string;
  createdAt: string;
}

export interface HouseholdMember {
  id: string;
  householdId: string;
  clerkUserId: string;
  displayName: string;
  role: 'admin' | 'member';
  joinedAt: string;
}

export interface InviteCode {
  code: string;
  householdId: string;
  expiresAt: string;
}
