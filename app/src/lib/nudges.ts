/**
 * Högst EN påminnelse per session (appstart): Instagram-fliken i en tom vecka,
 * "Snyggt planerat! Följ oss på Instagram" och betygsfrågan. Utan gränsen kunde
 * en ny användare få alla tre inom några minuter — fliken, sedan kortet när
 * veckan planerats, sedan betygsfrågan efter handlingen.
 *
 * Den som inte får visas förbrukas inte: dess egen flagga sätts aldrig, så den
 * får chansen i en senare session. Samma påminnelse kan visas igen i samma
 * session (fliken monteras om när man byter flik).
 *
 * Bara i minnet: en ny session börjar när appen startas (eller laddas om).
 */
export type Nudge = 'instagram-tab' | 'instagram-card' | 'review';

let current: Nudge | null = null;

/** Får den här påminnelsen visas nu? Tar sessionens plats om den är ledig. */
export function claimNudge(kind: Nudge): boolean {
  if (current === null) current = kind;
  return current === kind;
}

/** Bara för tester. */
export function resetNudgesForTest(): void {
  current = null;
}
