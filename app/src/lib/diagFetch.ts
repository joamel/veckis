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
      // ICKE-BLOCKERANDE: klona + läs headers SYNKRONT nu, men parsa body:n och
      // logga ASYNKRONT efter att vi returnerat svaret. Får ALDRIG fördröja
      // clerk-expo:s onAfterResponse (token-sparningen) — annars läser nästa
      // request en gammal token → reuse → signed_out.
      try {
        const url: string = typeof input === 'string' ? input : (input?.url ?? input?.href ?? String(input));
        if (url.includes('clerk.')) {
          const clone = res.clone();
          const status = res.status;
          const gotNewAuth = res.headers?.get?.('authorization') ? 'ja' : 'nej';
          let clockSkewSec: number | null = null;
          try {
            const serverDate = res.headers?.get?.('date');
            if (serverDate) clockSkewSec = Math.round((Date.now() - new Date(serverDate).getTime()) / 1000);
          } catch { /* ingen date-header */ }
          const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
          const method = init?.method ?? 'GET';
          void clone.json().then((body: any) => {
            const client = body?.response ?? body?.client ?? body;
            reportClientError('DIAG: FAPI ' + path, {
              method, status, clockSkewSec, sentAuth, gotNewAuth,
              sessions: Array.isArray(client?.sessions) ? client.sessions.length : -1,
              lastActive: client?.last_active_session_id ?? null,
              errorCode: body?.errors?.[0]?.code ?? null,
              errorMsg: body?.errors?.[0]?.message ?? null,
            });
          }).catch(() => { /* body ej JSON */ });
        }
      } catch { /* DIAG får aldrig störa appen */ }
      return res;
    };
  }
}
