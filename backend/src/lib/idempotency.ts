import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

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
 * här. Authorization-headern (hashad) räcker för att skopa nyckeln per
 * användare utan att bero på var i kedjan auth-middlewaren körs.
 */
interface CacheEntry { status: number; body: unknown; expiresAt: number }

const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key);
  }
}, 60 * 1000).unref();

export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.header('Idempotency-Key');
  if (req.method === 'GET' || req.method === 'HEAD' || !key) {
    next();
    return;
  }

  const auth = req.header('authorization') ?? '';
  const scope = crypto.createHash('sha256').update(auth).digest('hex').slice(0, 16);
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
