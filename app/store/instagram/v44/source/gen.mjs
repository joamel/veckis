// Instagram-karusell vecka 44: veckomeny + fem vardagsrecept, ett per bild
// (1080×1350, 4:5). Mörkgrön bakgrund, lime grönsakssiluett per recept.
// Varje bild byggs som HTML och fotograferas med Chrome headless:
//   node app/store/instagram/v44/source/gen.mjs
// Recepten står i sin helhet på bilderna, så en skärmbild räcker för att
// importera dem i Handlis ("Fota eller välj bild").
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const DIR = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(DIR, '../../../../assets');
const OUT = join(DIR, '..');
// 4:5 (1080×1350): det högsta formatet Instagram tar emot för inlägg i flödet.
const H = 675;
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const font = f => pathToFileURL(join(ASSETS, 'fonts', f)).href;
const ICON = pathToFileURL(join(ASSETS, 'icon.png')).href;

const SKOG = '#1d3b2e';
const LIME = '#cde66b';

// Grönsakssiluetter (viewBox 0 0 200 200), fyllda med lime. Hål (kärnan i
// avokadon) ritas i bakgrundens skogsgröna.
const VEG = {
  broccoli: `<circle cx="68" cy="72" r="38"/><circle cx="114" cy="54" r="42"/><circle cx="148" cy="94" r="34"/><circle cx="98" cy="102" r="38"/><circle cx="52" cy="112" r="26"/>
    <path d="M82 122 C 86 140 84 165 78 186 Q 100 196 124 186 C 116 165 114 140 120 122 Z"/>`,
  pepper: `<path d="M52 72 C 34 96 36 150 62 176 C 78 192 94 182 100 172 C 106 182 122 192 138 176 C 164 150 166 96 148 72 C 128 56 116 66 100 63 C 84 66 72 56 52 72 Z"/>
    <path d="M100 66 C 100 46 108 32 124 26" fill="none" stroke="${LIME}" stroke-width="11" stroke-linecap="round"/>`,
  lemon: `<g transform="rotate(-28 100 112)"><ellipse cx="100" cy="112" rx="72" ry="54"/><circle cx="26" cy="112" r="10"/><circle cx="174" cy="112" r="10"/></g>
    <path d="M128 52 C 140 22 170 12 194 16 C 188 44 162 62 128 52 Z"/>`,
  chili: `<path d="M62 52 C 104 46 136 74 150 118 C 158 144 166 168 184 190 C 140 184 108 158 88 126 C 74 104 62 84 58 66 Z"/>
    <path d="M40 58 C 44 40 60 34 76 42 C 80 56 72 70 56 72 C 48 70 42 66 40 58 Z"/>
    <path d="M50 46 C 42 32 42 20 52 10" fill="none" stroke="${LIME}" stroke-width="10" stroke-linecap="round"/>`,
  avocado: `<path d="M100 18 C 126 18 136 54 146 84 C 166 136 146 186 100 186 C 54 186 34 136 54 84 C 64 54 74 18 100 18 Z"/>
    <circle cx="100" cy="132" r="30" fill="${SKOG}"/>`,
};
const veg = (name, style) => `<svg class="veg" style="${style}" viewBox="0 0 200 200" fill="${LIME}">${VEG[name]}</svg>`;

const CSS = `
@font-face { font-family: Outfit; font-weight: 700; src: url(${font('Outfit_700Bold.ttf')}); }
@font-face { font-family: Outfit; font-weight: 600; src: url(${font('Outfit_600SemiBold.ttf')}); }
* { box-sizing: border-box; }
html, body { margin: 0; width: 540px; height: ${H}px; overflow: hidden; font-family: Outfit, sans-serif; background: ${SKOG}; color: #fff; }
.wrap { position: absolute; inset: 0; padding: 0 44px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.kicker { font-weight: 700; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: ${LIME}; }
h1 { font-weight: 700; letter-spacing: -1px; margin: 10px 0 0; line-height: 1.04; font-size: 44px; }
.sub { font-weight: 600; font-size: 15px; line-height: 1.45; margin: 12px 0 0; max-width: 440px; color: #c9d8c0; }
.hint { font-weight: 600; font-size: 13px; color: ${LIME}; margin-top: 22px; }
.icon { width: 96px; height: 96px; border-radius: 22px; margin-bottom: 22px; }
.veg { position: absolute; }
.vegrow { display: flex; gap: 18px; margin-top: 30px; }
.vegrow svg { width: 46px; height: 46px; }
.cards { width: 100%; display: flex; flex-direction: column; gap: 10px; margin-top: 22px; text-align: left; }
.card { background: rgba(255,255,255,.07); border-radius: 16px; padding: 13px 16px; display: flex; gap: 14px; align-items: center; }
.card svg { flex: none; width: 34px; height: 34px; }
.card .num { flex: none; width: 32px; height: 32px; border-radius: 16px; background: ${LIME}; color: ${SKOG}; font-weight: 700; font-size: 15px; display: flex; align-items: center; justify-content: center; }
.card .day { flex: none; width: 40px; font-weight: 700; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; color: ${LIME}; }
.card b { display: block; font-size: 18px; line-height: 1.22; }
.card span { display: block; font-weight: 600; font-size: 13.5px; line-height: 1.4; color: #b5c8ad; margin-top: 2px; }
.btns { display: flex; gap: 10px; margin-top: 24px; }
.btn { background: ${LIME}; color: ${SKOG}; font-weight: 700; font-size: 14px; padding: 9px 16px; border-radius: 10px; }
.link { font-weight: 600; font-size: 13px; color: ${LIME}; margin-top: 16px; }
/* Receptbilden: allt ska gå att läsa i en skärmbild. */
.recipe { position: absolute; inset: 0; padding: 30px 32px 0; display: flex; flex-direction: column; }
.recipe header { position: relative; }
.recipe h1 { font-size: 34px; letter-spacing: -0.8px; max-width: 330px; }
.box { background: rgba(255,255,255,.07); border-radius: 16px; padding: 13px 18px; margin-top: 12px; position: relative; }
.box h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: ${LIME}; }
.ingr { display: grid; grid-template-columns: 1fr 1fr; column-gap: 16px; font-weight: 600; font-size: 15px; line-height: 1.5; color: #eef3e6; }
.steps { margin: 0; padding: 0; list-style: none; counter-reset: s; }
.steps li { counter-increment: s; position: relative; padding-left: 30px; font-weight: 600; font-size: 15px; line-height: 1.38; margin-top: 6px; color: #eef3e6; }
.steps li:first-child { margin-top: 0; }
.steps li::before { content: counter(s); position: absolute; left: 0; top: 1px; width: 21px; height: 21px; border-radius: 11px; background: ${LIME}; color: ${SKOG}; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.tight li::before { top: 0; width: 18px; height: 18px; border-radius: 9px; font-size: 10.5px; }
.foot { position: absolute; left: 32px; right: 32px; bottom: 26px; display: flex; justify-content: space-between; font-weight: 700; font-size: 13px; color: ${LIME}; }
`;

const page = inner => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${inner}</body></html>`;

// Samma recept som i BILDTEXTER.md — ändras de här, ändra där också.
export const RECIPES = [
  { day: 'Måndag', short: 'Mån', veg: 'broccoli', minutes: 25, title: 'Sticky sojakyckling', teaser: 'Blank, söt och salt – med ris och broccoli.', ingredients: [
    '600 g kycklinglårfilé', '1 msk olja', '3 msk japansk soja', '2 msk honung', '2 vitlöksklyftor', '1 msk riven ingefära', '3 dl jasminris', '250 g broccoli', '2 salladslökar', '1 msk sesamfrön',
  ], steps: [
    'Koka riset och broccolin.',
    'Skär kycklingen i bitar och stek den gyllene i oljan.',
    'Rör ihop soja, honung, pressad vitlök och ingefära.',
    'Häll såsen över kycklingen och låt koka ihop tills den blir blank och klibbig, ca 3 minuter.',
    'Servera med ris och broccoli. Strö över salladslök och sesamfrön.',
  ] },
  { day: 'Tisdag', short: 'Tis', veg: 'pepper', minutes: 35, title: 'Halloumi på plåt med sötpotatis', teaser: 'Allt på en plåt – tzatzikin gör du medan det rostas.', ingredients: [
    '800 g sötpotatis', '1 röd paprika', '1 rödlök', '2 msk olivolja', '1 tsk paprikapulver', 'salt och peppar', '400 g halloumi', '2 dl turkisk yoghurt', '½ gurka', '1 vitlöksklyfta',
  ], steps: [
    'Sätt ugnen på 225 °C.',
    'Skär sötpotatisen i klyftor och paprika och lök i bitar. Vänd med olja, paprikapulver, salt och peppar på en plåt och rosta i 20 minuter.',
    'Skiva halloumin, lägg den på plåten och rosta 10 minuter till.',
    'Riv gurkan, krama ur vätskan och rör ner i yoghurten med pressad vitlök och salt.',
    'Servera plåten med tzatzikin.',
  ] },
  { day: 'Onsdag', short: 'Ons', veg: 'lemon', minutes: 20, title: 'Laxpasta med citron och spenat', teaser: 'Krämig och frisk – veckans snabbaste.', ingredients: [
    '400 g pasta', '400 g laxfilé', '1 vitlöksklyfta', '1 msk smör', '2,5 dl matlagningsgrädde', '1 citron', '65 g babyspenat', 'salt och peppar', 'riven parmesan',
  ], steps: [
    'Koka pastan.',
    'Skär laxen i bitar och stek den i smöret med pressad vitlök.',
    'Häll på grädden, riv ner citronskalet och pressa i saften.',
    'Rör ner spenaten och låt den sjunka ihop.',
    'Vänd ner pastan, smaka av och toppa med parmesan.',
  ] },
  { day: 'Torsdag', short: 'Tor', veg: 'chili', minutes: 30, title: 'Chili sin carne', teaser: 'Vegetarisk, mättande och billig.', ingredients: [
    '1 gul lök', '2 vitlöksklyftor', '1 röd paprika', '1 msk olja', '1 msk chilipulver', '1 tsk spiskummin', '400 g krossade tomater', '2 burkar bönmix à 380 g', '1 tsk salt', '3 dl ris', 'gräddfil till servering',
  ], steps: [
    'Koka riset.',
    'Hacka lök och vitlök och tärna paprikan.',
    'Fräs grönsakerna i oljan med chilipulver och spiskummin.',
    'Häll i krossade tomater och sköljda bönor. Låt puttra i 15 minuter.',
    'Smaka av med salt och servera med ris och en klick gräddfil.',
  ] },
  { day: 'Fredag', short: 'Fre', veg: 'avocado', minutes: 25, title: 'Ugnsnachos', teaser: 'Fredagsmys direkt ur ugnsformen.', ingredients: [
    '400 g nötfärs', '1 påse tacokrydda', '1 dl vatten', '200 g tortillachips', '1 burk tacosås', '150 g riven ost', '2 tomater', '1 avokado', '2 dl gräddfil',
  ], steps: [
    'Sätt ugnen på 225 °C.',
    'Bryn färsen och rör ner tacokrydda och vatten. Låt koka ihop.',
    'Bred ut chipsen i en ugnsform och fördela färs, tacosås och ost.',
    'Gratinera i 8–10 minuter.',
    'Toppa med tärnad tomat, avokado och gräddfil.',
  ] },
];

const cover = () => page(`
  ${veg('chili', 'width:120px;height:120px;left:28px;top:56px;transform:rotate(-10deg)')}
  ${veg('lemon', 'width:110px;height:110px;right:30px;top:90px;transform:rotate(12deg)')}
  ${veg('broccoli', 'width:120px;height:120px;left:34px;bottom:56px;transform:rotate(-8deg)')}
  ${veg('avocado', 'width:110px;height:110px;right:36px;bottom:70px;transform:rotate(16deg)')}
  <div class="wrap" style="justify-content:center">
    <img class="icon" src="${ICON}">
    <div class="kicker">Veckomeny · v.44</div>
    <h1>Veckans middagar<br>är redan klara.</h1>
    <p class="sub">Sticky kyckling, halloumi på plåt, laxpasta, chili och ugnsnachos.</p>
    <div class="hint">Svep → och spara dem i Handlis</div>
  </div>`);

const weekMenu = () => page(`
  <div class="wrap" style="justify-content:center">
    <div class="kicker">Förslag · måndag–fredag</div>
    <h1>Veckomenyn</h1>
    <div class="cards">${RECIPES.map(r => `
      <div class="card"><div class="day">${r.short}</div>
        <div style="flex:1"><b>${r.title}</b><span>${r.teaser} ${r.minutes} min.</span></div>
        <svg viewBox="0 0 200 200" fill="${LIME}">${VEG[r.veg]}</svg></div>`).join('')}
    </div>
  </div>`);

const howTo = () => page(`
  <div class="wrap" style="justify-content:center">
    <div class="kicker">Spara recepten i Handlis</div>
    <h1>Så gör du</h1>
    <div class="cards">${[
      { t: 'Ta en skärmbild', d: 'I Handlis: Recept → + → Fota eller välj bild. Handlis läser ut ingredienser och instruktioner.' },
      { t: 'Eller tryck Dela → Handlis', d: 'Recepten står också i bildtexten och hämtas direkt till appen.' },
      { t: 'Lägg dem på veckomenyn', d: 'Ingredienserna hamnar på inköpslistan med ett tryck.' },
    ].map((it, i) => `
      <div class="card" style="align-items:flex-start;padding:16px 18px"><div class="num">${i + 1}</div>
        <div><b>${it.t}</b><span style="font-size:14.5px">${it.d}</span></div></div>`).join('')}
    </div>
  </div>`);

const recipe = r => page(`
  <div class="recipe">
    <header>${veg(r.veg, 'width:135px;height:135px;right:-46px;top:-36px;transform:rotate(14deg)')}
    <div class="kicker">${r.kicker ?? r.day} · ${r.minutes} min · 4 portioner</div>
    <h1>${r.title}</h1></header>
    <div class="box"><h3>Ingredienser</h3>
      <div class="ingr">${r.ingredients.map(i => `<div>${i}</div>`).join('')}</div></div>
    <div class="box"><h3>Instruktioner</h3>
      <ol class="steps">${r.steps.map(s => `<li>${s}</li>`).join('')}</ol></div>
  </div>
  <div class="foot"><span>${r.foot ?? 'Ta en skärmbild → spara i Handlis'}</span><span>@handlis.app</span></div>`);

const cta = () => page(`
  <div class="wrap" style="justify-content:center">
    <img class="icon" src="${ICON}">
    <h1>Gör vardagen enkel<br>– med Handlis 💚</h1>
    <p class="sub">Spara recepten, planera veckan och få inköpslistan sorterad efter din butik. Gratis att använda.</p>
    <div class="vegrow">${RECIPES.map(r => `<svg viewBox="0 0 200 200" fill="${LIME}">${VEG[r.veg]}</svg>`).join('')}</div>
    <div class="btns"><div class="btn">App Store</div><div class="btn">Google Play</div></div>
    <div class="link">Länk i bion · handlis.app</div>
  </div>`);

// Post 2: "Skriv vad du är sugen på" — steg för steg med en RIKTIG önskan och
// det Handlis faktiskt svarade (skärmbilder 2026-10-22). Ändra inte svaret för
// hand: byt prompt och svar tillsammans, efter ett nytt riktigt försök.
// Steg 2:s början syntes inte på skärmbilden ("… kastrull och fräs finmalen
// vitlök") — kontrollera "Hetta upp oljan i en" mot receptet i appen.
const PROMPT = 'Gör ett recept för 4 personer på 3 potatisar, 2 morötter, vitlök, basilika, krossade tomater, 1 dl grädde och ris';
const ANSWER = {
  title: 'Tomatgryta med potatis',
  description: 'En varm och välfylld gryta med potatis, morot och ris i en krämig tomatbas med frisk basilika och vitlök.',
  ingredients: [
    ['potatis', '3 st'], ['morot', '2 st'], ['vitlök', '2 klyftor'], ['basilika', '1 knippe'], ['krossade tomater', '1'],
    ['grädde', '1 dl'], ['ris', '2,5 dl'], ['olja', '2 msk'], ['salt', ''], ['peppar', ''],
  ],
  steps: [
    'Skala och skär potatisar och morötter i mindre bitar',
    'Hetta upp oljan i en kastrull och fräs finmalen vitlök',
    'Tillsätt de skurna rotsakerna och stek några minuter',
    'Häll i krossade tomater och låt sjuda 20 minuter tills rotsakerna är mjuka',
    'Rör i grädden och basilikan',
    'Koka riset enligt paketets anvisningar',
    'Smaka av grytan med salt och peppar',
    'Servera grytan tillsammans med riset',
  ],
};

const stepHead = (n, title, sub) => `
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:44px;height:44px;border-radius:22px;background:${LIME};color:${SKOG};font-weight:700;font-size:22px;display:flex;align-items:center;justify-content:center">${n}</div>
      <div class="kicker">Steg ${n} av 2</div>
    </div>
    <h1 style="text-align:left;margin-top:14px">${title}</h1>
    ${sub ? `<p class="sub" style="text-align:left;margin-top:10px">${sub}</p>` : ''}`;

const panel = inner => `<div style="background:rgba(255,255,255,.07);border-radius:20px;padding:20px;margin-top:24px">${inner}</div>`;

const step1 = () => page(`
  ${veg('lemon', 'width:150px;height:150px;right:-30px;bottom:30px;transform:rotate(-12deg)')}
  <div class="recipe" style="justify-content:center;padding:0 40px">
    ${stepHead(1, 'Öppna Recept<br>och tryck +', 'Välj "Klistra in länk eller recept".')}
    ${panel(['Recept-fliken', '+ (nere till höger)', 'Klistra in länk eller recept'].map((t, i) => `
      ${i ? `<div style="color:${LIME};font-weight:700;font-size:22px;line-height:1;margin:8px 0 8px 18px">↓</div>` : ''}
      <div style="display:inline-flex;align-items:center;height:46px;padding:0 16px;border-radius:12px;background:${i === 2 ? LIME : 'rgba(255,255,255,.12)'};color:${i === 2 ? SKOG : '#fff'};font-weight:700;font-size:17px">${t}</div>`).join(''))}
  </div>`);

const step2 = () => page(`
  <div class="recipe" style="justify-content:center;padding:0 40px">
    ${stepHead(1, 'Skriv vad du<br>har hemma', 'Välj <b style="color:#fff">Klistra in länk eller recept</b> under Recept-fliken – och skriv med egna ord.')}
    <div style="background:#f4f7ec;color:${SKOG};border-radius:18px;padding:20px;margin-top:24px;font-weight:600;font-size:21px;line-height:1.38">”${PROMPT}”</div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px"><div class="btn" style="font-size:15px;padding:11px 18px">Tolka och skapa recept</div></div>
  </div>`);

// Svaret på en bild: ingredienser och instruktioner under varandra.
const step3 = () => page(`
  ${veg('pepper', 'width:110px;height:110px;right:-14px;top:22px;transform:rotate(14deg)')}
  <div class="recipe" style="justify-content:center;padding:0 30px 30px">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:38px;height:38px;border-radius:19px;background:${LIME};color:${SKOG};font-weight:700;font-size:19px;display:flex;align-items:center;justify-content:center">2</div>
      <div class="kicker">Steg 2 av 2</div>
    </div>
    <h1 style="margin-top:10px;font-size:30px;max-width:none">Klart – på några sekunder</h1>
    <div style="background:rgba(255,255,255,.07);border-radius:18px;padding:16px 18px;margin-top:16px">
      <div style="font-weight:700;font-size:21px;line-height:1.15">${ANSWER.title}</div>
      <div style="font-weight:600;font-size:12.5px;line-height:1.4;color:#b5c8ad;margin-top:4px">${ANSWER.description}</div>
      <h3 style="margin:12px 0 4px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${LIME}">Ingredienser · 4 portioner</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:20px">${ANSWER.ingredients.map(([n, q]) => `
        <div style="display:flex;justify-content:space-between;gap:8px;font-weight:600;font-size:13.5px;line-height:1.6;border-bottom:1px solid rgba(255,255,255,.08)"><span>${n}</span><span style="color:${LIME}">${q}</span></div>`).join('')}
      </div>
      <h3 style="margin:14px 0 6px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${LIME}">Instruktioner</h3>
      <ol class="steps tight">${ANSWER.steps.map(s => `<li style="font-size:13.5px;line-height:1.35;margin-top:5px;padding-left:26px">${s}</li>`).join('')}</ol>
    </div>
  </div>
  <div class="foot"><span>Ändra vad du vill innan du sparar</span><span>@handlis.app</span></div>`);

const tipCover = () => page(`
  ${veg('lemon', 'width:110px;height:110px;left:30px;top:60px;transform:rotate(-14deg)')}
  ${veg('broccoli', 'width:120px;height:120px;right:30px;top:80px;transform:rotate(10deg)')}
  ${veg('chili', 'width:110px;height:110px;left:40px;bottom:70px;transform:rotate(8deg)')}
  ${veg('pepper', 'width:110px;height:110px;right:40px;bottom:60px;transform:rotate(-10deg)')}
  <div class="wrap" style="justify-content:center">
    <div class="kicker">Tips · lätt att missa</div>
    <h1>Hinner inte<br>handla?</h1>
    <p class="sub">Skriv vad du har hemma – Handlis skriver ett recept med mängder och instruktioner.</p>
    <div class="hint">Så gör du – svep →</div>
  </div>`);

const tipIdeas = () => page(`
  <div class="wrap" style="justify-content:center">
    <div class="kicker">Prova att skriva</div>
    <h1>Fler idéer</h1>
    <div class="cards">${[
      ['avocado', 'Frasiga våfflor'],
      ['chili', 'Något snabbt med kyckling och kokosmjölk'],
      ['broccoli', 'Barnvänlig vegetarisk middag för fyra'],
      ['pepper', 'Jag har ägg, potatis, purjolök och ost'],
      ['lemon', 'Glutenfri kladdkaka som blir kladdig på riktigt'],
    ].map(([v, t]) => `
      <div class="card"><svg viewBox="0 0 200 200" fill="${LIME}">${VEG[v]}</svg><div><b>”${t}”</b></div></div>`).join('')}
    </div>
  </div>`);

const tipCta = () => page(`
  <div class="wrap" style="justify-content:center">
    <img class="icon" src="${ICON}">
    <h1>Gör vardagen enkel<br>– med Handlis 💚</h1>
    <p class="sub">Spara receptet, lägg det på veckomenyn och få ingredienserna på inköpslistan. Gratis att använda.</p>
    <div class="btns"><div class="btn">App Store</div><div class="btn">Google Play</div></div>
    <div class="link">Länk i bion · handlis.app</div>
  </div>`);

const POSTS = {
  '1-veckans-recept': [cover(), weekMenu(), howTo(), ...RECIPES.map(recipe), cta()],
  '2-skriv-vad-du-ar-sugen-pa': [tipCover(), step2(), step3(), tipIdeas(), tipCta()],
};

const tmp = mkdtempSync(join(tmpdir(), 'handlis-ig-'));
for (const [base, slides] of Object.entries(POSTS)) {
  const name = base;
  rmSync(join(OUT, name), { recursive: true, force: true });
  mkdirSync(join(OUT, name), { recursive: true });
  slides.forEach((html, i) => {
    const file = join(tmp, `${name}-${i + 1}.html`);
    writeFileSync(file, html);
    const out = join(OUT, name, `${i + 1}.png`);
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
      `--window-size=540,${H}`, '--virtual-time-budget=2000', `--screenshot=${out}`, pathToFileURL(file).href], { stdio: 'ignore' });
    console.log(`${name}/${i + 1}.png`);
  });
}
