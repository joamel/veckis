import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@clerk/backend';

/**
 * Idempotency för muterande anrop. Mobilnät kan tappa svaret efter att
 * servern redan lyckats behandla en POST — klienten ser "network error" och
 * (om den försöker igen) skapar en dubblett trots att originalet gick igenom.
 * Klienten skickar samma `Idempotency-Key` vid en retry av samma logiska
 * försök; vi cachar svaret här och spelar upp det istället för att köra
 * routen igen.
 *
 * Ligger som global middleware (inte per-route) eftersom requireAuth sätts
 * per route, inte globalt — vi kan alltså inte förlita oss på req.clerkUserId
 * här.
 *
 * Skopas på VERIFIERAD Clerk-sub, inte en hash av hela Authorization-headern
 * (som det var förut). Klienten hämtar token på nytt (getToken()) vid VARJE
 * retry-försök, och Clerk kan signera om en ny token-sträng för samma
 * användare inom loppet av en retry — då missar en header-hash-baserad
 * cache-nyckel trots att det är exakt samma logiska försök.
 *
 * VIKTIGARE HÅL (bekräftat i produktion 2026-09-06 — sub-fixet ovan räckte
 * INTE ensamt): cachen skrevs bara vid COMPLETION (i den inpackade
 * res.json), aldrig vid START. Hinner en retry fram MEDAN originalet
 * fortfarande bearbetas (DB-skrivningen tar några ms) ser retry:n en tom
 * cache och kör routen parallellt — trots identisk, korrekt skopad
 * Idempotency-Key. Klassiskt idempotency-race (samma sak Stripes egen
 * idempotency-dokumentation varnar för). Nyckeln reserveras nu synkront vid
 * START (en "pending"-post) så en samtidig retry väntar in ORIGINALETS svar
 * i stället för att köra routen igen.
 */
interface DoneEntry { status: 'done'; status_: number; body: unknown; expiresAt: number }
interface PendingEntry { status: 'pending'; promise: Promise<{ status: number; body: unknown }> }
type CacheValue = DoneEntry | PendingEntry;

const cache = new Map<string, CacheValue>();
const TTL_MS = 5 * 60 * 1000;
const isDev = process.env.NODE_ENV !== 'production';

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.status === 'done' && entry.expiresAt < now) cache.delete(key);
  }
}, 60 * 1000).unref();

export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.header('Idempotency-Key');
  if (req.method === 'GET' || req.method === 'HEAD' || !key) {
    next();
    return;
  }

  const authHeader = req.header('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  let scope: string;
  try {
    if (isDev && token.startsWith('dev_')) {
      scope = token.slice(4);
    } else {
      const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      scope = payload.sub;
    }
  } catch {
    // Ogiltig/utgången token — låt routens egen requireAuth ge rätt 401 utan
    // att blanda in idempotency-cachen.
    next();
    return;
  }
  const cacheKey = `${scope}:${key}`;

  const existing = cache.get(cacheKey);
  if (existing) {
    if (existing.status === 'pending') {
      // Samma nyckel bearbetas redan (en retry hann fram innan originalet var
      // klart) — vänta in DET svaret i stället för att köra routen igen.
      const result = await existing.promise;
      res.status(result.status).json(result.body);
      return;
    }
    if (existing.expiresAt > Date.now()) {
      res.status(existing.status_).json(existing.body);
      return;
    }
  }

  let resolvePending!: (r: { status: number; body: unknown }) => void;
  const pendingPromise = new Promise<{ status: number; body: unknown }>(resolve => { resolvePending = resolve; });
  cache.set(cacheKey, { status: 'pending', promise: pendingPromise });

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode < 500) {
      cache.set(cacheKey, { status: 'done', status_: res.statusCode, body, expiresAt: Date.now() + TTL_MS });
    } else {
      // Serverfel — låt en eventuell retry köra om från scratch i stället för
      // att permanent hänga fast vid ett trasigt svar.
      cache.delete(cacheKey);
    }
    resolvePending({ status: res.statusCode, body });
    return originalJson(body);
  }) as typeof res.json;

  // Säkerhetsnät: om routen svarar utan res.json (t.ex. kraschar innan dess)
  // ska inte en väntande retry hänga för evigt — lös upp med det faktiska
  // statuskoden och rensa posten så nästa försök körs på nytt.
  res.on('finish', () => {
    const entry = cache.get(cacheKey);
    if (entry?.status === 'pending') {
      cache.delete(cacheKey);
      resolvePending({ status: res.statusCode, body: null });
    }
  });

  next();
}
