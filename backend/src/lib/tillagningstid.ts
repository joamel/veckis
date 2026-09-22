/**
 * Tillagningstid ur de former den kommer i: ISO 8601-varaktighet från JSON-LD
 * ("PT1H30M") och ett tal från AI-tolkningen. Resultatet är alltid hela minuter
 * eller null — null betyder "receptet säger inget", och då visas ingen tid
 * alls hellre än en gissning.
 */

// Över ett dygn är det jäsning eller marinering, inte tid att planera en
// middag efter. Samma gräns som laga-lägets timer.
const MAX_MINUTER = 24 * 60;

/** Rimligt antal minuter, annars null. */
export function städaMinuter(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const m = Math.round(v);
  return m > 0 && m <= MAX_MINUTER ? m : null;
}

/** "PT1H30M", "PT45M", "P0DT2H", "PT90M", "PT1.5H" → minuter. Övrigt → null. */
export function tolkaIsoVaraktighet(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = v.trim().toUpperCase().match(/^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/);
  if (!m || m.slice(1).every(x => x === undefined)) return null;
  const tal = (x: string | undefined) => (x ? parseFloat(x.replace(',', '.')) : 0);
  const minuter = tal(m[1]) * 1440 + tal(m[2]) * 60 + tal(m[3]) + tal(m[4]) / 60;
  return städaMinuter(minuter);
}

/**
 * Tiden ur ett JSON-LD-recept. totalTime i första hand — det är vad man
 * planerar efter. Saknas den: tillagning + förberedelse, eller den som finns.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tidUrJsonLd(r: any): number | null {
  const total = tolkaIsoVaraktighet(r?.totalTime);
  if (total !== null) return total;
  const cook = tolkaIsoVaraktighet(r?.cookTime);
  const prep = tolkaIsoVaraktighet(r?.prepTime);
  if (cook === null && prep === null) return null;
  return städaMinuter((cook ?? 0) + (prep ?? 0));
}
