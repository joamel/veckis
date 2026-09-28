/**
 * Play-granskarens konto. Clerk kräver en e-postkod vid lösenordsinloggning
 * från en ny klient, och granskaren har inte inkorgen — så för just det här
 * kontot hämtar appen en engångsbiljett från backenden i stället.
 *
 * TILLFÄLLIGT: vägen är avstängd på backenden tills REVIEW_ACCOUNT_EMAIL är
 * satt på Railway. Adressen här avgör bara NÄR appen frågar — andra
 * användares lösenord skickas aldrig till vår backend.
 */
const REVIEW_ACCOUNT_EMAIL = 'joamelander+review@gmail.com';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export function isReviewAccount(email: string): boolean {
  return email.trim().toLowerCase() === REVIEW_ACCOUNT_EMAIL;
}

/** Biljett att logga in med, eller null om vägen är avstängd eller nekar. */
export async function requestReviewTicket(email: string, password: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/review-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ticket?: unknown };
    return typeof json.ticket === 'string' ? json.ticket : null;
  } catch {
    return null;
  }
}
