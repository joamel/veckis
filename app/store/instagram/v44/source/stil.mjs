// Den nya Instagram-stilen (från 2026-10-25, se ../../feed-mock/): handskrivna
// rubriker (Caveat), skog/lime + pasteller, lime-silhuetter och stämpeln
// "Handla en gång ✓". Används av veckomeny.mjs; sondag.mjs har ännu en egen
// kopia av samma stil — flytta över den vid nästa ändring.
//
// Kräver puppeteer-core och ffmpeg-static, installerade UTANFÖR repot:
//   TOOLS=<mapp med node_modules> node app/store/instagram/v44/source/<fil>.mjs
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const DIR = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(DIR, '../../../../assets');
export const OUT = join(DIR, '..');
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const req = createRequire(join(process.env.TOOLS ?? DIR, 'package.json'));
export const FFMPEG = () => req('ffmpeg-static');
const font = f => pathToFileURL(join(ASSETS, 'fonts', f)).href;
export const ICON = pathToFileURL(join(ASSETS, 'icon.png')).href;

export const C = { skog: '#1d3b2e', lime: '#cde66b', mint: '#cfddb4', cream: '#f4f7ec', korall: '#f3a98f', persika: '#fbe3d3', himmel: '#d6e6ee', grön: '#2f5a44' };

const VEG = {
  broccoli: `<circle cx="68" cy="72" r="38"/><circle cx="114" cy="54" r="42"/><circle cx="148" cy="94" r="34"/><circle cx="98" cy="102" r="38"/><circle cx="52" cy="112" r="26"/><path d="M82 122 C 86 140 84 165 78 186 Q 100 196 124 186 C 116 165 114 140 120 122 Z"/>`,
  pepper: `<path d="M52 72 C 34 96 36 150 62 176 C 78 192 94 182 100 172 C 106 182 122 192 138 176 C 164 150 166 96 148 72 C 128 56 116 66 100 63 C 84 66 72 56 52 72 Z"/><path d="M100 66 C 100 46 108 32 124 26" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round"/>`,
  lemon: `<g transform="rotate(-28 100 112)"><ellipse cx="100" cy="112" rx="72" ry="54"/><circle cx="26" cy="112" r="10"/><circle cx="174" cy="112" r="10"/></g><path d="M128 52 C 140 22 170 12 194 16 C 188 44 162 62 128 52 Z"/>`,
  chili: `<path d="M62 52 C 104 46 136 74 150 118 C 158 144 166 168 184 190 C 140 184 108 158 88 126 C 74 104 62 84 58 66 Z"/><path d="M40 58 C 44 40 60 34 76 42 C 80 56 72 70 56 72 C 48 70 42 66 40 58 Z"/><path d="M50 46 C 42 32 42 20 52 10" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>`,
  avocado: `<path d="M100 18 C 126 18 136 54 146 84 C 166 136 146 186 100 186 C 54 186 34 136 54 84 C 64 54 74 18 100 18 Z"/><circle cx="100" cy="132" r="30" fill="var(--hole)"/>`,
};
/** Silhuett. `hole` = bakgrundsfärgen (avokadons kärna). */
export const veg = (name, color, style, hole = C.skog, id = '') =>
  `<svg ${id ? `id="${id}"` : ''} viewBox="0 0 200 200" style="position:absolute;color:${color};fill:${color};--hole:${hole};${style}">${VEG[name]}</svg>`;
export const vegIcon = (name, color, size, hole) =>
  `<svg viewBox="0 0 200 200" style="flex:none;width:${size}px;height:${size}px;color:${color};fill:${color};--hole:${hole}">${VEG[name]}</svg>`;
/** Stämpeln — vår slogan, ingen sökbar hashtagg. */
export const stamp = (style, bg = C.lime, fg = C.skog) =>
  `<div class="stamp" style="background:${bg};color:${fg};${style}">Handla en gång ✓</div>`;
/** Slutbildens varumärke — alltid stort (feedback 2026-10-25). */
export const brand = (color = '#fff', size = 52) =>
  `<div style="font-weight:700;font-size:${size}px;letter-spacing:-1px;color:${color};line-height:1">Handlis 💚</div>`;

const CSS = H => `
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=block');
@font-face { font-family: Outfit; font-weight: 700; src: url(${font('Outfit_700Bold.ttf')}); }
@font-face { font-family: Outfit; font-weight: 600; src: url(${font('Outfit_600SemiBold.ttf')}); }
* { box-sizing: border-box; }
html, body { margin: 0; width: 540px; height: ${H}px; overflow: hidden; font-family: Outfit, sans-serif; }
.wrap { position: absolute; inset: 0; padding: 0 44px; display: flex; flex-direction: column; justify-content: center; }
.kick { font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; }
.hand { font-family: Caveat, cursive; font-weight: 700; line-height: .95; }
.sub { font-weight: 600; font-size: 17px; line-height: 1.45; margin-top: 14px; }
.stamp { position: absolute; font-weight: 700; font-size: 15px; padding: 7px 12px; border-radius: 8px; transform: rotate(-5deg); box-shadow: 0 3px 10px rgba(0,0,0,.18); z-index: 5; }
.row { display: flex; align-items: center; gap: 14px; border-radius: 14px; padding: 14px 16px; margin-top: 10px; font-weight: 600; font-size: 17px; line-height: 1.3; }
.box { flex: none; width: 24px; height: 24px; border-radius: 7px; border: 2.5px solid ${C.skog}; }
.btns { display: flex; gap: 10px; margin-top: 22px; }
.btn { font-weight: 700; font-size: 14px; padding: 9px 16px; border-radius: 10px; }
.steps { margin: 0; padding: 0; list-style: none; counter-reset: s; }
.steps li { counter-increment: s; position: relative; padding-left: 30px; font-weight: 600; font-size: 15px; line-height: 1.38; margin-top: 6px; }
.steps li:first-child { margin-top: 0; }
.steps li::before { content: counter(s); position: absolute; left: 0; top: 0; width: 21px; height: 21px; border-radius: 11px; background: ${C.skog}; color: ${C.lime}; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; }
`;
export const page = (bg, inner, H = 675) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(H)}</style></head><body style="background:${bg}">${inner}</body></html>`;

/** Öppnar Chrome via puppeteer-core. */
export async function browser() {
  return req('puppeteer-core').launch({ executablePath: CHROME, headless: true });
}

/** Fotograferar en karusell (4:5) till OUT/<name>/1.png … */
export async function renderCarousel(b, name, slides) {
  const tmp = mkdtempSync(join(tmpdir(), 'handlis-ig-'));
  const p = await b.newPage();
  await p.setViewport({ width: 540, height: 675, deviceScaleFactor: 2 });
  rmSync(join(OUT, name), { recursive: true, force: true });
  mkdirSync(join(OUT, name), { recursive: true });
  for (let i = 0; i < slides.length; i++) {
    const f = join(tmp, `${i}.html`); writeFileSync(f, slides[i]);
    await p.goto(pathToFileURL(f).href, { waitUntil: 'networkidle0' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: join(OUT, name, `${i + 1}.png`) });
    console.log(`${name}/${i + 1}.png`);
  }
  await p.close();
}
