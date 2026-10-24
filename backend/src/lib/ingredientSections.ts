/**
 * Underrubriker i en importerad ingredienslista. schema.org har ingen plats
 * för dem i recipeIngredient (bara en platt lista med strängar), så sajterna
 * lägger rubriken som en egen rad: "Deg:", "TILL SÅSEN", "<strong>Topping</strong>"
 * — eller, som Köket, bara ordet: "Fyllning", "Pensling", "Garnering". Förut
 * blev den raden en ingrediens, och ingredienserna under rubrikerna gick inte
 * att skilja åt.
 *
 * Ett ensamt ord går inte att skilja från en ingrediens på formen ("Fyllning"
 * mot "ägg"), så två källor till: sidans egna rubriker i HTML:en, där samma ord
 * står i en rubriktagg, och en lista med vanliga rubrikord som reserv.
 */

const MAX_RUBRIK = 40;

/** Vanliga rubriker i svenska recept, i gemener. Gäller bara när ordet står
 *  ensamt på raden — "1 dl sås" eller "sås av tomater" är ingredienser. */
const RUBRIKORD = new Set([
  'deg', 'smet', 'botten', 'fyllning', 'fyllningen', 'sås', 'såsen', 'dressing', 'marinad',
  'topping', 'garnering', 'dekoration', 'pensling', 'glasyr', 'frosting', 'kräm', 'smörkräm',
  'sockerlag', 'smuldeg', 'crumble', 'täcke', 'röra', 'tillbehör', 'servering', 'till servering',
  'till garnering', 'till pensling', 'till såsen', 'till fyllningen', 'till degen', 'till toppingen',
]);

const normalisera = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().replace(/:$/, '').trim().toLowerCase();

/**
 * Texterna i sidans rubriker: h2–h6 och element vars klassnamn säger att de
 * är en rubrik ("sectionTitle", "ingredient-group-heading" …). Används för att
 * känna igen en rubrikrad i JSON-LD som annars ser ut som en ingrediens.
 */
export function htmlHeadingTexts(html: string): Set<string> {
  const ut = new Set<string>();
  const lägg = (t: string) => { const n = normalisera(t); if (n && n.length <= MAX_RUBRIK && !/\d/.test(n)) ut.add(n); };
  for (const m of html.matchAll(/<h[2-6]\b[^>]*>([\s\S]*?)<\/h[2-6]>/gi)) lägg(m[1]);
  for (const m of html.matchAll(/<(\w+)\b[^>]*class=["'][^"']*(?:section|group|heading|title|subtitle)[^"']*["'][^>]*>([^<]{1,60})<\/\1>/gi)) lägg(m[2]);
  return ut;
}

/** Rubriktexten om raden är en rubrik, annars null. */
export function ingredientHeading(line: string, sidrubriker?: Set<string>): string | null {
  const markerad = /^\s*<(strong|b|h\d)\b[^>]*>[\s\S]*<\/\1>\s*$/i.test(line);
  const text = line.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > MAX_RUBRIK) return null;
  // En mängd betyder ingrediens: "2 dl mjölk:" är ingen rubrik.
  if (/\d/.test(text)) return null;

  const utanKolon = text.replace(/:$/, '').trim();
  if (!utanKolon) return null;
  const harKolon = text.endsWith(':');
  const versaler = /\p{L}/u.test(utanKolon) && utanKolon === utanKolon.toUpperCase() && utanKolon.length >= 3;
  const nyckel = utanKolon.toLowerCase();
  const kändRubrik = RUBRIKORD.has(nyckel) || !!sidrubriker?.has(nyckel);
  if (!harKolon && !versaler && !markerad && !kändRubrik) return null;

  // "TILL SÅSEN" → "Till såsen"; "Deg" lämnas som den är.
  return versaler ? utanKolon.charAt(0) + utanKolon.slice(1).toLowerCase() : utanKolon;
}

/**
 * Delar en platt lista i ingredienser med rubrik. Rubrikraderna försvinner ur
 * listan; raderna under dem får rubriken tills nästa rubrik kommer.
 */
export function withSections<T>(lines: string[], parse: (line: string) => T, sidrubriker?: Set<string>): Array<T & { section: string | null }> {
  let section: string | null = null;
  const out: Array<T & { section: string | null }> = [];
  for (const line of lines) {
    const rubrik = ingredientHeading(line, sidrubriker);
    if (rubrik) { section = rubrik; continue; }
    out.push({ ...parse(line), section });
  }
  return out;
}
