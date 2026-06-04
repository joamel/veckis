// CORS-whitelist med förlåtande matchning + observability.
//
// Värdet på env-vart `CORS_ORIGIN` kan ha mänskligt skräp (mellanslag,
// trailing slash, fel case) som annars skulle ge silent fail — en
// browser-request blockerades utan att backend loggar något, och det är
// väldigt svårt att felsöka.
//
// Strategi:
// - Normalisera både whitelist-värden OCH request-origin innan jämförelse
//   (lowercase + strip whitespace + strip trailing slash).
// - Logga första gången vi ser en blockad origin (de följande hålls tysta
//   så Render-logs inte fylls om en bot spammar fel origin).
// - "*" i listan = öppen för alla, native + tools som inte skickar Origin
//   släpps alltid igenom.

export function normalizeOrigin(s: string): string {
  return s.trim().toLowerCase().replace(/\/+$/, '');
}

export function parseAllowlist(value: string | undefined): string[] {
  return (value ?? '*')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
}

interface OriginCheckLogger {
  warn(msg: string): void;
}

/**
 * Skapar en cors-origin-callback som matchar express-cors-paketets signatur.
 * Loggar varje unik blockad origin en gång så vi ser i Render logs om någon
 * legitim klient blockeras pga typo i whitelist.
 */
export function makeOriginCheck(
  allowlist: string[],
  logger: OriginCheckLogger = console,
): (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void {
  const allowAll = allowlist.includes('*');
  const seenBlocked = new Set<string>();

  return (origin, cb) => {
    // Native appar + curl + samma-origin skickar ingen Origin-header.
    if (!origin) return cb(null, true);
    if (allowAll) return cb(null, true);

    const norm = normalizeOrigin(origin);
    if (allowlist.includes(norm)) return cb(null, true);

    if (!seenBlocked.has(norm)) {
      seenBlocked.add(norm);
      logger.warn(`[CORS] Blocked origin: ${JSON.stringify(origin)} (normalized: ${JSON.stringify(norm)}) — whitelist: ${JSON.stringify(allowlist)}`);
    }
    cb(null, false);
  };
}
