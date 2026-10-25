/**
 * Mäter hur mycket av en Instagram-bildtext vi får ut via länkförhandsvisningen
 * — samma hämtning och tolkning som "Dela till Handlis" (scrapeRecipe).
 *
 *   npx tsx scripts/instagramCaption.ts https://www.instagram.com/p/<id>/
 *
 * Jämför längden med bildtexten i inlägget: kapas den kommer bara de första
 * recepten i en veckomeny med.
 */
import { extractMetaText, LINK_PREVIEW_USER_AGENT } from '../src/lib/pageMeta';

async function main() {
  const url = process.argv[2];
  if (!url) { console.error('Ange en Instagram-länk.'); process.exit(1); }
  const res = await fetch(url, { headers: { 'User-Agent': LINK_PREVIEW_USER_AGENT } });
  console.log('HTTP', res.status);
  const html = await res.text();
  const text = extractMetaText(html);
  console.log('Tecken ut:', [...text].length);
  console.log('--- början ---\n' + text.slice(0, 300));
  console.log('--- slutet ---\n' + text.slice(-300));
}
void main();
