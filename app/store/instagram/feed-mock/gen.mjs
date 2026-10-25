// Mock av hur @handlis.app-flödet kan se ut (inte för publicering).
// Bygger feed-mock.png: node app/store/instagram/feed-mock/gen.mjs
// Rutor märkta "eget foto" är platshållare för riktiga bilder — vi har inga matfoton än.
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const DIR = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(DIR, '../../../assets');
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const font = f => pathToFileURL(join(ASSETS, 'fonts', f)).href;
const ICON = pathToFileURL(join(ASSETS, 'icon.png')).href;

// Varumärket + en varm matfärg och två pasteller, så flödet får liv utan att
// tappa skog & lime.
const C = { skog: '#1d3b2e', lime: '#cde66b', mint: '#cfddb4', cream: '#f4f7ec', korall: '#f3a98f', persika: '#fbe3d3', himmel: '#d6e6ee' };

const VEG = {
  broccoli: `<circle cx="68" cy="72" r="38"/><circle cx="114" cy="54" r="42"/><circle cx="148" cy="94" r="34"/><circle cx="98" cy="102" r="38"/><circle cx="52" cy="112" r="26"/><path d="M82 122 C 86 140 84 165 78 186 Q 100 196 124 186 C 116 165 114 140 120 122 Z"/>`,
  pepper: `<path d="M52 72 C 34 96 36 150 62 176 C 78 192 94 182 100 172 C 106 182 122 192 138 176 C 164 150 166 96 148 72 C 128 56 116 66 100 63 C 84 66 72 56 52 72 Z"/><path d="M100 66 C 100 46 108 32 124 26" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round"/>`,
  lemon: `<g transform="rotate(-28 100 112)"><ellipse cx="100" cy="112" rx="72" ry="54"/><circle cx="26" cy="112" r="10"/><circle cx="174" cy="112" r="10"/></g><path d="M128 52 C 140 22 170 12 194 16 C 188 44 162 62 128 52 Z"/>`,
  chili: `<path d="M62 52 C 104 46 136 74 150 118 C 158 144 166 168 184 190 C 140 184 108 158 88 126 C 74 104 62 84 58 66 Z"/><path d="M40 58 C 44 40 60 34 76 42 C 80 56 72 70 56 72 C 48 70 42 66 40 58 Z"/><path d="M50 46 C 42 32 42 20 52 10" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>`,
  avocado: `<path d="M100 18 C 126 18 136 54 146 84 C 166 136 146 186 100 186 C 54 186 34 136 54 84 C 64 54 74 18 100 18 Z"/><circle cx="100" cy="132" r="30" fill="var(--hole)"/>`,
};
const veg = (name, color, style, hole = C.skog) => `<svg viewBox="0 0 200 200" style="position:absolute;color:${color};fill:${color};--hole:${hole};${style}">${VEG[name]}</svg>`;

// Återkommande stämpel — vår "#Ha alltid ägg hemma!".
const stamp = (style = 'right:8px;top:10px') => `<div class="stamp" style="${style}">#handlaengång</div>`;
const reel = '<div class="badge">▶</div>';
const multi = '<div class="badge">❐</div>';
const photo = (label, bg, extra = '') => `<div class="tile" style="background:${bg}">${extra}<div class="photo">📷 eget foto<br><b>${label}</b></div></div>`;

const TILES = [
  // Rad 1 — nyast
  `<div class="tile" style="background:${C.skog}">${reel}${veg('lemon', C.lime, 'width:56px;left:-10px;top:14px;transform:rotate(-14deg)')}${veg('chili', C.lime, 'width:52px;right:-6px;bottom:20px')}
    <div class="center"><div class="hand" style="color:#fff;font-size:30px">Hinner inte<br>handla?</div><div class="small" style="color:${C.lime}">Skriv vad du har hemma</div></div></div>`,
  photo('Söndagsplanering vid köksbordet', `linear-gradient(160deg,#e9dcc8,#c9b49a)`, stamp('left:8px;bottom:12px;top:auto;transform:rotate(-6deg)')),
  `<div class="tile" style="background:${C.lime}">${multi}<div class="center"><div class="hand" style="color:${C.skog};font-size:27px">Tänk vad många<br>middagar som<br>börjar med<br>en lista</div></div>${veg('pepper', C.skog, 'width:60px;right:-12px;bottom:-8px;transform:rotate(-12deg)')}</div>`,
  // Rad 2
  `<div class="tile" style="background:${C.persika}">${multi}${veg('avocado', C.korall, 'width:90px;right:-16px;top:40px;transform:rotate(16deg)', C.persika)}
    <div style="position:absolute;left:12px;top:16px"><div class="kick" style="color:#b0563a">Fredag</div><div class="hand" style="color:${C.skog};font-size:30px;line-height:.95">Ugns-<br>nachos</div></div>
    <div class="pill" style="left:12px;bottom:14px">25 min · 4 port</div></div>`,
  `<div class="tile" style="background:${C.skog}">${multi}<div class="center"><div class="kick" style="color:${C.lime}">Veckomeny v.44</div><div class="sans" style="color:#fff;font-size:21px">Veckans<br>middagar är<br>redan klara.</div></div>${veg('broccoli', C.lime, 'width:50px;left:10px;bottom:10px')}${veg('avocado', C.lime, 'width:40px;right:12px;bottom:14px')}</div>`,
  `<div class="tile" style="background:${C.cream}">${stamp()}<div style="position:absolute;left:14px;right:14px;top:46px">
      <div class="kick" style="color:#2f5a44">Listan i butikens ordning</div>
      ${['Frukt & grönt', 'Bröd', 'Mejeri', 'Kött & fisk', 'Frys'].map((t, i) => `<div class="row"><span class="dot" style="background:${i < 2 ? C.lime : '#dfe6d4'}"></span>${t}</div>`).join('')}
    </div></div>`,
  // Rad 3
  `<div class="tile" style="background:${C.himmel}"><div class="bubble">Visste du att du kan <b>fota en sida ur kokboken</b> – och få inköpslistan på köpet?</div>${veg('lemon', '#9cc0d0', 'width:70px;right:-14px;bottom:-6px;transform:rotate(20deg)')}</div>`,
  photo('Barnen skriver på inköpslistan', `linear-gradient(160deg,#d7e3c2,#a9bf8c)`, reel),
  `<div class="tile" style="background:${C.korall}">${reel}<div class="center"><div class="hand" style="color:#fff;font-size:30px">Glömt<br>grädden..<br>igen 🙃</div></div></div>`,
  // Rad 4
  `<div class="tile" style="background:${C.mint}">${multi}<div class="center"><div class="sans" style="color:${C.skog};font-size:20px">7 sätt att<br>slippa åka<br>tillbaka</div><div class="small" style="color:#2f5a44">till affären</div></div>${stamp('right:8px;bottom:10px;top:auto;transform:rotate(5deg)')}</div>`,
  `<div class="tile" style="background:${C.skog}"><div class="center"><img src="${ICON}" style="width:46px;border-radius:12px;margin-bottom:10px"><div class="hand" style="color:${C.lime};font-size:34px">Handla<br>en gång.</div></div></div>`,
  photo('Bakom kulisserna: appen byggs', `linear-gradient(160deg,#dfe2e8,#b7bcc8)`, ''),
  // Rad 5
  `<div class="tile" style="background:${C.cream}"><div class="center"><div class="kick" style="color:#2f5a44">Fråga</div><div class="sans" style="color:${C.skog};font-size:19px">Vilken dag<br>storhandlar du?</div>
      <div style="display:flex;gap:5px;margin-top:10px">${['Fre', 'Lör', 'Sön'].map(d => `<span class="pill" style="position:static">${d}</span>`).join('')}</div></div></div>`,
  `<div class="tile" style="background:${C.lime}">${reel}${veg('broccoli', C.skog, 'width:64px;left:-10px;top:-6px')}<div class="center" style="padding-top:30px"><div class="hand" style="color:${C.skog};font-size:28px">Söndag..<br>men vänta!</div></div></div>`,
  `<div class="tile" style="background:${C.skog}">${multi}<div class="center"><div class="kick" style="color:${C.lime}">Hej! 👋</div><div class="sans" style="color:#fff;font-size:18px">Listan som<br>lär sig hur<br>du handlar</div></div>${stamp('left:8px;bottom:10px;top:auto;transform:rotate(-5deg)')}</div>`,
];

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=block" rel="stylesheet">
<style>
@font-face { font-family: Outfit; font-weight: 700; src: url(${font('Outfit_700Bold.ttf')}); }
@font-face { font-family: Outfit; font-weight: 600; src: url(${font('Outfit_600SemiBold.ttf')}); }
* { box-sizing: border-box; }
body { margin: 0; width: 540px; background: #0d0f0e; color: #fff; font-family: Outfit, sans-serif; }
.top { padding: 18px 18px 10px; }
.bar { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 22px; }
.prof { display: flex; align-items: center; gap: 18px; margin-top: 16px; }
.avatar { width: 84px; height: 84px; border-radius: 42px; padding: 3px; background: linear-gradient(45deg, ${C.lime}, ${C.korall}); }
.avatar img { width: 100%; height: 100%; border-radius: 39px; border: 3px solid #0d0f0e; }
.stats { display: flex; gap: 26px; font-size: 13px; color: #c8ccc9; } .stats b { display: block; font-size: 17px; color: #fff; }
.bio { font-size: 13px; line-height: 1.45; margin-top: 12px; color: #e6e9e7; } .bio b { color: #fff; }
.hl { display: flex; gap: 16px; margin-top: 14px; }
.hl div { text-align: center; font-size: 11.5px; color: #e6e9e7; }
.hl span { display: flex; align-items: center; justify-content: center; width: 58px; height: 58px; border-radius: 29px; border: 2px solid #3a3f3c; margin-bottom: 5px; font-size: 22px; }
.tabs { display: flex; justify-content: space-around; padding: 10px 0 8px; font-size: 18px; color: #8a8f8c; border-bottom: 1px solid #222; } .tabs b { color: #fff; border-bottom: 2px solid #fff; padding: 0 20px 6px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; }
.tile { position: relative; aspect-ratio: 3 / 4; overflow: hidden; }
.center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 10px; }
.hand { font-family: Caveat, Outfit, cursive; font-weight: 700; line-height: 1; transform: rotate(-3deg); }
.sans { font-weight: 700; line-height: 1.05; letter-spacing: -.4px; }
.kick { font-weight: 700; font-size: 8.5px; letter-spacing: 1.4px; text-transform: uppercase; margin-bottom: 5px; }
.small { font-weight: 600; font-size: 10px; margin-top: 7px; }
.stamp { position: absolute; background: ${C.lime}; color: ${C.skog}; font-weight: 700; font-size: 9.5px; padding: 4px 7px; border-radius: 5px; transform: rotate(6deg); box-shadow: 0 2px 6px rgba(0,0,0,.18); z-index: 2; }
.badge { position: absolute; right: 7px; top: 6px; color: #fff; font-size: 13px; text-shadow: 0 1px 3px rgba(0,0,0,.4); z-index: 3; }
.photo { position: absolute; inset: 10px; border: 1.5px dashed rgba(255,255,255,.75); border-radius: 8px; display: flex; align-items: center; justify-content: center; text-align: center; padding: 10px; font-weight: 600; font-size: 10px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.25); }
.photo b { font-size: 12px; }
.pill { position: absolute; background: ${C.skog}; color: ${C.lime}; font-weight: 700; font-size: 9.5px; padding: 4px 8px; border-radius: 10px; }
.row { display: flex; align-items: center; gap: 7px; background: #fff; border-radius: 7px; padding: 6px 8px; margin-top: 5px; font-weight: 600; font-size: 11px; color: ${C.skog}; }
.dot { width: 9px; height: 9px; border-radius: 5px; }
.bubble { position: absolute; left: 12px; top: 22px; right: 22px; background: #fff; color: ${C.skog}; border-radius: 22px 22px 22px 6px; padding: 14px 12px; font-weight: 600; font-size: 12.5px; line-height: 1.3; }
</style></head><body>
<div class="top">
  <div class="bar">← handlis.app</div>
  <div class="prof"><div class="avatar"><img src="${ICON}"></div>
    <div class="stats"><div><b>15</b>inlägg</div><div><b>—</b>följare</div><div><b>—</b>följer</div></div></div>
  <div class="bio"><b>Handlis</b> · Veckomeny & inköpslista<br>Planera veckan, handla en gång 🛒💚<br>Listan lär sig hur du handlar · gratis<br><span style="color:#9dc3ff">handlis.app</span></div>
  <div class="hl">${[['🗓️', 'Veckomeny'], ['💡', 'Tips'], ['🍝', 'Recept'], ['📱', 'Så funkar det'], ['🛒', 'Kom igång']].map(([e, t]) => `<div><span>${e}</span>${t}</div>`).join('')}</div>
</div>
<div class="tabs"><b>▦</b><span>▶</span><span>⟲</span><span>☺</span></div>
<div class="grid">${TILES.join('')}</div>
</body></html>`;

const tmp = mkdtempSync(join(tmpdir(), 'handlis-feed-'));
const file = join(tmp, 'feed.html');
writeFileSync(file, html);
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
  '--window-size=540,1640', '--virtual-time-budget=5000', `--screenshot=${join(DIR, 'feed-mock.png')}`, pathToFileURL(file).href], { stdio: 'ignore' });
console.log('feed-mock.png');
