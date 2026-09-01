// Speglar webbläsarens atomiska `__client`-cookie-uppdatering på native.
//
// Clerks native-client identifieras av en rotating-token-nonce (`__clerk_client_jwt`
// = { id, rotating_token }). Servern roterar den vid VARJE FAPI-svar och returnerar
// den nya i svarets `Authorization`-header. Webbläsaren persisterar den atomiskt via
// Set-Cookie → alltid färskaste nonce. Native förlitar sig på att clerk-js läser
// headern och sparar via async SecureStore — vilket kan hinna bli stale/race:a vid
// samtidiga boot-anrop → lagrad nonce en-rotation-efter → prod-instansens reuse-
// detection avvisar den vid omstart → ny client → utloggad.
//
// Denna patch fångar `Authorization` ur varje FAPI-svar och skriver den till
// SecureStore, INVÄNTAD i svarskedjan (innan svaret når clerk och nästa anrop kan
// fyras) — precis som cookien. MÅSTE importeras FÖRE '@clerk/expo'.
import * as SecureStore from './secureStorage';
import { reportClientError } from './errorReport';

const CLERK_JWT_KEY = '__clerk_client_jwt';
const isFapi = (url: string) => /clerk\.handlis\.app|clerk\.accounts\.dev/.test(url);

// Kort, icke-reversibel hash (djb2) — loggar nonce-IDENTITET utan att läcka token.
function shortHash(s: string | null | undefined): string {
  if (!s) return '-';
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff;
  return (h >>> 0).toString(36);
}

type FetchFn = (input: unknown, init?: unknown) => Promise<Response>;

const g = globalThis as unknown as { fetch?: FetchFn; __clerkClientSyncPatched?: boolean };

if (!g.__clerkClientSyncPatched && typeof g.fetch === 'function') {
  g.__clerkClientSyncPatched = true;
  const orig = g.fetch.bind(g) as FetchFn;

  g.fetch = async (input: unknown, init?: unknown): Promise<Response> => {
    const url = typeof input === 'string' ? input : ((input as { url?: string })?.url ?? '');
    if (!isFapi(url)) return orig(input, init);

    // Skickad token (för nonce-spårning): Authorization ur request-init.
    const reqAuth = (init as { headers?: Record<string, string> } | undefined)?.headers?.['Authorization']
      ?? (init as { headers?: Record<string, string> } | undefined)?.headers?.['authorization'];

    const res = await orig(input, init);
    try {
      const respAuth = res.headers.get('Authorization') ?? res.headers.get('authorization');
      if (respAuth && respAuth.split('.').length >= 2) {
        // Skriv färskaste token INVÄNTAT innan svaret släpps vidare → nästa anrop
        // kan aldrig läsa en äldre nonce.
        await SecureStore.setItemAsync(CLERK_JWT_KEY, respAuth);
      }
      reportClientError('DIAG fapi', {
        path: url.replace(/^https?:\/\/[^/]+/, '').split('?')[0],
        reqTok: shortHash(reqAuth ?? null),
        respTok: shortHash(respAuth ?? null),
      });
    } catch (e) {
      reportClientError('DIAG fapi ERR', { err: String(e) });
    }
    return res;
  };
}
