import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';

export const AI_UNAVAILABLE_RECIPE = 'Handlis kan inte läsa recept just nu. Försök igen senare – eller skriv in receptet själv.';
export const AI_UNAVAILABLE_LIST = 'Handlis kan inte läsa bilder just nu. Försök igen senare – eller skriv in varorna själv.';

/**
 * Svaret till appen när ett AI-anrop misslyckats. Fel från Anthropic (nådd
 * utgiftsgräns, överbelastning, nätverk …) visas aldrig rått — "400 {"type":
 * "error" …}" hamnade förut i användarens felruta. De rapporteras i stället till
 * Sentry, eftersom de slår ut AI-funktionerna för alla. Våra egna fel (t.ex.
 * "Instagram visar inte inlägget …") är skrivna för användaren och går igenom.
 */
export function aiErrorResponse(err: unknown, unavailable: string, fallback: string): { status: number; error: string } {
  if (err instanceof Anthropic.APIError) {
    Sentry.captureException(err);
    return { status: 503, error: unavailable };
  }
  return { status: 422, error: err instanceof Error ? err.message : fallback };
}
