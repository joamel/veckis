import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

/**
 * Klientens IP bakom Railways proxy — nyckeln för alla rate limits.
 *
 * Uppmätt 2026-10-28 via /healthz/ip: Railways kant SKRIVER ÖVER
 * X-Real-IP och X-Forwarded-For (påhittade värden från klienten försvinner),
 * och X-Forwarded-For blir "<klient>, <kantens publika adress>". Den sista
 * adressen delas alltså av alla användare — req.ip med `trust proxy = 1`
 * blev just den, den delade kvoten tog slut och var sjätte förfrågan fick
 * 429 ("Kunde inte ladda recept").
 *
 * Därför X-Real-IP, som kanten sätter till klienten, i första hand och
 * första adressen i X-Forwarded-For i andra. Båda går att lita på ENDAST
 * för att kanten skriver över dem — byts plattform måste det mätas igen
 * (curl -H "X-Real-IP: 2.2.2.2" …/healthz/ip ska inte visa 2.2.2.2).
 */
export function clientIp(req: IncomingMessage & { ip?: string }): string {
  const realIp = first(req.headers['x-real-ip']);
  if (realIp && isIP(realIp)) return realIp;
  const fwd = first(req.headers['x-forwarded-for']);
  if (fwd && isIP(fwd)) return fwd;
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function first(header: string | string[] | undefined): string | undefined {
  return (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim() || undefined;
}
