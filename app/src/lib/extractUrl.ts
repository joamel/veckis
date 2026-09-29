/**
 * För länkfältets onChangeText: rensar bara när det klistrats in text runt en
 * länk (något blanktecken inuti). Den som skriver en adress själv får vara
 * ifred — annars försvann punkten i "https://www.ica." medan man skrev.
 */
export function cleanPastedUrl(text: string): string {
  const trimmed = text.trim();
  const hasSpaceInside = [...trimmed].some(c => c.charCodeAt(0) <= 32);
  return hasSpaceInside ? extractUrl(text) : text;
}

/** Tecken som ofta hänger med i slutet av en länk i löptext. */
const TRAILING = new Set(['.', ',', ';', ':', '!', '?', ')', ']', '>', '"', "'", '”', '’']);

/**
 * Länken ur inklistrad text. Delar man ett recept från ICA:s app följer
 * receptets namn med före länken ("Kycklinggryta med curry https://www.ica.se/…"),
 * och då gick importen inte att köra förrän man raderat texten själv.
 * Första http(s)-länken vinner; finns ingen länk returneras texten trimmad,
 * så felmeddelandet om en ogiltig adress fortfarande kan visas.
 */
export function extractUrl(text: string): string {
  const lower = text.toLowerCase();
  const candidates = [lower.indexOf('https://'), lower.indexOf('http://')].filter(i => i >= 0);
  if (candidates.length === 0) return text.trim();
  const start = Math.min(...candidates);
  let end = start;
  // Fram till första blanktecknet (mellanslag, radbrytning, tab …).
  while (end < text.length && text.charCodeAt(end) > 32) end++;
  let url = text.slice(start, end);
  while (url.length > 0 && TRAILING.has(url[url.length - 1])) url = url.slice(0, -1);
  return url;
}
