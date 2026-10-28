import type { IncomingMessage } from 'node:http';

/**
 * Klientens IP bakom Railways proxy — nyckeln för alla rate limits.
 *
 * `trust proxy = 1` räckte på Render (ett hopp), men Railway lägger ibland
 * till ett internt hopp till: då blev req.ip proxyns adress, som alla
 * användare delar. Den delade kvoten tog slut och ungefär var sjätte
 * förfrågan fick 429 ("Kunde inte ladda recept", 2026-10-28). Första
 * adressen i X-Forwarded-For är klienten oavsett antal hopp — samma sätt
 * som WS-uppgraderingen redan läser den. Klienten kan förfalska den och
 * därmed slippa sin egen spärr, men aldrig fylla någon annans.
 */
export function clientIp(req: IncomingMessage & { ip?: string }): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.ip || req.socket.remoteAddress || 'unknown';
}
