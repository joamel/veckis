// Story för en privat Instagram-sida (1080×1920): en riktig skärmbild ur appen i
// en stor, centrerad telefonram. Ingen text — den skrivs i Instagram ovanpå, med
// egna ord. Grönsakerna i hörnen.
//   TOOLS=<mapp med puppeteer-core> node app/store/instagram/v44/source/story-privat.mjs
// Skärmbilderna i story/ (tagna på telefonen). Finns story/recept.jpg blir
// det också en bild 2 med receptvyn.
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { C, ICON, OUT, veg, brand, page, browser } from './stil.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const fil = f => join(DIR, 'story', f);
// Skärmbilderna är 1206×2622 (telefonens egna, utan statusrad).
const SW = 300, SH = Math.round(SW * 2622 / 1206);
// Telefonen lite upp, så att loggan under hamnar ovanför Instagrams svarsfält.
const TOP = 118;
const telefon = src => `
  <div style="position:absolute;left:${(540 - SW) / 2 - 9}px;top:${TOP}px;padding:9px;border-radius:46px;background:#0d1f16;box-shadow:0 26px 60px rgba(0,0,0,.4)">
    <img src="${pathToFileURL(src).href}" style="display:block;width:${SW}px;height:${SH}px;border-radius:38px;object-fit:cover;object-position:top">
  </div>`;
// Liten logga under telefonen — appikonen och "Handlis 💚", som i allt annat.
const logga = färg => `
  <div style="position:absolute;left:0;right:0;top:${TOP + SH + 18 + 22}px;display:flex;justify-content:center;align-items:center;gap:10px">
    <img src="${ICON}" style="width:34px;height:34px;border-radius:9px">
    ${brand(färg, 28)}
  </div>`;

const STORIES = {
  'story-vecka': page(C.skog, `
    ${veg('broccoli', C.lime, 'width:90px;left:10px;top:60px;transform:rotate(-10deg);opacity:.9')}
    ${veg('avocado', C.lime, 'width:80px;right:14px;bottom:70px;transform:rotate(14deg);opacity:.9', C.skog)}
    ${telefon(fil('veckomeny-bilder.jpg'))}
    ${logga('#fff')}`, 960),
};
if (existsSync(fil('recept.jpg'))) {
  STORIES['story-recept'] = page(C.rosa, `
    ${veg('chili', C.skog, 'width:84px;left:12px;top:60px;transform:rotate(-8deg)')}
    ${veg('lemon', C.skog, 'width:84px;right:12px;bottom:70px;transform:rotate(12deg)', C.rosa)}
    ${telefon(fil('recept.jpg'))}
    ${logga(C.skog)}`, 960);
}

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
