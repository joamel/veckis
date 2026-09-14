import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@clerk/expo';
import * as SecureStore from '../lib/secureStorage';
import { useApiClient, type MembershipWithHousehold } from '../api/client';

interface HouseholdContextValue {
  householdId: string | null;
  householdName: string | null;
  householdEmoji: string | null;
  memberRole: 'admin' | 'member' | null;
  allMemberships: MembershipWithHousehold[];
  isLoading: boolean;
  /** Hämtningen av hushåll misslyckades (nätverk/401) — INTE samma sak som noll hushåll. */
  loadFailed: boolean;
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
  loadFailed: false,
  setActiveHouseholdId: async () => {},
  refresh: async () => {},
});

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  const client = useApiClient();
  const [allMemberships, setAllMemberships] = useState<MembershipWithHousehold[]>([]);
  const [activeMembershipId, setActiveMembershipId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    // Vänta in Clerk. Innan sessionen återställts rapporteras isSignedIn som
    // false, och utan den här spärren kördes utloggade grenen: isLoading blev
    // false med householdId null. NavigationGuard såg då "inloggad, inget
    // hushåll" och skickade användaren till Skapa/gå med-sidan, som blinkade
    // förbi tills hushållet laddats — det såg ut som att man loggats ut.
    if (!isLoaded) return;

    if (!isSignedIn) {
      setAllMemberships([]);
      setActiveMembershipId(null);
      setIsLoading(false);
      return;
    }
    try {
      const memberships = await client.getMyHouseholds();
      setLoadFailed(false);
      setAllMemberships(memberships);

      const storedId = await SecureStore.getItemAsync('active_household_id');
      const activeMembership = memberships.find(m => m.householdId === storedId) ?? memberships[0];
      setActiveMembershipId(activeMembership?.id ?? null);
    } catch {
      // Ett misslyckat anrop är inte samma sak som att användaren saknar
      // hushåll. Utan den skillnaden skickade NavigationGuard hen till
      // Skapa/gå med-sidan vid varje nätverksglapp, och där fastnade man.
      setLoadFailed(true);
      setAllMemberships([]);
      setActiveMembershipId(null);
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn, isLoaded]);

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
        householdEmoji: activeMembership?.household.emoji ?? null,
        memberRole: (activeMembership?.role as 'admin' | 'member' | null) ?? null,
        allMemberships,
        isLoading,
        loadFailed,
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
