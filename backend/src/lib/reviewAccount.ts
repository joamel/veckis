/**
 * Inloggning för Play-granskarens konto — en TILLFÄLLIG väg förbi Clerks
 * enhetskontroll.
 *
 * Clerk kräver en e-postkod när någon loggar in med lösenord från en klient
 * den inte känner igen, även för konton utan tvåstegsverifiering. Granskarens
 * telefon är alltid ny, och koden går till en inkorg granskaren inte har —
 * så granskaren kom aldrig in med de uppgifter vi angett i Play Console
 * (bekräftat med scripts/clerk-testa-inloggning.mjs: needs_second_factor).
 *
 * Vägen är AVSTÄNGD tills REVIEW_ACCOUNT_EMAIL är satt på Railway, och gäller
 * bara exakt den adressen. Ta bort variabeln när granskningen är klar — varje
 * användning loggas, så den syns om den glömts på.
 */
export function isReviewAccount(email: string, configured: string | undefined): boolean {
  const wanted = configured?.trim().toLowerCase();
  if (!wanted) return false;
  return email.trim().toLowerCase() === wanted;
}
