// Skyddsnät för native client-token-persistens (speglar webbläsarens `__client`-
// cookie). Clerk roterar native-client-token:en (`__clerk_client_jwt`) och
// returnerar den ibland i FAPI-svarets `Authorization`-header. Vi skriver den till
// SecureStore direkt i svarskedjan så den färskaste alltid ligger persisterad —
// extra försäkran ovanpå clerks egen tokenCache-hantering. MÅSTE importeras FÖRE
// '@clerk/expo'. (Primär fix för Google-SSO-droppen ligger i sign-in.tsx.)
import * as SecureStore from './secureStorage';

const CLERK_JWT_KEY = '__clerk_client_jwt';
const isFapi = (url: string) => /clerk\.handlis\.app|clerk\.accounts\.dev/.test(url);

type FetchFn = (input: unknown, init?: unknown) => Promise<Response>;
const g = globalThis as unknown as { fetch?: FetchFn; __clerkClientSyncPatched?: boolean };

if (!g.__clerkClientSyncPatched && typeof g.fetch === 'function') {
  g.__clerkClientSyncPatched = true;
  const orig = g.fetch.bind(g) as FetchFn;

  g.fetch = async (input: unknown, init?: unknown): Promise<Response> => {
    // clerk skickar URL/Request-objekt, inte alltid sträng → täck alla former.
    let url = '';
    if (typeof input === 'string') url = input;
    else if (input && typeof (input as { url?: string }).url === 'string') url = (input as { url: string }).url;
    else if (input && typeof (input as { href?: string }).href === 'string') url = (input as { href: string }).href;
    else if (input != null) { try { url = String(input); } catch { url = ''; } }

    if (!isFapi(url)) return orig(input, init);

    const res = await orig(input, init);
    try {
      const auth = res.headers.get('Authorization') ?? res.headers.get('authorization');
      if (auth && auth.split('.').length >= 2) await SecureStore.setItemAsync(CLERK_JWT_KEY, auth);
    } catch { /* best-effort */ }
    return res;
  };
}
