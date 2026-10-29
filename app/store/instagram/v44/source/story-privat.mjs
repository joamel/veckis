// Story för en privat Instagram-sida: två bilder (1080×1920) med riktiga
// skärmbilder ur appen i telefonramen — personlig ton, "jag har byggt en app".
//   TOOLS=<mapp med puppeteer-core> node app/store/instagram/v44/source/story-privat.mjs
// Skärmbilderna i story/ är tagna ur skärminspelningen (statusraden bortskuren).
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { C, ICON, OUT, veg, stamp, brand, page, browser } from './stil.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const bild = f => pathToFileURL(join(DIR, 'story', f)).href;
const SW = 240, SH = Math.round(SW * 2224 / 1080);
const telefon = (src, top) => `
  <div style="position:absolute;left:${(540 - SW) / 2 - 9}px;top:${top}px;padding:9px;border-radius:46px;background:#0d1f16;box-shadow:0 26px 60px rgba(0,0,0,.4)">
    <img src="${src}" style="display:block;width:${SW}px;height:${SH}px;border-radius:38px;object-fit:cover;object-position:top">
  </div>`;

const STORIES = {
  'story-privat-1': page(C.skog, `
    ${veg('broccoli', C.lime, 'width:84px;left:14px;top:330px;transform:rotate(-10deg);opacity:.9')}
    ${veg('avocado', C.lime, 'width:76px;right:16px;top:560px;transform:rotate(14deg);opacity:.9', C.skog)}
    <div style="position:absolute;left:0;right:0;top:112px;text-align:center">
      <div class="hand" style="color:${C.lime};font-size:58px">Jag har byggt<br>en app! 🙌</div>
    </div>
    ${telefon(bild('veckomeny.png'), 248)}
    <div style="position:absolute;left:0;right:0;bottom:126px;display:flex;flex-direction:column;align-items:center;gap:6px">
      ${brand('#fff', 40)}
      <div style="font-weight:600;font-size:16px;color:#c9d8c0">Veckomeny och inköpslista i ett</div>
    </div>`, 960),
  'story-privat-2': page(C.rosa, `
    ${veg('chili', C.skog, 'width:78px;left:14px;top:330px;transform:rotate(-8deg)')}
    ${veg('lemon', C.skog, 'width:78px;right:14px;top:560px;transform:rotate(12deg)', C.rosa)}
    <div style="position:absolute;left:0;right:0;top:112px;text-align:center">
      <div class="hand" style="color:${C.skog};font-size:52px">Recept → veckomeny<br>→ inköpslista</div>
    </div>
    ${telefon(bild('laga.png'), 248)}
    <div style="position:absolute;left:0;right:0;bottom:126px;display:flex;flex-direction:column;align-items:center;gap:8px">
      <div class="hand" style="color:${C.skog};font-size:40px">Testa gratis ↓</div>
      <div style="font-weight:600;font-size:15px;color:${C.grön}">App Store · Google Play · handlis.app</div>
    </div>
`, 960),
};

const b = await browser();
const p = await b.newPage();
await p.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
const tmp = mkdtempSync(join(tmpdir(), 'handlis-story-'));
for (const [namn, html] of Object.entries(STORIES)) {
  const f = join(tmp, `${namn}.html`); writeFileSync(f, html);
  await p.goto(pathToFileURL(f).href, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(OUT, `${namn}.png`) });
  console.log(namn);
}
await b.close();
