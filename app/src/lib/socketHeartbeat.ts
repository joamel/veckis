/**
 * Servern skickar {"type":"heartbeat"} var 30:e sekund (backend/src/index.ts).
 * Har inget alls hörts på så här länge är anslutningen död, även om
 * readyState säger OPEN — det händer när telefonen byter nät med appen öppen
 * (hemmets wifi → mobilnät på väg till affären). Två missade slag plus marginal.
 */
export const HEARTBEAT_TIMEOUT_MS = 75_000;
/** Hur ofta klienten kollar. */
export const HEARTBEAT_CHECK_MS = 15_000;

/** Hjärtslaget håller bara anslutningen vid liv — det skickas inte vidare. */
export function isHeartbeat(msg: unknown): boolean {
  return typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === 'heartbeat';
}

/** Tyst för länge? */
export function isSilent(lastHeardAt: number, now: number): boolean {
  return now - lastHeardAt > HEARTBEAT_TIMEOUT_MS;
}
