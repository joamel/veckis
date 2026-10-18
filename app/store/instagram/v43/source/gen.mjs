// Instagram-karuseller för vecka 43 (1080×1440, 3:4). Varje bild byggs som
// HTML i samma stil som första inlägget och fotograferas i en headless-
// webbläsare: node browser.mjs about:blank --script ./gen.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, 'out');

const CSS = `
@font-face { font-family: Outfit; font-weight: 700; src: url(Outfit_700Bold.ttf); }
@font-face { font-family: Outfit; font-weight: 600; src: url(Outfit_600SemiBold.ttf); }
* { box-sizing: border-box; }
html, body { margin: 0; width: 540px; height: 720px; overflow: hidden; font-family: Outfit, sans-serif; }
body.dark { background: #1d3b2e; color: #fff; }
body.light { background: #cfddb4; color: #1d3b2e; }
.wrap { position: absolute; inset: 0; padding: 0 44px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.kicker { font-weight: 700; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
.dark .kicker { color: #cde66b; }
.light .kicker { color: #2f5a44; }
h1 { font-weight: 700; letter-spacing: -1px; margin: 10px 0 0; line-height: 1.04; }
.light h1 { font-size: 40px; }
.dark h1 { font-size: 44px; }
.sub { font-weight: 600; font-size: 15px; line-height: 1.45; margin: 12px 0 0; max-width: 430px; }
.dark .sub { color: #c9d8c0; }
.light .sub { color: #2f5a44; }
.hint { font-weight: 600; font-size: 13px; color: #cde66b; margin-top: 26px; }
.icon { width: 120px; height: 120px; border-radius: 28px; margin-bottom: 26px; }
.phone { position: absolute; left: 50%; transform: translateX(-50%); width: 260px; padding: 7px; border-radius: 40px; background: #0d1f16; box-shadow: 0 24px 50px rgba(0,0,0,.28); }
.phone img { display: block; width: 100%; border-radius: 33px; }
.cards { width: 100%; display: flex; flex-direction: column; gap: 12px; margin-top: 26px; text-align: left; }
.card { background: #f4f7ec; border-radius: 18px; padding: 17px 18px; display: flex; gap: 14px; align-items: flex-start; }
.num { flex: none; width: 34px; height: 34px; border-radius: 17px; background: #1d3b2e; color: #cde66b; font-weight: 700; font-size: 15px; display: flex; align-items: center; justify-content: center; }
.card b { display: block; font-size: 19px; line-height: 1.25; }
.card span { display: block; font-weight: 600; font-size: 15px; line-height: 1.4; color: #4a6a58; margin-top: 3px; }
.day { flex: none; width: 50px; font-weight: 700; font-size: 15px; color: #2f5a44; text-transform: uppercase; letter-spacing: 1px; padding-top: 2px; }
.cols { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px; text-align: left; }
.grp { background: #f4f7ec; border-radius: 14px; padding: 11px 13px; }
.grp h3 { margin: 0 0 5px; font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #2f5a44; }
.grp div { display: flex; justify-content: space-between; font-weight: 600; font-size: 12px; line-height: 1.55; }
.grp div i { font-style: normal; color: #6b8a77; }
.btns { display: flex; gap: 10px; margin-top: 24px; }
.btn { background: #cde66b; color: #1d3b2e; font-weight: 700; font-size: 14px; padding: 9px 16px; border-radius: 10px; }
.link { font-weight: 600; font-size: 13px; color: #cde66b; margin-top: 16px; }
`;

const page = (cls, inner) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body class="${cls}">${inner}</body></html>`;

// Mallar
const cover = ({ kicker, title, sub, hint }) => page('dark', `
  <div class="wrap" style="justify-content:center">
    <img class="icon" src="icon.png">
    <div class="kicker">${kicker}</div>
    <h1>${title}</h1>
    ${sub ? `<p class="sub">${sub}</p>` : ''}
    ${hint ? `<div class="hint">${hint}</div>` : ''}
  </div>`);

const phone = ({ kicker, title, sub, img }) => page('light', `
  <div class="wrap" style="padding-top:40px">
    <div class="kicker">${kicker}</div>
    <h1>${title}</h1>
    ${sub ? `<p class="sub">${sub}</p>` : ''}
  </div>
  <div class="phone" style="top:${sub ? 250 : 200}px"><img src="${img}"></div>`);

const cards = ({ kicker, title, items, start = 1, top = 46 }) => page('light', `
  <div class="wrap" style="justify-content:center;padding-bottom:${top - 40}px">
    <div class="kicker">${kicker}</div>
    <h1>${title}</h1>
    <div class="cards">${items.map((it, i) => `
      <div class="card">${it.day ? `<div class="day">${it.day}</div>` : `<div class="num">${start + i}</div>`}
        <div><b>${it.t}</b>${it.d ? `<span>${it.d}</span>` : ''}</div></div>`).join('')}
    </div>
  </div>`);

const list = ({ kicker, title, sub, groups }) => page('light', `
  <div class="wrap" style="padding-top:34px">
    <div class="kicker">${kicker}</div>
    <h1 style="font-size:34px">${title}</h1>
    ${sub ? `<p class="sub" style="font-size:13px;margin-top:8px">${sub}</p>` : ''}
    <div class="cols">${groups.map(col => `<div style="display:flex;flex-direction:column;gap:10px">${col.map(g => `
      <div class="grp"><h3>${g.h}</h3>${g.rows.map(([n, q]) => `<div>${n}<i>${q}</i></div>`).join('')}</div>`).join('')}</div>`).join('')}
    </div>
  </div>`);

const cta = ({ title, sub }) => page('dark', `
  <div class="wrap" style="justify-content:center">
    <img class="icon" src="icon.png" style="width:96px;height:96px;border-radius:22px">
    <h1>${title}</h1>
    <p class="sub">${sub}</p>
    <div class="btns"><div class="btn">App Store</div><div class="btn">Google Play</div></div>
    <div class="link">Länk i bion · handlis.app</div>
  </div>`);

const POSTS = {
  '1-veckans-meny': [
    cover({ kicker: 'Veckans meny · v.43', title: 'Fem vardags&shy;middagar.<br>En inköpslista.', sub: 'Enkla rätter för fyra – och hela listan färdig att handla efter.', hint: 'Spara till söndagens planering →' }),
    cards({ kicker: 'Måndag–fredag', title: 'Veckans middagar', items: [
      { day: 'Mån', t: 'Krämig pasta med kyckling och spenat', d: 'Klar på 25 minuter.' },
      { day: 'Tis', t: 'Tacos', d: 'Nötfärs, grönsaker och gräddfil – barnen fixar resten.' },
      { day: 'Ons', t: 'Ugnslax med potatis och dillsås', d: 'Allt i ugnen samtidigt.' },
      { day: 'Tor', t: 'Röd linssoppa', d: 'Billig, mättande och vegetarisk.' },
      { day: 'Fre', t: 'Hemmagjord pizza', d: 'Skinka och champinjoner – eller valfritt.' },
    ] }),
    list({ kicker: 'Hela veckan, en lista', title: 'Inköpslistan', sub: 'Lök, vitlök och krossade tomater från flera recept – slagna ihop.', groups: [
      [
        { h: 'Frukt & grönt', rows: [['Potatis', '1 kg'], ['Gul lök', '2 st'], ['Vitlök', '1 st'], ['Morötter', '2 st'], ['Babyspenat', '65 g'], ['Isbergssallad', '1 st'], ['Tomater', '2 st'], ['Gurka', '1 st'], ['Champinjoner', '250 g'], ['Dill', '1 knippe'], ['Citron', '1 st']] },
        { h: 'Kött & fisk', rows: [['Kycklingfilé', '400 g'], ['Nötfärs', '500 g'], ['Laxfilé', '4 st'], ['Skinka', '150 g']] },
      ],
      [
        { h: 'Mejeri', rows: [['Matlagningsgrädde', '3 dl'], ['Crème fraiche', '2 dl'], ['Gräddfil', '2 dl'], ['Riven ost', '150 g'], ['Mozzarella', '2 st'], ['Parmesan', '1 bit']] },
        { h: 'Skafferi', rows: [['Pasta', '500 g'], ['Röda linser', '3 dl'], ['Krossade tomater', '2 förp'], ['Tortillabröd', '8 st'], ['Tacokrydda', '1 påse'], ['Majs', '1 burk'], ['Grönsaksbuljong', '1 tärning'], ['Vetemjöl', '6 dl'], ['Jäst', '½ pkt']] },
        { h: 'Bröd', rows: [['Bröd till soppan', '1 st']] },
      ],
    ] }),
    phone({ kicker: 'Tips', title: 'Kolla skafferiet<br>innan du handlar.', sub: 'I Handlis bockar du bort det som redan finns hemma – resten hamnar på listan, i butikens ordning.', img: '05.jpg' }),
    cta({ title: 'Lägg veckan<br>i Handlis.', sub: 'Spara recepten, planera veckan och få inköpslistan sorterad efter din butik. Gratis att använda.' }),
  ],
  '2-slippa-aka-tillbaka': [
    cover({ kicker: 'Storhandla smartare', title: '7 sätt att slippa<br>åka tillbaka<br>till affären', hint: 'Svep →' }),
    cards({ kicker: 'Före butiken', title: 'Planera först', items: [
      { t: 'Bestäm middagarna innan du skriver listan', d: 'Då vet du vad du faktiskt behöver.' },
      { t: 'Kolla kyl, frys och skafferi', d: 'Har du bråttom – fota hyllorna och titta i butiken.' },
      { t: 'Skriv listan i butikens ordning', d: 'Inte i den ordning du kommer på saker.' },
      { t: 'Ha en fast lista för veckans basvaror', d: 'Mjölk, bröd, frukt – samma varje vecka.' },
    ] }),
    cards({ kicker: 'Tillsammans', title: 'Handla som ett lag', start: 5, items: [
      { t: 'Dela listan med de du bor med', d: 'Då hinner de lägga till "vi är slut på…".' },
      { t: 'Säg till när du är i butiken', d: 'Så kan någon skicka med det sista.' },
      { t: 'Handla mätt', d: 'Klassikern. Den fungerar.' },
    ] }),
    phone({ kicker: 'Handlis gör det mesta åt dig', title: 'Tips 1, 3, 4, 5 och 6<br>är inbyggda.', sub: 'Veckomeny, lista i butiksordning, snabblista för basvarorna, delning i realtid och "Jag handlar".', img: '05.jpg' }),
    cta({ title: 'Prova på<br>nästa storhandling.', sub: 'Ladda ned Handlis och handla tillsammans med hushållet. Gratis att använda.' }),
  ],
  '3-fota-kokboken': [
    cover({ kicker: 'Fota recept', title: 'Mormors receptbok<br>i mobilen.', sub: 'Fota sidan – Handlis gör resten.', hint: 'Svep för att se hur →' }),
    cards({ kicker: 'Så funkar det', title: 'Tre steg', top: 60, items: [
      { t: 'Fota kokbokssidan', d: 'Eller ett handskrivet recept. Flera sidor går bra.' },
      { t: 'Handlis läser receptet', d: 'Titel, portioner, ingredienser och steg plockas ut åt dig – flera recept på samma uppslag blir flera recept.' },
      { t: 'Klart att laga eller planera', d: 'Lägg det på veckomenyn, och ingredienserna på listan med ett tryck.' },
    ] }),
    phone({ kicker: 'Alla recept på ett ställe', title: 'Sökbart och taggat.', sub: 'Länkar, inklistrade texter och fotade sidor – samlat i en receptbok som hela hushållet delar.', img: '03.jpg' }),
    cta({ title: 'Rädda era<br>favoritrecept.', sub: 'Fota, klistra in eller hämta från en länk. Gratis att använda.' }),
  ],
  '4-planera-pa-10-minuter': [
    cover({ kicker: 'Söndagsrutinen', title: 'Planera veckan<br>på 10 minuter.', sub: 'Mindre "vad ska vi äta?" – färre turer till affären.', hint: 'Svep →' }),
    cards({ kicker: 'Steg för steg', title: 'Så gör du', top: 60, items: [
      { t: 'Välj 4–5 middagar', d: 'Blanda: en fisk, en vegetarisk, en snabb, en favorit.' },
      { t: 'Lägg dem på dagarna', d: 'Snabbrätten på träningskvällen, ugnsrätten när ni har tid.' },
      { t: 'Gör inköpslistan', d: 'Gå igenom recepten och bocka bort det som finns hemma.' },
      { t: 'Handla en gång', d: 'Resten av veckan är det bara att laga.' },
    ] }),
    phone({ kicker: 'Steg 1 och 2', title: 'Veckomenyn.', sub: 'Lägg recepten på dagarna och flytta runt när planerna ändras.', img: '07.jpg' }),
    phone({ kicker: 'Steg 3 och 4', title: 'Listan gör sig själv.', sub: 'Ingredienserna förs över med ett tryck och sorteras i den ordning du går i butiken.', img: '05.jpg' }),
    cta({ title: 'Prova i kväll.', sub: 'Ladda ned Handlis och planera veckan tillsammans med hushållet. Gratis att använda.' }),
  ],
};

export default async function run(pg) {
  const ctx = await pg.context().browser().newContext({ viewport: { width: 540, height: 720 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const done = [];
  for (const [name, slides] of Object.entries(POSTS)) {
    mkdirSync(join(OUT, name), { recursive: true });
    for (let i = 0; i < slides.length; i++) {
      const file = join(DIR, `_slide.html`);
      writeFileSync(file, slides[i]);
      await p.goto(pathToFileURL(file).href);
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(150);
      const out = join(OUT, name, `${i + 1}.png`);
      await p.screenshot({ path: out });
      done.push(`${name}/${i + 1}.png`);
    }
  }
  return done;
}
