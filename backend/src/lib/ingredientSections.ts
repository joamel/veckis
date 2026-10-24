/**
 * Underrubriker i en importerad ingredienslista. schema.org har ingen plats
 * för dem i recipeIngredient (bara en platt lista med strängar), så sajterna
 * lägger rubriken som en egen rad: "Deg:", "TILL SÅSEN", "<strong>Topping</strong>".
 * Förut blev den raden en ingrediens som hette "deg:" — och ingredienserna
 * under rubrikerna gick inte att skilja åt.
 */

const MAX_RUBRIK = 40;

/** Rubriktexten om raden är en rubrik, annars null. */
export function ingredientHeading(line: string): string | null {
  const markerad = /^\s*<(strong|b|h\d)\b[^>]*>[\s\S]*<\/\1>\s*$/i.test(line);
  const text = line.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > MAX_RUBRIK) return null;
  // En mängd betyder ingrediens: "2 dl mjölk:" är ingen rubrik.
  if (/\d/.test(text)) return null;

  const utanKolon = text.replace(/:$/, '').trim();
  if (!utanKolon) return null;
  const harKolon = text.endsWith(':');
  const versaler = /\p{L}/u.test(utanKolon) && utanKolon === utanKolon.toUpperCase() && utanKolon.length >= 3;
  if (!harKolon && !versaler && !markerad) return null;

  // "TILL SÅSEN" → "Till såsen"; "Deg" lämnas som den är.
  return versaler ? utanKolon.charAt(0) + utanKolon.slice(1).toLowerCase() : utanKolon;
}

/**
 * Delar en platt lista i ingredienser med rubrik. Rubrikraderna försvinner ur
 * listan; raderna under dem får rubriken tills nästa rubrik kommer.
 */
export function withSections<T>(lines: string[], parse: (line: string) => T): Array<T & { section: string | null }> {
  let section: string | null = null;
  const out: Array<T & { section: string | null }> = [];
  for (const line of lines) {
    const rubrik = ingredientHeading(line);
    if (rubrik) { section = rubrik; continue; }
    out.push({ ...parse(line), section });
  }
  return out;
}
