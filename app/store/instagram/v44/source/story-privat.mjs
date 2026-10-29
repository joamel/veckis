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

// Kortleken: receptlistan längst fram, veckomenyn och laga-läget lätt vinklade
// bakom — en känsla av hela appen på en bild.
const kort = (src, { left, top, w, rot, z, dim = 1 }) => {
  const h = Math.round(w * 2622 / 1206);
  return `
  <div style="position:absolute;left:${left}px;top:${top}px;padding:8px;border-radius:42px;background:#0d1f16;transform:rotate(${rot}deg);z-index:${z};box-shadow:0 22px 50px rgba(0,0,0,.35)">
    <img src="${pathToFileURL(src).href}" style="display:block;width:${w}px;height:${h}px;border-radius:35px;object-fit:cover;object-position:top;filter:brightness(${dim})">
  </div>`;
};
if (existsSync(fil('recept.jpg')) && existsSync(fil('laga.png'))) {
  const FRAM = 280, framH = Math.round(FRAM * 2622 / 1206);
  STORIES['story-app-kortlek'] = page(C.lime, `
    ${veg('broccoli', C.skog, 'width:80px;left:16px;top:46px;transform:rotate(-10deg)', C.lime)}
    ${veg('avocado', C.skog, 'width:70px;right:20px;top:60px;transform:rotate(14deg)', C.lime)}
    ${kort(fil('veckomeny-bilder.jpg'), { left: 22, top: 150, w: 240, rot: -9, z: 1, dim: 0.92 })}
    ${kort(fil('laga.png'), { left: 262, top: 150, w: 240, rot: 9, z: 1, dim: 0.92 })}
    ${kort(fil('recept.jpg'), { left: (540 - FRAM) / 2 - 8, top: 118, w: FRAM, rot: 0, z: 2 })}
    <div style="position:absolute;left:0;right:0;top:${118 + framH + 16 + 22}px;display:flex;justify-content:center;align-items:center;gap:12px;z-index:3">
      <img src="${ICON}" style="width:50px;height:50px;border-radius:13px">
      ${brand(C.skog, 42)}
    </div>`, 960);
}

const b = await browser();
const p = await b.newPage();
await p.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
const tmp = mkdtempSync(join(tmpdir(), 'handlis-story-'));
const bara = process.env.ONLY;
for (const [namn, html] of Object.entries(STORIES)) {
  if (bara && namn !== bara) continue;
  const f = join(tmp, `${namn}.html`); writeFileSync(f, html);
  await p.goto(pathToFileURL(f).href, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(OUT, `${namn}.png`) });
  console.log(namn);
}
await b.close();
