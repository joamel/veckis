/**
 * Avstånd från skärmens underkant till något som ligger fast där — en
 * spara-rad, en FAB, sista raden i en scroll.
 *
 * Appen ritas kant-i-kant (Expo SDK 54 / Android 15+): innehållet går under
 * systemets navigeringsrad, vilket är rätt — bakgrunden ska fylla hela
 * skärmen. Men det som går att TRYCKA på måste lyftas upp ovanför raden,
 * annars hamnar det under de tre knapparna hos alla som kör knappnavigering
 * (~48 dp) i stället för svepnavigering (~12–24 dp, eller 0 med raden dold).
 *
 * `bas` är avståndet designen vill ha när ingen systemrad är i vägen.
 *
 * Ren funktion utan hook, så den går att testa — `inset` är `insets.bottom`
 * från `useSafeAreaInsets()`.
 */
export function bottomGapFor(bas: number, inset: number): number {
  // +8: knappen ska inte klistras mot navigeringsraden utan ha lite luft.
  return Math.max(bas, inset + 8);
}
