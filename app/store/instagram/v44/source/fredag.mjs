// "Fredagsmys?": omslag med matfoto + ugnsnachosen ur veckomenyn (bild 2–3 är
// kopior av 1-veckans-recept/8–9).
//   TOOLS=<mapp med puppeteer-core> node app/store/instagram/v44/source/fredag.mjs
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { C, OUT, stamp, page, browser } from './stil.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const FOTO = pathToFileURL(join(DIR, 'fredag', 'nachos.jpg')).href;

const html = page(C.skog, `
  <img src="${FOTO}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 30%">
  <div style="position:absolute;left:0;right:0;top:0;height:300px;background:linear-gradient(180deg,rgba(29,59,46,.9) 0%,rgba(29,59,46,.65) 55%,rgba(29,59,46,0) 100%)"></div>
  <div style="position:absolute;left:0;right:0;top:40px;text-align:center">
    <div class="kick" style="color:${C.lime}">Fredag · 25 min</div>
    <div class="hand" style="color:#fff;font-size:92px;margin-top:6px">Fredagsmys?</div>
    <div class="sub" style="color:#fff;margin-top:4px">Ugnsnachos direkt ur formen – svep för receptet →</div>
  </div>
  ${stamp('right:30px;bottom:34px', C.lime, C.skog)}`);

const b = await browser();
const p = await b.newPage();
await p.setViewport({ width: 540, height: 675, deviceScaleFactor: 2 });
const f = join(mkdtempSync(join(tmpdir(), 'handlis-fredag-')), 'c.html');
writeFileSync(f, html);
await p.goto(pathToFileURL(f).href, { waitUntil: 'networkidle0' });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: join(OUT, '6-fredagsmys', '1.png') });
await b.close();
