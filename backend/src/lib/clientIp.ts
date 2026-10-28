import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

/**
 * Klientens IP bakom Railways proxy — nyckeln för alla rate limits.
 *
 * `trust proxy = 1` räckte på Render (ett hopp), men Railway lägger ibland
 * till ett internt hopp till: då blev req.ip proxyns adress, som alla
 * användare delar. Den delade kvoten tog slut och ungefär var sjätte
 * förfrågan fick 429 ("Kunde inte ladda recept", 2026-10-28).
 *
 * X-Forwarded-For läses BAKIFRÅN: proxyerna lägger till adresser sist, så
 * den sista publika adressen är den Railways kant själv såg. Allt framför
 * den kan klienten ha skrivit själv — tog vi första adressen kunde ett
 * skript byta påhittad IP vid varje anrop och aldrig spärras. Interna hopp
 * (privata adresser, CGNAT) hoppas över.
 */
export function clientIp(req: IncomingMessage & { ip?: string }): string {
  const fwd = req.headers['x-forwarded-for'];
  const hops = (Array.isArray(fwd) ? fwd.join(',') : fwd ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  for (let i = hops.length - 1; i >= 0; i--) {
    if (isIP(hops[i]) && !isInternal(hops[i])) return hops[i];
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/** Privata, CGNAT-, loopback- och länklokala adresser — proxyhopp, aldrig klienter. */
export function isInternal(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return a === 10 || a === 127 || a === 0
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254);
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::'
    || /^f[cd]/.test(v6)          // fc00::/7, unik lokal
    || /^fe[89ab]/.test(v6);      // fe80::/10, länklokal
}
