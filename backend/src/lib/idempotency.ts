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
 * cache-nyckel trots att det är exakt samma logiska försök, och servern kör
 * routen igen → äkta dubblett. Bekräftat i produktion 2026-09-06: två skilda
 * menu-rader skapades av en "Network request failed" (114ms, servern hade
 * redan lyckats) följt av klientens automatiska retry. Sub är stabil per
 * användare oavsett hur token-strängen ser ut, vilket faktiskt gör att
 * retry:n känns igen som samma försök.
 */
interface CacheEntry { status: number; body: unknown; expiresAt: number }

const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;
const isDev = process.env.NODE_ENV !== 'production';

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key);
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

  const cached = cache.get(cacheKey);
  if (cached) {
    res.status(cached.status).json(cached.body);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode < 500) {
      cache.set(cacheKey, { status: res.statusCode, body, expiresAt: Date.now() + TTL_MS });
    }
    return originalJson(body);
  }) as typeof res.json;

  next();
}
