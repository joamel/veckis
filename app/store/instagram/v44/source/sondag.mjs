// Söndagsinlägget "Dags att storhandla!" (karusell 4:5) och reelen "Vilken dag
// brukar du storhandla?" (9:16, 13 s) i den nya stilen: handskrivna rubriker
// (Caveat), skog/lime + pasteller och stämpeln "Handla en gång ✓".
//
//   node app/store/instagram/v44/source/sondag.mjs
//
// Kräver puppeteer-core och ffmpeg-static (H.264) — installeras utanför repot:
//   TOOLS=<mapp med node_modules> MUSIC=<music.wav från aterkommande/source/music.mjs>
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const DIR = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(DIR, '../../../../assets');
const OUT = join(DIR, '..');
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const req = createRequire(join(process.env.TOOLS ?? DIR, 'package.json'));
const puppeteer = req('puppeteer-core');
const FFMPEG = req('ffmpeg-static');
const font = f => pathToFileURL(join(ASSETS, 'fonts', f)).href;
const ICON = pathToFileURL(join(ASSETS, 'icon.png')).href;

const C = { skog: '#1d3b2e', lime: '#cde66b', mint: '#cfddb4', cream: '#f4f7ec', korall: '#f3a98f', persika: '#fbe3d3' };
const VEG = {
  broccoli: `<circle cx="68" cy="72" r="38"/><circle cx="114" cy="54" r="42"/><circle cx="148" cy="94" r="34"/><circle cx="98" cy="102" r="38"/><circle cx="52" cy="112" r="26"/><path d="M82 122 C 86 140 84 165 78 186 Q 100 196 124 186 C 116 165 114 140 120 122 Z"/>`,
  pepper: `<path d="M52 72 C 34 96 36 150 62 176 C 78 192 94 182 100 172 C 106 182 122 192 138 176 C 164 150 166 96 148 72 C 128 56 116 66 100 63 C 84 66 72 56 52 72 Z"/><path d="M100 66 C 100 46 108 32 124 26" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round"/>`,
  lemon: `<g transform="rotate(-28 100 112)"><ellipse cx="100" cy="112" rx="72" ry="54"/><circle cx="26" cy="112" r="10"/><circle cx="174" cy="112" r="10"/></g><path d="M128 52 C 140 22 170 12 194 16 C 188 44 162 62 128 52 Z"/>`,
  chili: `<path d="M62 52 C 104 46 136 74 150 118 C 158 144 166 168 184 190 C 140 184 108 158 88 126 C 74 104 62 84 58 66 Z"/><path d="M40 58 C 44 40 60 34 76 42 C 80 56 72 70 56 72 C 48 70 42 66 40 58 Z"/><path d="M50 46 C 42 32 42 20 52 10" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>`,
  avocado: `<path d="M100 18 C 126 18 136 54 146 84 C 166 136 146 186 100 186 C 54 186 34 136 54 84 C 64 54 74 18 100 18 Z"/><circle cx="100" cy="132" r="30" fill="var(--hole)"/>`,
};
const veg = (name, color, style, hole = C.skog, id = '') => `<svg ${id ? `id="${id}"` : ''} viewBox="0 0 200 200" style="position:absolute;color:${color};fill:${color};--hole:${hole};${style}">${VEG[name]}</svg>`;
const stamp = style => `<div class="stamp" style="${style}">Handla en gång ✓</div>`;

const CSS = W => `
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=block');
@font-face { font-family: Outfit; font-weight: 700; src: url(${font('Outfit_700Bold.ttf')}); }
@font-face { font-family: Outfit; font-weight: 600; src: url(${font('Outfit_600SemiBold.ttf')}); }
* { box-sizing: border-box; }
html, body { margin: 0; width: 540px; height: ${W}px; overflow: hidden; font-family: Outfit, sans-serif; }
.wrap { position: absolute; inset: 0; padding: 0 44px; display: flex; flex-direction: column; justify-content: center; }
.kick { font-weight: 700; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; }
.hand { font-family: Caveat, cursive; font-weight: 700; line-height: .95; }
.sub { font-weight: 600; font-size: 17px; line-height: 1.45; margin-top: 14px; }
.stamp { position: absolute; background: ${C.lime}; color: ${C.skog}; font-weight: 700; font-size: 15px; padding: 7px 12px; border-radius: 8px; transform: rotate(-5deg); box-shadow: 0 3px 10px rgba(0,0,0,.18); z-index: 5; }
.row { display: flex; align-items: center; gap: 14px; border-radius: 14px; padding: 14px 16px; margin-top: 10px; font-weight: 600; font-size: 17px; line-height: 1.3; }
.box { flex: none; width: 24px; height: 24px; border-radius: 7px; border: 2.5px solid ${C.skog}; }
.btns { display: flex; gap: 10px; margin-top: 24px; }
.btn { background: ${C.lime}; color: ${C.skog}; font-weight: 700; font-size: 14px; padding: 9px 16px; border-radius: 10px; }
`;
const page = (bg, inner, H = 675) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(H)}</style></head><body style="background:${bg}">${inner}</body></html>`;

// --- Karusellen -------------------------------------------------------------
const CAROUSEL = [
  page(C.lime, `
    ${veg('broccoli', C.skog, 'width:120px;right:-20px;top:30px;transform:rotate(12deg)')}
    ${veg('pepper', C.skog, 'width:100px;left:-18px;bottom:40px;transform:rotate(-14deg)')}
    <div class="wrap">
      <div class="kick" style="color:${C.skog}">Söndag</div>
      <div class="hand" style="color:${C.skog};font-size:92px;margin-top:8px">Dags att<br>storhandla!</div>
      <div class="sub" style="color:#2f5a44;max-width:360px">Så klarar du hela veckan på en enda tur till affären.</div>
    </div>
    ${stamp('right:40px;bottom:60px;background:'+C.skog+';color:'+C.lime)}`),
  page(C.cream, `
    <div class="wrap">
      <div class="kick" style="color:#2f5a44">Innan du går</div>
      <div class="hand" style="color:${C.skog};font-size:64px;margin:6px 0 10px">Fyra snabba koll</div>
      ${['Bestäm veckans middagar', 'Kolla kyl, frys och skafferi', 'Fråga hushållet vad som saknas', 'Skriv listan i butikens ordning'].map(t => `
        <div class="row" style="background:#fff;color:${C.skog}"><span class="box"></span>${t}</div>`).join('')}
    </div>
    ${veg('lemon', C.mint, 'width:110px;right:-24px;bottom:-14px;transform:rotate(18deg)')}`),
  page(C.skog, `
    <div class="wrap">
      <div class="kick" style="color:${C.lime}">Med Handlis</div>
      <div class="hand" style="color:#fff;font-size:60px;margin:6px 0 10px">…är det mesta redan gjort</div>
      ${[['Veckomenyn blir en inköpslista', 'med ett tryck'], ['Bocka bort det du har hemma', 'innan du går'], ['Hela hushållet lägger till', 'i samma lista'], ['Sorterad efter din butik', 'du går rakt igenom'], ['"Jag handlar"', 'så vet alla att du är där']].map(([t, d]) => `
        <div class="row" style="background:rgba(255,255,255,.07);color:#fff;padding:11px 16px;margin-top:8px"><span style="color:${C.lime};font-size:20px">✓</span><span>${t}<span style="display:block;font-size:13.5px;color:#b5c8ad">${d}</span></span></div>`).join('')}
    </div>`),
  page(C.persika, `
    ${veg('avocado', C.korall, 'width:120px;left:-26px;bottom:60px;transform:rotate(-16deg)', C.persika)}
    ${veg('chili', C.korall, 'width:110px;right:-20px;top:40px;transform:rotate(10deg)')}
    <div class="wrap" style="align-items:center;text-align:center">
      <img src="${ICON}" style="width:84px;border-radius:20px;margin-bottom:18px">
      <div class="hand" style="color:${C.skog};font-size:66px">Trevlig<br>storhandling!</div>
      <div class="sub" style="color:#7a4a38">Planera veckan i Handlis – gratis att använda.</div>
      <div class="btns"><div class="btn" style="background:${C.skog};color:${C.lime}">App Store</div><div class="btn" style="background:${C.skog};color:${C.lime}">Google Play</div></div>
      <div style="font-weight:600;font-size:13px;color:#7a4a38;margin-top:14px">Länk i bion · handlis.app</div>
    </div>
    ${stamp('left:46px;top:46px;transform:rotate(-7deg)')}`),
];

// --- Reelen ----------------------------------------------------------------
// Scenbyten vid 3,6 och 8,6 s — där music.mjs lägger sina "pop".
const DAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const REEL_S = 13, FPS = 30;
const REEL = page(C.lime, `
  <div id="s1" class="wrap" style="align-items:center;text-align:center">
    ${veg('broccoli', C.skog, 'width:150px;left:-30px;top:90px;transform:rotate(-10deg)', C.lime, 'v1')}
    ${veg('lemon', C.skog, 'width:130px;right:-26px;bottom:130px;transform:rotate(14deg)', C.lime, 'v2')}
    <div id="q" class="hand" style="color:${C.skog};font-size:96px">Vilken dag<br>brukar du<br>storhandla?</div>
    <div id="cart" style="font-size:70px;margin-top:20px">🛒</div>
  </div>
  <div id="s2" class="wrap" style="align-items:center;text-align:center;background:${C.cream}">
    <div class="hand" style="color:${C.skog};font-size:70px;margin-bottom:26px">Din dag?</div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;width:340px">${DAYS.map((d, i) => `
      <div id="d${i}" style="${i === 6 ? 'grid-column:span 2;' : ''}background:#fff;color:${C.skog};border-radius:18px;padding:16px 0;font-weight:700;font-size:28px;box-shadow:0 3px 10px rgba(0,0,0,.06)">${d}</div>`).join('')}</div>
  </div>
  <div id="s3" class="wrap" style="align-items:center;text-align:center;background:${C.skog};padding-bottom:160px">
    <div class="hand" style="color:#fff;font-size:72px">Skriv din dag<br>i kommentarerna</div>
    <div id="down" style="font-size:64px;margin-top:14px">👇</div>
    <div style="margin-top:36px;display:flex;flex-direction:column;align-items:center">
      <img src="${ICON}" style="width:96px;border-radius:22px">
      <!-- Varumärket alltid stort på reelens slutbild: Handlis + grönt hjärta. -->
      <div style="font-weight:700;font-size:56px;letter-spacing:-1px;color:#fff;margin-top:14px">Handlis 💚</div>
      <div style="font-weight:700;font-size:22px;color:${C.lime};margin-top:6px">Oavsett dag – handla en gång.</div>
      <div style="font-weight:600;font-size:15px;color:#c9d8c0;margin-top:6px">Länk i bion</div>
    </div>
  </div>
  <script>
    const $ = id => document.getElementById(id);
    const clamp = x => Math.max(0, Math.min(1, x));
    const ease = x => 1 - Math.pow(1 - clamp(x), 3);
    const pop = x => { x = clamp(x); return x < 1 ? 1 - Math.pow(1 - x, 3) * Math.cos(x * 9) : 1; };
    window.setTime = t => {
      $('s1').style.opacity = t < 3.6 ? 1 : 0;
      $('s2').style.opacity = t >= 3.6 && t < 8.6 ? 1 : 0;
      $('s3').style.opacity = t >= 8.6 ? 1 : 0;
      // Scen 1: frågan studsar in, vagnen rullar in.
      $('q').style.transform = 'rotate(-3deg) scale(' + (0.6 + 0.4 * pop(t / 0.7)) + ')';
      $('q').style.opacity = clamp(t / 0.25);
      $('cart').style.transform = 'translateX(' + ((1 - ease((t - 0.9) / 0.8)) * 400) + 'px)';
      $('v1').style.transform = 'rotate(' + (-10 + 6 * Math.sin(t * 2)) + 'deg)';
      $('v2').style.transform = 'rotate(' + (14 - 6 * Math.sin(t * 2.2)) + 'deg)';
      // Scen 2: dagarna poppar upp, sedan hoppar markeringen fre → lör → sön.
      const u = t - 3.6;
      for (let i = 0; i < 7; i++) {
        const el = $('d' + i);
        el.style.transform = 'scale(' + pop((u - i * 0.14) / 0.5) + ')';
        const hl = u > 1.6 && Math.min(6, 4 + Math.floor((u - 1.6) / 0.9)) === i && u < 4.6;
        el.style.background = hl ? '${C.lime}' : '#fff';
      }
      // Scen 3: pilen guppar.
      $('down').style.transform = 'translateY(' + (Math.abs(Math.sin((t - 8.6) * 4)) * 14) + 'px)';
    };
    setTime(0);
  </script>`, 960);

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), 'handlis-sondag-'));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await browser.newPage();

  const name = '3-sondag-storhandla';
  rmSync(join(OUT, name), { recursive: true, force: true });
  mkdirSync(join(OUT, name), { recursive: true });
  await p.setViewport({ width: 540, height: 675, deviceScaleFactor: 2 });
  for (let i = 0; i < CAROUSEL.length; i++) {
    const f = join(tmp, `c${i}.html`); writeFileSync(f, CAROUSEL[i]);
    await p.goto(pathToFileURL(f).href, { waitUntil: 'networkidle0' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: join(OUT, name, `${i + 1}.png`) });
    console.log(`${name}/${i + 1}.png`);
  }

  const frames = join(tmp, 'frames'); mkdirSync(frames);
  await p.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
  const f = join(tmp, 'reel.html'); writeFileSync(f, REEL);
  await p.goto(pathToFileURL(f).href, { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.fonts.ready);
  for (let i = 0; i < REEL_S * FPS; i++) {
    await p.evaluate(t => window.setTime(t), i / FPS);
    await p.screenshot({ path: join(frames, String(i).padStart(4, '0') + '.png') });
  }
  // Omslag: frågan i vila.
  await p.evaluate(() => window.setTime(2.5));
  await p.screenshot({ path: join(OUT, '4-reel-vilken-dag-omslag.jpg'), type: 'jpeg', quality: 92 });
  await browser.close();

  const enc = ['-framerate', String(FPS), '-i', join(frames, '%04d.png')];
  const v = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-maxrate', '12M', '-bufsize', '24M', '-movflags', '+faststart'];
  execFileSync(FFMPEG, ['-y', ...enc, ...v, join(OUT, '4-reel-vilken-dag-tyst.mp4')], { stdio: 'ignore' });
  if (process.env.MUSIC) {
    execFileSync(FFMPEG, ['-y', ...enc, '-i', process.env.MUSIC, ...v, '-af', `afade=t=out:st=${REEL_S - 1.5}:d=1.5`, '-c:a', 'aac', '-b:a', '192k', '-t', String(REEL_S), join(OUT, '4-reel-vilken-dag.mp4')], { stdio: 'ignore' });
  }
  console.log('reel klar');
}
main();
