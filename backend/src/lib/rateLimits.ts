// Striktare rate-limits per endpoint, ovanpå den generella /api-limiten.
// Skyddar specifika abuse-vektorer:
// - createHousehold + join: brute-force av invite-koder, spam-skapande
// - admin sync-ingredients: dyrt skraping-arbete
// - recipe from-url + image upload: skraping/storage-abuse
//
// I dev-läge (NODE_ENV !== 'production') skippas alla limits — annars stör
// det vanlig hot-reload-loop. Begräsningarna gäller per IP; Clerk-tokens
// kunde ge per-user men IP räcker som grov spärr och kräver ingen DB-lookup.
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';

const HOUR = 60 * 60 * 1000;

function build(maxPerHour: number, message: string): RateLimitRequestHandler {
  return rateLimit({
    windowMs: HOUR,
    max: maxPerHour,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}

const passthrough = (_req: Request, _res: Response, next: NextFunction): void => next();
const isProd = process.env.NODE_ENV === 'production';

/** POST /api/households (skapa nytt hushåll) — 10/timme/IP. */
export const createHouseholdLimiter: RateLimitRequestHandler | typeof passthrough = isProd
  ? build(10, 'För många hushåll skapade — försök igen senare.')
  : passthrough;

/** POST /api/households/join (gå med via 8-tecken kod) — 20/timme/IP.
 *  20 är tillräckligt för normal användning men stoppar brute-force av
 *  invite-koder (8 tecken = ~36^8 möjligheter, men 20/timme = orealistiskt
 *  att hitta en giltig kod inom code-expiry-tiden). */
export const joinHouseholdLimiter: RateLimitRequestHandler | typeof passthrough = isProd
  ? build(20, 'För många försök — vänta lite och försök igen.')
  : passthrough;

/** POST /api/admin/sync-ingredients (skraping en lista URLs) — 5/timme/IP. */
export const adminSyncLimiter: RateLimitRequestHandler | typeof passthrough = isProd
  ? build(5, 'Tröttat ut admin-skraping — vänta en stund.')
  : passthrough;

/** POST /api/recipes/from-url + image-upload — 30/timme/IP. */
export const recipeAbuseLimiter: RateLimitRequestHandler | typeof passthrough = isProd
  ? build(30, 'För många recept-importer/uppladdningar — vänta en stund.')
  : passthrough;

/** POST /api/recipes/parse-text — 15/timme/IP. Egen, striktare limit ovanpå
 *  den generella: varje anrop är en dyr Claude-körning (kostnadstak). */
export const parseTextLimiter: RateLimitRequestHandler | typeof passthrough = isProd
  ? build(15, 'För många AI-tolkningar — vänta en stund.')
  : passthrough;

/** POST /api/push/register — 60/timme/IP. En enhet registrerar sin token
 *  sällan; 60 rymmer reconnect-loopar men stoppar token-spam. */
export const pushRegisterLimiter: RateLimitRequestHandler | typeof passthrough = isProd
  ? build(60, 'För många token-registreringar — vänta en stund.')
  : passthrough;
