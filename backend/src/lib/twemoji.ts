/**
 * Twemoji (CC-BY 4.0, © Twitter/X och bidragsgivare): matsymbolerna i appens
 * platshållare för recept utan bild. Byggs till konturbilder av
 * scripts/build-dish-icons.ts; symbolen per recept väljs i lib/dishIcon.ts.
 */

/** "🍽️" → "1f37d": Twemojis filnamn. FE0F tas bort utom i ZWJ-sekvenser. */
export function twemojiCode(emoji: string): string {
  const cps = [...emoji].map(c => c.codePointAt(0)!.toString(16));
  return (emoji.includes('‍') ? cps : cps.filter(c => c !== 'fe0f')).join('-');
}

/** Första emojin i en text (en hel sekvens, även med ZWJ), eller null. */
export function firstEmoji(text: string): string | null {
  const m = text.match(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*/u);
  return m ? m[0] : null;
}

export function twemojiUrl(emoji: string): string {
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${twemojiCode(emoji)}.svg`;
}

/**
 * Symbolen som konturer: varje fylld form ritas bara som en linje i en färg,
 * så den ser ut som appens egna konturikoner.
 */
export function outlineSvg(svg: string, color: string, strokeWidth = 1.1): string {
  return svg
    .replace(/fill="#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?"/g, `fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"`)
    .replace(/stroke="#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?"(?! stroke-width)/g, `stroke="${color}"`);
}

/** Hämtar Twemoji-SVG:n; null om den inte gick att nå. */
export async function fetchEmojiSvg(emoji: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchFn(twemojiUrl(emoji), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const svg = await res.text();
    return svg.startsWith('<svg') ? svg : null;
  } catch {
    return null;
  }
}
