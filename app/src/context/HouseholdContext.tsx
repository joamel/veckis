import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';
import { useApiClient, type MembershipWithHousehold } from '../api/client';

interface HouseholdContextValue {
  householdId: string | null;
  householdName: string | null;
  memberRole: 'admin' | 'member' | null;
  allMemberships: MembershipWithHousehold[];
  isLoading: boolean;
  setActiveHouseholdId: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue>({
  householdId: null,
  householdName: null,
  memberRole: null,
  allMemberships: [],
  isLoading: true,
  setActiveHouseholdId: async () => {},
  refresh: async () => {},
});

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const client = useApiClient();
  const [allMemberships, setAllMemberships] = useState<MembershipWithHousehold[]>([]);
  const [activeMembershipId, setActiveMembershipId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isSignedIn) {
      setAllMemberships([]);
      setActiveMembershipId(null);
      setIsLoading(false);
      return;
    }
    try {
      const memberships = await client.getMyHouseholds();
      setAllMemberships(memberships);

      const storedId = await SecureStore.getItemAsync('active_household_id');
      const activeMembership = memberships.find(m => m.householdId === storedId) ?? memberships[0];
      setActiveMembershipId(activeMembership?.id ?? null);
    } catch {
      setAllMemberships([]);
      setActiveMembershipId(null);
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    setIsLoading(true);
    load();
  }, [load]);

  const setActiveHouseholdId = useCallback(async (householdId: string) => {
    const membership = allMemberships.find(m => m.householdId === householdId);
    if (membership) {
      setActiveMembershipId(membership.id);
      await SecureStore.setItemAsync('active_household_id', householdId);
    }
  }, [allMemberships]);

  const activeMembership = allMemberships.find(m => m.id === activeMembershipId);

  return (
    <HouseholdContext.Provider
      value={{
        householdId: activeMembership?.householdId ?? null,
        householdName: activeMembership?.household.name ?? null,
        memberRole: (activeMembership?.role as 'admin' | 'member' | null) ?? null,
        allMemberships,
        isLoading,
        setActiveHouseholdId,
        refresh: load,
      }}
    >
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  return useContext(HouseholdContext);
}
