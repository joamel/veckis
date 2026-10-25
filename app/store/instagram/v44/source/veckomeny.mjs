// "Veckans middagar är redan klara" i den nya stilen (karusell 4:5, 9 bilder).
//   TOOLS=<mapp med puppeteer-core> node app/store/instagram/v44/source/veckomeny.mjs
// Receptbilderna ska gå att läsa i en skärmbild ("Fota eller välj bild").
import { C, ICON, veg, vegIcon, stamp, brand, page, browser, renderCarousel } from './stil.mjs';
import { RECIPES } from './recipes.mjs';

// En bakgrund per vardag, så flödet får färg. Silhuetten i en kontrastfärg.
const DAY_BG = [C.mint, C.persika, C.lime, C.mint, C.himmel];
const DAY_VEG = [C.skog, C.korall, C.skog, C.skog, '#7aa6b8'];

const cover = () => page(C.lime, `
  ${veg('chili', C.skog, 'width:110px;left:30px;top:44px;transform:rotate(-10deg)')}
  ${veg('lemon', C.skog, 'width:100px;right:34px;top:70px;transform:rotate(12deg)')}
  ${veg('broccoli', C.skog, 'width:110px;left:36px;bottom:40px;transform:rotate(-8deg)')}
  ${veg('avocado', C.skog, 'width:96px;right:40px;bottom:56px;transform:rotate(16deg)', C.lime)}
  <div class="wrap" style="align-items:center;text-align:center">
    <div class="kick" style="color:${C.skog}">Veckomeny · v.44</div>
    <div class="hand" style="color:${C.skog};font-size:84px;margin-top:8px">Veckans<br>middagar är<br>redan klara!</div>
    <div class="sub" style="color:${C.grön};max-width:380px">Fem enkla vardagsrätter – svep →</div>
  </div>
  ${stamp('left:50%;bottom:118px;transform:translateX(-50%) rotate(-4deg)', C.skog, C.lime)}`);

const weekMenu = () => page(C.lime, `
  <div class="wrap" style="padding:0 36px">
    <div class="kick" style="color:${C.grön}">Förslag · måndag–fredag</div>
    <div class="hand" style="color:${C.skog};font-size:64px;margin:4px 0 8px">Veckomenyn</div>
    ${RECIPES.map((r, i) => `
      <div class="row" style="background:#fff;color:${C.skog};padding:11px 14px;margin-top:8px;gap:12px">
        <span style="flex:none;width:46px;text-align:center;background:${DAY_BG[i]};border-radius:9px;padding:6px 0;font-weight:700;font-size:13px;letter-spacing:1px">${r.short.toUpperCase()}</span>
        <span style="flex:1"><span style="display:block;font-weight:700;font-size:16.5px">${r.title}</span><span style="display:block;font-size:13px;color:#5f7a6a">${r.teaser} ${r.minutes} min.</span></span>
        <span style="flex:none;width:48px;height:48px;border-radius:12px;background:${C.skog};display:flex;align-items:center;justify-content:center">${vegIcon(r.veg, C.lime, 32, C.skog)}</span>
      </div>`).join('')}
  </div>`);

const howTo = () => page(C.mint, `
  ${veg('pepper', C.skog, 'width:100px;right:-16px;top:40px;transform:rotate(14deg)')}
  <div class="wrap">
    <div class="kick" style="color:${C.grön}">Spara recepten</div>
    <div class="hand" style="color:${C.skog};font-size:66px;margin:6px 0 10px">Så gör du</div>
    ${[['📸', 'Ta en skärmbild', 'I Handlis: Recept → Fota eller välj bild. Handlis läser ut ingredienser och instruktioner.'],
       ['🗓️', 'Lägg dem på veckomenyn', 'Dra dem till rätt dag – flytta när planerna ändras.'],
       ['🛒', 'Ett tryck – klar inköpslista', 'Sorterad efter din butik, med det du har hemma avprickat.']].map(([e, t, d]) => `
      <div class="row" style="background:#fff;color:${C.skog};align-items:flex-start"><span style="font-size:24px;line-height:1">${e}</span><span>${t}<span style="display:block;font-size:14px;color:#5f7a6a;margin-top:3px">${d}</span></span></div>`).join('')}
  </div>`);

const recipe = (r, i) => page(DAY_BG[i], `
  <div style="position:absolute;inset:0;padding:30px 32px 0;display:flex;flex-direction:column">
    <div style="position:relative">
      ${veg(r.veg, DAY_VEG[i], 'width:120px;right:-40px;top:-30px;transform:rotate(14deg)', DAY_BG[i])}
      <div class="kick" style="color:${C.grön}">${r.day} · ${r.minutes} min · 4 portioner</div>
      <div class="hand" style="color:${C.skog};font-size:54px;margin-top:4px;max-width:380px">${r.title}</div>
    </div>
    <div style="background:#fff;border-radius:16px;padding:13px 18px;margin-top:12px;color:${C.skog}">
      <div class="kick" style="font-size:11px;color:${C.grön};margin-bottom:6px">Ingredienser</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:16px;font-weight:600;font-size:15px;line-height:1.5">${r.ingredients.map(x => `<div>${x}</div>`).join('')}</div>
    </div>
    <div style="background:#fff;border-radius:16px;padding:13px 18px;margin-top:10px;color:${C.skog}">
      <div class="kick" style="font-size:11px;color:${C.grön};margin-bottom:8px">Instruktioner</div>
      <ol class="steps">${r.steps.map(s => `<li>${s}</li>`).join('')}</ol>
    </div>
  </div>
  <div style="position:absolute;left:32px;right:32px;bottom:20px;display:flex;justify-content:space-between;align-items:center;font-weight:700;color:${C.skog}"><span style="font-size:18px">📸 Ta en skärmbild → spara i Handlis</span><span style="font-size:13px;color:${C.grön}">@handlis.app</span></div>`);

const cta = () => page(C.skog, `
  ${veg('broccoli', C.lime, 'width:90px;left:30px;top:50px;transform:rotate(-8deg)')}
  ${veg('avocado', C.lime, 'width:80px;right:36px;bottom:60px;transform:rotate(14deg)', C.skog)}
  <div class="wrap" style="align-items:center;text-align:center">
    <img src="${ICON}" style="width:88px;border-radius:20px;margin-bottom:16px">
    <div class="hand" style="color:${C.lime};font-size:58px">Gör vardagen enkel</div>
    <div style="margin-top:10px">${brand('#fff', 52)}</div>
    <div class="sub" style="color:#c9d8c0;max-width:400px">Spara recepten, planera veckan och få inköpslistan sorterad efter din butik. Gratis.</div>
    <div class="btns"><div class="btn" style="background:${C.lime};color:${C.skog}">App Store</div><div class="btn" style="background:${C.lime};color:${C.skog}">Google Play</div></div>
    <div style="font-weight:600;font-size:13px;color:${C.lime};margin-top:14px">Länk i bion · handlis.app</div>
  </div>`);

const b = await browser();
await renderCarousel(b, '1-veckans-recept', [cover(), weekMenu(), howTo(), ...RECIPES.map(recipe), cta()]);
await b.close();
