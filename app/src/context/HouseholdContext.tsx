import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import * as SecureStore from '../lib/secureStorage';
import { useApiClient, type MembershipWithHousehold } from '../api/client';

interface HouseholdContextValue {
  householdId: string | null;
  householdName: string | null;
  householdEmoji: string | null;
  memberRole: 'admin' | 'member' | null;
  allMemberships: MembershipWithHousehold[];
  isLoading: boolean;
  setActiveHouseholdId: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue>({
  householdId: null,
  householdName: null,
  householdEmoji: null,
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
  // hasFetchedWhileSignedIn: false tills load() faktiskt körts MED isSignedIn=true.
  // Behövs eftersom isLoading kan vippa false-true-false när Clerk växlar
  // från false → true (logged-out branch sätter false snabbt, sen async load
  // sätter true igen). I det glipa-fönstret läser NavigationGuard
  // 'isLoading=false, householdId=null' och tror felaktigt att hen saknar
  // hushåll → router.replace('/household/setup') trots att hen har ett.
  const [hasFetchedWhileSignedIn, setHasFetchedWhileSignedIn] = useState(false);

  const load = useCallback(async () => {
    if (!isSignedIn) {
      setAllMemberships([]);
      setActiveMembershipId(null);
      setHasFetchedWhileSignedIn(false);
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
      setHasFetchedWhileSignedIn(true);
      setIsLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    setIsLoading(true);
    load();
  }, [load]);

  // Trots isLoading=false-flagga räknar vi som "fortfarande lastande" för
  // konsumenter (NavigationGuard m.fl.) om hen är signed in men load inte
  // har körts med signed-in-flagga ännu. Hindrar gap-tolkningen ovan.
  const effectiveLoading = isLoading || (!!isSignedIn && !hasFetchedWhileSignedIn);

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
        householdEmoji: activeMembership?.household.emoji ?? null,
        memberRole: (activeMembership?.role as 'admin' | 'member' | null) ?? null,
        allMemberships,
        isLoading: effectiveLoading,
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
