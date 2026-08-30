// DIAG (temp): avlyssnar Clerks native FAPI-anrop och loggar EXAKT vad prod-
// servern returnerar (sessions-antal, status, ev. felkod). MÅSTE importeras
// FÖRST i app/_layout.tsx — före '@clerk/clerk-expo' — så global.fetch är
// patchad innan Clerk fångar sin fetch-referens. Native-only. Tas bort när
// session-drop-buggen är löst.
import { Platform } from 'react-native';
import { reportClientError } from './errorReport';

/* eslint-disable @typescript-eslint/no-explicit-any */
if (Platform.OS !== 'web') {
  const g = globalThis as any;
  const orig = g.fetch;
  if (typeof orig === 'function' && !g.__diagFetchPatched) {
    g.__diagFetchPatched = true;
    g.fetch = async (input: any, init?: any) => {
      // Fånga den SÄNDA authorization-token:en (client-token, roterande) INNAN
      // svaret — så vi ser om två requests skickar SAMMA token (reuse → signout).
      let sentAuth = '?';
      try {
        const h = init?.headers;
        const raw = h?.get ? h.get('authorization') : (h?.authorization ?? h?.Authorization);
        if (typeof raw === 'string' && raw.length > 0) sentAuth = `${raw.slice(0, 8)}…${raw.slice(-6)}(${raw.length})`;
        else if (raw === '' ) sentAuth = 'tom';
      } catch { /* headers-form varierar */ }
      const res = await orig(input, init);
      try {
        const url: string = typeof input === 'string' ? input : (input?.url ?? input?.href ?? String(input));
        if (url.includes('clerk.')) {
          let sessions = -1;
          let lastActive: string | null = null;
          let errorCode: string | null = null;
          let errorMsg: string | null = null;
          try {
            const body: any = await res.clone().json();
            const client = body?.response ?? body?.client ?? body;
            if (Array.isArray(client?.sessions)) sessions = client.sessions.length;
            lastActive = client?.last_active_session_id ?? null;
            errorCode = body?.errors?.[0]?.code ?? null;
            errorMsg = body?.errors?.[0]?.message ?? null;
          } catch { /* body ej JSON */ }
          const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
          reportClientError('DIAG: FAPI ' + path, {
            method: init?.method ?? 'GET',
            status: res.status,
            sentAuth, // client-token som SKICKADES (prefix…suffix(len)) — samma på 2 = reuse
            gotNewAuth: res.headers?.get?.('authorization') ? 'ja' : 'nej', // roterad token i svaret
            sessions,
            lastActive,
            errorCode,
            errorMsg,
          });
        }
      } catch { /* DIAG får aldrig störa appen */ }
      return res;
    };
  }
}
