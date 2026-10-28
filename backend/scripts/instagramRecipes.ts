/**
 * Kör hela "Dela till Handlis"-tolkningen på ett Instagram-inlägg lokalt och
 * visar hur många recept AI:n hittar — för att felsöka utan att gå via appen.
 * Kräver ANTHROPIC_API_KEY (i backend/.env eller som miljövariabel). Kostar
 * ett Haiku-anrop.
 *
 *   npx tsx scripts/instagramRecipes.ts https://www.instagram.com/p/<id>/
 */
import 'dotenv/config';
import { extractMetaText, LINK_PREVIEW_USER_AGENT } from '../src/lib/pageMeta';

async function main() {
  const url = process.argv[2];
  if (!url) { console.error('Ange en Instagram-länk.'); process.exit(1); }
  if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY saknas.'); process.exit(1); }
  // Importeras först nu: modulen skapar sin Anthropic-klient vid laddning.
  const { parseRecipeTextWithAI } = await import('../src/routes/recipes');
  const html = await (await fetch(url, { headers: { 'User-Agent': LINK_PREVIEW_USER_AGENT } })).text();
  const caption = extractMetaText(html);
  console.log('Bildtext:', [...caption].length, 'tecken');
  const t0 = Date.now();
  const recept = await parseRecipeTextWithAI(caption);
  console.log(`Tid: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log('Recept:', recept.length);
  for (const r of recept) console.log(`- ${r.day ?? "—"} ${r.title} (${r.ingredients.length} ingredienser${r.instructions ? "" : ", INGA instruktioner"})`);
  process.exit(0);
}
void main();
