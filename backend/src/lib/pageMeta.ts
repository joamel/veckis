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
