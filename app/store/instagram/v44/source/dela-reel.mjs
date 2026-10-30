// Reel "Dela till Handlis": skärminspelningen (5-dela-till-handlis-ra.mp4) i en
// telefonram, med animerade tryck (inspelningen visar inga), stegtexter, krok
// och slutbild. 1080×1920.
//   TOOLS=<mapp med puppeteer-core + ffmpeg-static> MUSIC=<music.wav> \
//     node app/store/instagram/v44/source/dela-reel.mjs
import { mkdirSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { C, ICON, OUT, FFMPEG, veg, stamp, brand, page, browser } from './stil.mjs';

const CLIP = join(OUT, '5-dela-till-handlis-ra.mp4');
const FPS = 30;
// WEB=1: versionen till landningssidan — ingen krok eller slutbild, lime
// bakgrund som sektionen, mörkgröna texter och en större telefon.
const WEB = process.env.WEB === '1';
const SW = WEB ? 384 : 330;                     // skärmens bredd i mallen (CSS-px, ×2 i filen)
const SH = Math.round(SW * 2224 / 1080);
const S = SW / 1080;                // klippets px → skärmens CSS-px

// Klippets tidslinje, uppmätt ur inspelningen (sekunder i klippet, px i 1080×2224).
// Råklippet: statusraden bortskuren, kontaktraderna i delningsarken bortklippta
// (arken blir kortare; inlägget bakom fylls i från bildrutan före, nedtonat) och
// arkens glidanimationer bortklippta (där rör sig kontakterna).
const TAPS = [
  [3.85, 498, 1805], [5.05, 540, 1565], [7.0, 398, 1900], [8.15, 540, 1769],
  [14.55, 540, 2035], [18.1, 540, 1845], [20.75, 405, 2100], [26.75, 432, 1382], [30.6, 243, 1841],
];
const SWIPE = { t0: 1.35, t1: 1.75, y: 785, x0: 860, x1: 260 };
const STEPS = [
  [0, 'Tryck på dela'], [4.0, 'Välj Handlis'], [7.15, 'Hämta recept'],
  [10.2, 'Alla fem recepten hittade'], [14.6, 'Spara som veckomall'],
  [18.2, 'Hela veckan – på rätt dagar'], [26.7, 'Sen är det bara att laga!'],
];
// Reelens tid → klippets tid: tittandet i början 1,5× och bläddrandet i menyn 2×.
const SEGS = [[0, 3.6, 1.5], [3.6, 18.6, 1], [18.6, 26.6, 2], [26.6, 33.45, 1]];
const HOOK = WEB ? 0 : 2.6, END = WEB ? 0 : 3.2;
const segLen = SEGS.map(([a, b, v]) => (b - a) / v);
const MID = segLen.reduce((x, y) => x + y, 0);
const TOTAL = HOOK + MID + END;
function clipTime(r) {
  let u = r;
  for (let i = 0; i < SEGS.length; i++) {
    if (u <= segLen[i] || i === SEGS.length - 1) return Math.min(SEGS[i][1], SEGS[i][0] + u * SEGS[i][2]);
    u -= segLen[i];
  }
}

const HTML = page(WEB ? C.lime : C.skog, `
  <style>
    #phone { position:absolute; left:${(540 - SW) / 2 - 9}px; top:${WEB ? 112 : 128}px; width:${SW + 18}px; height:${SH + 18}px; padding:9px; border-radius:46px; background:#0d1f16; box-shadow:0 24px 60px rgba(0,0,0,.45); }
    #phone .scr { position:relative; width:${SW}px; height:${SH}px; border-radius:38px; overflow:hidden; background:#000; }
    #scr { width:100%; height:100%; display:block; }
    .dot { position:absolute; width:34px; height:34px; margin:-17px 0 0 -17px; border-radius:17px; background:rgba(255,255,255,.85); box-shadow:0 0 0 3px rgba(29,59,46,.55); opacity:0; }
    .ring { position:absolute; width:34px; height:34px; margin:-17px 0 0 -17px; border-radius:50%; border:4px solid ${C.lime}; opacity:0; }
    #cap { position:absolute; left:16px; right:16px; top:${WEB ? 34 : 44}px; text-align:center; }
    #cap .hand { color:${WEB ? C.skog : C.lime}; font-size:50px; white-space:nowrap; }
    #num { display:inline-block; width:38px; height:38px; border-radius:19px; background:${C.lime}; color:${C.skog}; font-weight:700; font-size:20px; line-height:38px; margin-bottom:6px; }
    .full { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:0 40px; }
  </style>
  <div id="cap"><div class="hand" id="txt"></div></div>
  <div id="phone"><div class="scr"><img id="scr"><div class="dot" id="dot"></div><div class="ring" id="ring"></div></div></div>
  <div class="full" id="hook" style="background:${C.rosa ?? '#f6c9d4'}">
    ${veg('broccoli', C.skog, 'width:130px;left:-20px;top:120px;transform:rotate(-10deg)', '#f6c9d4')}
    ${veg('lemon', C.skog, 'width:120px;right:-16px;bottom:180px;transform:rotate(14deg)', '#f6c9d4')}
    <div class="hand" style="color:${C.skog};font-size:84px">Hittat en<br>veckomeny på<br>Instagram?</div>
    <div class="sub" style="color:${C.skog};font-size:20px">Så hamnar den i Handlis – på rätt dagar</div>
    ${stamp('right:40px;bottom:70px', C.skog, C.lime)}
  </div>
  <div class="full" id="end" style="background:${C.skog}">
    <img src="${ICON}" style="width:110px;border-radius:26px;margin-bottom:22px">
    ${brand('#fff', 64)}
    <div class="hand" style="color:${C.lime};font-size:46px;margin-top:16px">Dela → Handlis → klart.</div>
    <div class="sub" style="color:#c9d8c0">Länk i bion</div>
  </div>
  <script>
    const $ = id => document.getElementById(id);
    const clamp = x => Math.max(0, Math.min(1, x));
    const TAPS = ${JSON.stringify(TAPS)}, SWIPE = ${JSON.stringify(SWIPE)}, STEPS = ${JSON.stringify(STEPS)}, S = ${S};
    window.setFrame = async (reelT, clipT, frameUrl) => {
      const hook = reelT < ${HOOK}, end = reelT > ${HOOK + MID};
      $('hook').style.opacity = hook ? 1 : 0;
      $('end').style.opacity = end ? clamp((reelT - ${HOOK + MID}) / 0.3) : 0;
      if (frameUrl && $('scr').getAttribute('src') !== frameUrl) { $('scr').src = frameUrl; await $('scr').decode(); }
      // Stegtext
      let i = 0; for (let k = 0; k < STEPS.length; k++) if (clipT >= STEPS[k][0]) i = k;
      $('txt').textContent = STEPS[i][1];
      // Finger: syns 0,35 s före trycket, trycker, ringen sprider sig 0,5 s efter.
      const dot = $('dot'), ring = $('ring');
      dot.style.opacity = 0; ring.style.opacity = 0;
      for (const [t, x, y] of TAPS) {
        const d = clipT - t;
        if (d > -0.35 && d < 0.25) {
          dot.style.left = x * S + 'px'; dot.style.top = y * S + 'px';
          dot.style.opacity = d < 0 ? clamp((d + 0.35) / 0.15) : 1 - clamp(d / 0.25);
          dot.style.transform = 'scale(' + (d < 0 ? 1 : 0.8) + ')';
        }
        if (d >= 0 && d < 0.55) {
          ring.style.left = x * S + 'px'; ring.style.top = y * S + 'px';
          ring.style.opacity = 1 - d / 0.55; ring.style.transform = 'scale(' + (1 + d * 5) + ')';
        }
      }
      // Svep i karusellen
      const u = (clipT - SWIPE.t0) / (SWIPE.t1 - SWIPE.t0);
      if (u > -0.6 && u < 1.2) {
        dot.style.left = (SWIPE.x0 + (SWIPE.x1 - SWIPE.x0) * clamp(u)) * S + 'px'; dot.style.top = SWIPE.y * S + 'px';
        dot.style.opacity = u < 0 ? clamp((u + 0.6) / 0.3) : 1 - clamp((u - 1) / 0.2); dot.style.transform = 'scale(1)';
      }
    };
  </script>`, 960);

const tmp = mkdtempSync(join(tmpdir(), 'handlis-dela-'));
const src = join(tmp, 'src'); mkdirSync(src);
const ff = FFMPEG();
// Klippets bildrutor i skärmens storlek (×2).
execFileSync(ff, ['-loglevel', 'error', '-i', CLIP, '-vf', `fps=${FPS},scale=${SW * 2}:-2`, '-q:v', '2', join(src, '%05d.jpg')]);
const nSrc = readdirSync(src).length;
const frames = join(tmp, 'out'); mkdirSync(frames);
const htmlFile = join(tmp, 'reel.html'); writeFileSync(htmlFile, HTML);

const b = await browser();
const p = await b.newPage();
await p.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
await p.goto(pathToFileURL(htmlFile).href, { waitUntil: 'networkidle0' });
await p.evaluate(() => document.fonts.ready);
const N = Math.round(TOTAL * FPS);
for (let f = 0; f < N; f++) {
  const r = f / FPS;
  const ct = clipTime(Math.max(0, Math.min(MID, r - HOOK)));
  const idx = Math.min(nSrc, Math.max(1, Math.round(ct * FPS) + 1));
  await p.evaluate((a, c, u) => window.setFrame(a, c, u), r, ct, pathToFileURL(join(src, String(idx).padStart(5, '0') + '.jpg')).href);
  await p.screenshot({ path: join(frames, String(f).padStart(5, '0') + '.png') });
  if (!WEB && f === Math.round((HOOK + 0.5) * FPS)) await p.screenshot({ path: join(OUT, '5-reel-dela-till-handlis-omslag.jpg'), type: 'jpeg', quality: 92 });
}
await b.close();

const enc = ['-framerate', String(FPS), '-i', join(frames, '%05d.png')];
if (WEB) {
  // Liten och ljudlös för webben; affisch = första bildrutan.
  const PUB = join(OUT, '../../../public');
  execFileSync(ff, ['-y', '-loglevel', 'error', ...enc, '-vf', 'scale=540:960:out_color_matrix=bt709:out_range=tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', '-an', join(PUB, 'reel-dela-till-handlis.mp4')]);
  execFileSync(ff, ['-y', '-loglevel', 'error', '-i', join(frames, '00000.png'), '-vf', 'scale=540:-2', '-q:v', '4', join(PUB, 'reel-dela-till-handlis.jpg')]);
  console.log(`webb klar: ${TOTAL.toFixed(1)} s`);
  process.exit(0);
}
const v = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-maxrate', '12M', '-bufsize', '24M', '-movflags', '+faststart'];
execFileSync(ff, ['-y', '-loglevel', 'error', ...enc, ...v, join(OUT, '5-reel-dela-till-handlis-tyst.mp4')]);
if (process.env.MUSIC) {
  execFileSync(ff, ['-y', '-loglevel', 'error', ...enc, '-stream_loop', '1', '-i', process.env.MUSIC, ...v, '-af', `afade=t=out:st=${(TOTAL - 1.8).toFixed(2)}:d=1.8`, '-c:a', 'aac', '-b:a', '192k', '-t', TOTAL.toFixed(2), join(OUT, '5-reel-dela-till-handlis.mp4')]);
}
console.log(`klar: ${TOTAL.toFixed(1)} s, ${N} bildrutor`);
