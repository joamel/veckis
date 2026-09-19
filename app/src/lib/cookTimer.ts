/**
 * Hittar en tid i ett tillagningssteg ("Låt koka 10 min") så laga-läget kan
 * erbjuda en nedräkning på den. Logiken bor här och inte i skärmfilen för att
 * gå att testa — samma skäl som skalaQty i qty.ts.
 */

// "10 min", "10 minuter", "1 timme", "1,5 timmar", "2 tim".
//
// Intervalldelen måste stå med i uttrycket, inte lämnas åt sidan: utan den
// matchar "20-25 min" på "25 min" och nedräkningen startar på det ÖVRE värdet,
// alltså tvärtemot vad vi vill. Nu fångas hela intervallet och gruppen som
// används är den första.
const TID_RE = /(\d+(?:[.,]\d+)?)(?:\s*[-–—]\s*\d+(?:[.,]\d+)?)?\s*(minuter|minut|min\b|timmar|timme|tim\b|h\b)/i;

/**
 * Minuter att räkna ned i steget, eller null om steget inte nämner någon tid.
 *
 * Vid intervall ("20-25 min") används det LÄGRE värdet. Man vill bli påmind
 * när maten tidigast kan vara klar och då titta till den, inte få signalen
 * när den redan kan ha stått för länge.
 */
export function hittaMinuter(step: string): number | null {
  const m = step.match(TID_RE);
  if (!m) return null;

  const tal = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(tal) || tal <= 0) return null;

  const enhet = m[2].toLowerCase();
  const minuter = /^(t|h)/.test(enhet) ? tal * 60 : tal;

  // Över ett dygn är det ingen spistimer utan en jästid eller marinering, och
  // en nedräkning i laga-läget är fel verktyg för den.
  if (minuter > 24 * 60) return null;

  return Math.round(minuter);
}

/** "9:05" — nedräkningens kvarvarande tid. */
export function formateraNedräkning(sekunder: number): string {
  const s = Math.max(0, Math.round(sekunder));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Etikett på timerknappen: "10 min" eller "1 h 30 min". */
export function formateraTidsetikett(minuter: number): string {
  if (minuter < 60) return `${minuter} min`;
  const h = Math.floor(minuter / 60);
  const m = minuter % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
