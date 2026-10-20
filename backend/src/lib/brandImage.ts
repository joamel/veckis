/**
 * Handlis-bild för ett recept utan bild: stor matsymbol på en cirkel och
 * "Handlis" i hörnet. Inget receptnamn i bilden — korten lägger namnet över
 * bildens nederkant och receptsidan har det som rubrik direkt under, så det
 * hade stått två gånger. Symbolen ligger mitt i, så den syns hur korten än
 * beskär bilden. Ingen AI-genererad bild — en
 * illustration i appens färger, så den alltid ser ut som Handlis och aldrig
 * låtsas vara ett foto av rätten.
 *
 * Symbolen ritas med Twemoji (CC-BY 4.0, © Twitter/X och bidragsgivare) i
 * stället för en emoji-font: serverns Linux har ingen färg-emoji, och en
 * text-emoji blev en tom ruta.
 */
import path from 'path';
import type { OverlayOptions } from 'sharp';

// sharp laddas först när en bild byggs: servern ska kunna starta även om
// bildbiblioteket inte går att ladda på plattformen — då misslyckas bara
// knappen, inte hela backenden (hälsokontrollen föll annars vid start).
async function loadSharp() {
  return (await import('sharp')).default;
}

export const BRAND_IMAGE_WIDTH = 1200;
export const BRAND_IMAGE_HEIGHT = 900;

const FONT = path.join(__dirname, '..', '..', 'assets', 'fonts', 'Outfit_700Bold.ttf');

const PALETTES = [
  // tones: symbolens färger byts mot dessa, mörkast → ljusast.
  { bg: '#eef1e8', circle: '#cde66b', mark: '#2c4a3b', tones: ['#1d3b2e', '#6f9a4f', '#ffffff'] },
  { bg: '#1d3b2e', circle: '#2c4a3b', mark: '#cde66b', tones: ['#142a1d', '#cde66b', '#f4f8ea'] },
];

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
 * Symbolen som en ikon i appens färger: varje färg i Twemoji-SVG:n byts mot
 * en av tre nyanser efter hur ljus den är. Detaljerna (smöret på våfflan,
 * fyllningen i tacon) finns kvar, men bilden blir Handlis och inte en
 * färggrann emoji.
 */
export function recolorSvg(svg: string, tones: string[]): string {
  return svg.replace(/(fill|stroke)="(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)"/g, (_m, attr: string, hex: string) => {
    const l = luminance(hex);
    const tone = l < 0.35 ? tones[0] : l < 0.7 ? tones[1] : tones[2];
    return `${attr}="${tone}"`;
  });
}

/** Samma titel → samma färg, så en bild som skapas om ser likadan ut — och
 *  receptlistan blir inte enfärgad. */
function paletteFor(title: string) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return PALETTES[h % PALETTES.length];
}

function escapeMarkup(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function text(str: string, size: number, color: string): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp({
    text: {
      text: `<span foreground="${color}">${escapeMarkup(str)}</span>`,
      font: `Outfit ${size}`,
      fontfile: FONT,
      rgba: true,
      dpi: 72,
    },
  }).png().toBuffer();
}

/**
 * Bygger bilden. emojiSvg = Twemoji-SVG:n (null → ingen symbol, bara cirkeln).
 */
export async function renderBrandImage(opts: { title: string; emojiSvg: string | null }): Promise<Buffer> {
  const sharp = await loadSharp();
  const W = BRAND_IMAGE_WIDTH, H = BRAND_IMAGE_HEIGHT;
  const p = paletteFor(opts.title);
  const cx = W / 2, cy = H / 2, r = 280, emojiSize = 360;

  const layers: OverlayOptions[] = [{
    input: Buffer.from(`<svg width="${W}" height="${H}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.circle}"/></svg>`),
    left: 0, top: 0,
  }];
  if (opts.emojiSvg) {
    const emoji = await sharp(Buffer.from(recolorSvg(opts.emojiSvg, p.tones)), { density: 600 }).resize(emojiSize, emojiSize).png().toBuffer();
    layers.push({ input: emoji, left: Math.round(cx - emojiSize / 2), top: Math.round(cy - emojiSize / 2) });
  }
  const mark = await text('Handlis', 30, p.mark);
  const mm = await sharp(mark).metadata();
  layers.push({ input: mark, left: W - mm.width! - 40, top: H - mm.height! - 30 });

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
