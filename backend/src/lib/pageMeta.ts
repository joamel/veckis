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

/** Instagram-länken i en delad bildtext, om det finns någon. */
export function instagramLinkIn(text: string): string | null {
  for (const m of text.match(/https?:\/\/\S+/gi) ?? []) {
    const url = m.replace(/[),.]+$/, '');
    if (isInstagramUrl(url)) return url;
  }
  return null;
}

/** Kontot ur Instagrams metatext. og:title är "Namn (@konto) • Instagram …". */
export function instagramAccount(metaText: string): string | undefined {
  return metaText.match(/\(@([\w.]{1,30})\)/)?.[1];
}

/** Vårt eget konto: bara dess recept får en bild vid import. */
const OWN_INSTAGRAM_ACCOUNT = 'handlis.app';

/**
 * Bilder till recepten vi själva lägger upp, per titel (gemener). Filerna ligger
 * i app/public/recept/ och kopieras till Cloudinary när receptet sparas. Så får
 * varje recept i en veckomeny sin egen bild, utan att vi beror på Instagrams
 * bildlänkar och utan omslagets text. Nytt recept: lägg filen där och en rad här.
 */
const OWN_RECIPE_IMAGES: Record<string, string> = {
  ugnsnachos: 'https://www.handlis.app/recept/ugnsnachos.jpg',
};

/** Bilden till ett recept från vårt eget konto. Andras inlägg får aldrig någon. */
export function ownRecipeImage(title: string, account: string | undefined): string | null {
  if (account?.toLowerCase() !== OWN_INSTAGRAM_ACCOUNT) return null;
  return OWN_RECIPE_IMAGES[title.toLowerCase().trim()] ?? null;
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
