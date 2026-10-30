// Hjälp för receptimport från länk: metataggarnas text och Instagram-
// specialfallet.

/** Instagram, Threads och deras kortlänkar — sidor som bara visar innehållet för inloggade. */
export function isInstagramUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am' || host === 'threads.net';
  } catch {
    return false;
  }
}

/** TikTok, inklusive kortlänkarna som delningen ger (vm./vt.tiktok.com). */
export function isTikTokUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www./, '').toLowerCase();
    return host === 'tiktok.com' || host.endsWith('.tiktok.com');
  } catch {
    return false;
  }
}

/**
 * Instagram visar inloggningsväggen för vanliga hämtningar men lägger
 * bildtexten i metataggarna när sidan hämtas för en länkförhandsvisning.
 * Samma UA som när en länk klistras in i en chatt.
 */
export const LINK_PREVIEW_USER_AGENT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Vårt eget konto: bara dess bilder följer med vid import. */
const OWN_INSTAGRAM_ACCOUNT = 'handlis.app';

/**
 * Bilden till ett Instagram-recept, bara för våra egna inlägg (andras bilder får
 * vi inte kopiera) och bara med ett enda recept: i en veckomeny hör omslaget inte
 * till något av dem. Länken är signerad och går ut, så den flyttas till vår
 * bildlagring när receptet sparas.
 */
export function ownPostImage(html: string, account: string | undefined, recipeCount: number): string | null {
  if (account?.toLowerCase() !== OWN_INSTAGRAM_ACCOUNT || recipeCount !== 1) return null;
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  return m ? decodeEntities(m[1]) : null;
}

/**
 * Texten i sidans beskrivande metataggar (og:title, og:description,
 * description, twitter:description), utan dubbletter. HTML-till-text-städningen
 * slänger hela <head>, men på Instagram är det just där bildtexten — alltså
 * receptet — ligger, och andra sajter har ofta en användbar sammanfattning där.
 */
export function extractMetaText(html: string): string {
  const wanted = new Set(['og:title', 'og:description', 'description', 'twitter:title', 'twitter:description']);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1] ?? '').toLowerCase();
    if (!wanted.has(key)) continue;
    const raw = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (!raw) continue;
    const text = decodeEntities(raw).trim();
    if (text && !seen.has(text)) { seen.add(text); out.push(text); }
  }
  return out.join('\n\n');
}
