// Fix för client-token-rotations-racet mot prod-Clerk-instansen.
//
// Bevisat (FAPI-reproduktion + on-device DIAG): vid login roterar prod client-
// token:en (E1→E2). clerk-expo:s setActive gör sen en `touch` — men med den GAMLA
// token:en (E1), eftersom clerk-expo sparar den roterade (E2) för sent (via
// onAfterResponse → tokenCache, async). Prod-instansen är strikt: `touch` med
// utroterad token → signed_out → tom-klient-token sparas → utloggad vid omstart.
//
// FIX: fånga den roterade token:en så TIDIGT som möjligt — direkt i fetch-svarets
// Authorization-header, INNAN clerk-js hinner köra sin (fördröjda) onAfterResponse
// — och lägg den i ett delat minne (clerkTokenMem) som tokenCache.getToken läser
// FÖRST. Då ser setActive:s touch alltid den senaste roterade token:en.
//
// MÅSTE importeras FÖRST i app/_layout.tsx (före '@clerk/clerk-expo'). Minimal
// patch (läser en header synkront, returnerar svaret DIREKT) → ingen fördröjning.
import { Platform } from 'react-native';

export const CLERK_JWT_KEY = '__clerk_client_jwt';
export const clerkTokenMem: Record<string, string | null> = {};

/* eslint-disable @typescript-eslint/no-explicit-any */
if (Platform.OS !== 'web') {
  const g = globalThis as any;
  const orig = g.fetch;
  if (typeof orig === 'function' && !g.__clerkTokenSyncPatched) {
    g.__clerkTokenSyncPatched = true;
    g.fetch = async (input: any, init?: any) => {
      const res = await orig(input, init);
      try {
        const url: string = typeof input === 'string' ? input : (input?.url ?? input?.href ?? '');
        if (typeof url === 'string' && url.includes('clerk.')) {
          const auth = res?.headers?.get?.('authorization');
          if (auth) clerkTokenMem[CLERK_JWT_KEY] = auth; // fånga roterad token synkront
        }
      } catch { /* får aldrig störa appen */ }
      return res;
    };
  }
}
