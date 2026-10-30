// "Sugen på nachos?": omslag med matfoto + ugnsnachosen ur veckomenyn, med uppmaningen
// att dela receptet till Handlis. Bild 3 är en kopia av 1-veckans-recept/9.
//   TOOLS=<mapp med puppeteer-core> node app/store/instagram/v44/source/fredag.mjs
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { C, OUT, stamp, page, browser, renderCarousel } from './stil.mjs';
import { recipe } from './veckomeny.mjs';
import { RECIPES } from './recipes.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const FOTO = pathToFileURL(join(DIR, 'fredag', 'nachos.jpg')).href;

const html = page(C.skog, `
  <img src="${FOTO}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 30%">
  <div style="position:absolute;left:0;right:0;top:0;height:300px;background:linear-gradient(180deg,rgba(29,59,46,.9) 0%,rgba(29,59,46,.65) 55%,rgba(29,59,46,0) 100%)"></div>
  <div style="position:absolute;left:0;right:0;top:40px;text-align:center">
    <div class="kick" style="color:${C.lime}">Ugnsnachos · 25 min</div>
    <div class="hand" style="color:#fff;font-size:78px;margin-top:6px">Sugen på nachos?</div>
    <div class="sub" style="color:#fff;margin-top:4px">Tryck Dela → välj Handlis, så ligger receptet i appen</div>
  </div>
  ${stamp('right:30px;bottom:34px', C.lime, C.skog)}`);

const b = await browser();
await renderCarousel(b, '6-sugen-pa-nachos', [html, recipe({ ...RECIPES[4], day: null }, 4, '📲 Tryck Dela → välj Handlis')]);
await b.close();
