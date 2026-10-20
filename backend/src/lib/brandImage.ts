/**
 * Bild till ett recept utan bild — samma utseende som appens platshållare
 * (ljus eller mörkgrön yta med en svag matikon i konturstil), men med rättens
 * EGEN symbol i stället för en av appens åtta generiska ikoner. Ingen ny
 * bakgrund, ingen text: korten lägger namnet över bilden och receptsidan har
 * det som rubrik.
 *
 * Symbolen ritas med Twemoji (CC-BY 4.0, © Twitter/X och bidragsgivare) som
 * bara konturer i platshållarens ikonfärg.
 */
import type { OverlayOptions } from 'sharp';

// sharp laddas först när en bild byggs: servern ska kunna starta även om
// bildbiblioteket inte går att ladda på plattformen — då misslyckas bara
// knappen, inte hela backenden (hälsokontrollen föll annars vid start).
async function loadSharp() {
  return (await import('sharp')).default;
}

export const BRAND_IMAGE_WIDTH = 1200;
export const BRAND_IMAGE_HEIGHT = 900;

// Platshållarens ytor i ljust läge (nyDesign: platsLjus/skogMellan) — en bild
// kan inte följa mörkt läge. Linjerna tydligare än platshållarens svaga ikon:
// med samma svaghet blev bilderna tråkiga och likadana (feedback 2026-10-20).
const PALETTES = {
  ljus: { bg: '#cddcb3', line: '#7d9a68' },
  mork: { bg: '#2c4a3b', line: '#9fbd5c' },
};

export const FALLBACK_EMOJI = '🍽️';

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

function luminance(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Symbolen som konturer: varje fylld form ritas bara som en linje i
 * platshållarens ikonfärg, så den ser ut som appens egna konturikoner.
 */
export function outlineSvg(svg: string, color: string, strokeWidth = 1.1): string {
  return svg
    .replace(/fill="#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?"/g, `fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"`)
    .replace(/stroke="#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?"(?! stroke-width)/g, `stroke="${color}"`);
}

/** Hälften mörka, hälften ljusa — efter titeln, så en bild som skapas om ser
 *  likadan ut. */
function paletteFor(title: string) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return h % 2 === 0 ? PALETTES.mork : PALETTES.ljus;
}

/**
 * Bygger bilden. emojiSvg = Twemoji-SVG:n (null → ingen symbol, bara cirkeln).
 */
export async function renderBrandImage(opts: { title: string; emojiSvg: string | null }): Promise<Buffer> {
  const sharp = await loadSharp();
  const W = BRAND_IMAGE_WIDTH, H = BRAND_IMAGE_HEIGHT;
  const p = paletteFor(opts.title);
  const size = 440;
  const layers: OverlayOptions[] = [];
  if (opts.emojiSvg) {
    const icon = await sharp(Buffer.from(outlineSvg(opts.emojiSvg, p.line)), { density: 600 }).resize(size, size).png().toBuffer();
    layers.push({ input: icon, left: Math.round((W - size) / 2), top: Math.round((H - size) / 2) });
  }
  return sharp({ create: { width: W, height: H, channels: 3, background: p.bg } })
    .composite(layers)
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Hämtar Twemoji-SVG:n; null om den inte gick att nå (bilden blir ändå). */
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
