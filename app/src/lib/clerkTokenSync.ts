// Robust fix för client-token-rotations-racet mot prod-Clerk-instansen.
//
// Problemet (bevisat via FAPI-reproduktion + on-device DIAG): prod roterar
// client-token:en vid varje anrop. clerk-expo sparar den roterade token:en via
// onAfterResponse → tokenCache.saveToken (async SecureStore-skrivning). Men nästa
// request läser tokenCache.getToken INNAN sparningen propagerat → skickar den
// GAMLA token:en → servern ser en utroterad token → anti-session-fixation →
// signed_out → en tom-klient-token sparas → nästa omstart = tom klient = utloggad.
// (Dev-instansen roterar inte → därför "funkade det förut".)
//
// FIX: fånga den roterade token:en så TIDIGT som möjligt — direkt i fetch-svarets
// Authorization-header, INNAN clerk-js hinner köra sin (fördröjda) onAfterResponse
// — och lägg den i ett delat minne som tokenCache.getToken läser FÖRST. Då ser
// nästa request alltid den senaste roterade token:en → inget race → ingen reuse →
// ingen tom-klient-token → sessionen överlever omstart.
//
// MÅSTE importeras FÖRST i app/_layout.tsx (före '@clerk/clerk-expo') så global.
// fetch är patchad innan clerk-js fångar sin fetch-referens. Patchen är minimal
// (läser en header synkront, returnerar svaret direkt) → ingen fördröjning som
// kan störa clerk-js request-pipeline.
import { Platform } from 'react-native';

export const CLERK_JWT_KEY = '__clerk_client_jwt';

// Delat minne: senaste kända client-token. Läses av tokenCache.getToken i _layout.
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
          // Fånga den roterade client-token:en direkt (synkront, ingen fördröjning).
          if (auth) clerkTokenMem[CLERK_JWT_KEY] = auth;
        }
      } catch { /* får aldrig störa appen */ }
      return res;
    };
  }
}
