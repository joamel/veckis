import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useApiClient, type MembershipWithHousehold } from '../api/client';

interface HouseholdContextValue {
  householdId: string | null;
  householdName: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue>({
  householdId: null,
  householdName: null,
  isLoading: true,
  refresh: async () => {},
});

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const client = useApiClient();
  const [membership, setMembership] = useState<MembershipWithHousehold | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isSignedIn) {
      setMembership(null);
      setIsLoading(false);
      return;
    }
    try {
      const memberships = await client.getMyHouseholds();
      setMembership(memberships[0] ?? null);
    } catch {
      setMembership(null);
    } finally {
      setIsLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    setIsLoading(true);
    load();
  }, [load]);

  return (
    <HouseholdContext.Provider
      value={{
        householdId: membership?.householdId ?? null,
        householdName: membership?.household.name ?? null,
        isLoading,
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
