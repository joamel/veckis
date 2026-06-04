// Rate-limit för WebSocket-anslutningar per IP.
//
// Express-rate-limit hanterar bara HTTP. Hot mot WS: en illvillig klient
// öppnar tusentals connections för att äta minne på servern. Vi tar ett
// enklare grepp: räkna handshakes per IP i ett rörligt fönster.
//
// I dev (NODE_ENV !== production) är gränsen avslappnad så hot-reload-
// loops inte triggar. I prod: 30 anslutningar/min per IP räcker väl för
// en normal användare (mobil + web + ev. tablet på samma router), och
// skär bort obvious abuse.

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW_PROD = 30;
const MAX_PER_WINDOW_DEV = 600;

const isProd = process.env.NODE_ENV === 'production';
const maxPerWindow = isProd ? MAX_PER_WINDOW_PROD : MAX_PER_WINDOW_DEV;

interface IpRecord {
  timestamps: number[];
}

const byIp = new Map<string, IpRecord>();

/** Returns true om denna IP får öppna en ny WS-connection just nu. */
export function checkWsRateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = byIp.get(ip) ?? { timestamps: [] };
  // Drop äldre timestamps utanför fönstret
  rec.timestamps = rec.timestamps.filter(t => now - t < WINDOW_MS);
  if (rec.timestamps.length >= maxPerWindow) {
    byIp.set(ip, rec);
    return false;
  }
  rec.timestamps.push(now);
  byIp.set(ip, rec);
  return true;
}

/** Periodisk städning för att inte växa Map:en obegränsat. Kör var 5:e min. */
export function startWsRateLimitGc(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of byIp.entries()) {
      const fresh = rec.timestamps.filter(t => now - t < WINDOW_MS);
      if (fresh.length === 0) byIp.delete(ip);
      else rec.timestamps = fresh;
    }
  }, 5 * 60 * 1000).unref();
}

// Export för test
export const __testing = {
  clear: () => byIp.clear(),
  maxPerWindow,
};
