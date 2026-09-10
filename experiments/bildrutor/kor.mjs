/**
 * Mäter om modellen kan peka ut VAR på en bild varje recept sitter.
 *
 * Skriver en HTML-fil med bilden och utritade rutor. Ingen bildbehandling —
 * rutorna är absolutpositionerade div:ar i procent, så vi slipper beroenden och
 * resultatet går att zooma i webbläsaren.
 *
 * Se README.md för vad experimentet ska besvara.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flagga = (namn, fallback) => {
  const i = args.indexOf(namn);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const bildväg = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
if (!bildväg) {
  console.error('Ange en bild:');
  console.error('  npm run bildrutor -- uppslag.jpg');
  console.error('');
  console.error('Filen letas upp relativt din katalog, skriptet, och experiments/bildrutor/bilder/.');
  process.exit(1);
}
// Nyckeln kan ligga i experiments/bildrutor/.env (gitignorerad) i stället för i
// miljön — praktiskt när skriptet körs av något som inte delar din terminal.
const envfil = resolve(dirname(fileURLToPath(import.meta.url)), '.env');
if (!process.env.ANTHROPIC_API_KEY && existsSync(envfil)) {
  const rad = readFileSync(envfil, 'utf8').split(/\r?\n/).find(l => l.startsWith('ANTHROPIC_API_KEY='));
  if (rad) process.env.ANTHROPIC_API_KEY = rad.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY saknas.');
  console.error('');
  console.error('PowerShell:  $env:ANTHROPIC_API_KEY = "sk-ant-..."');
  console.error('bash/zsh:    export ANTHROPIC_API_KEY="sk-ant-..."');
  console.error('');
  console.error(`eller lägg raden ANTHROPIC_API_KEY=sk-ant-... i ${envfil}`);
  process.exit(1);
}

// Default = samma modell som appen kör, så mätningen säger något om det vi
// faktiskt skulle skeppa. --model låter oss jämföra med en starkare.
const model = flagga('--model', 'claude-haiku-4-5');


// Sökvägen ska funka oavsett var man står och hur man skriver den: relativt
// cwd, relativt skriptet, eller bara filnamnet i bilder/. Att behöva hålla reda
// på arbetskatalogen är inget experimentet ska handla om.
const härifrån = dirname(fileURLToPath(import.meta.url));
const kandidater = [
  resolve(process.cwd(), bildväg),
  resolve(härifrån, bildväg),
  resolve(härifrån, 'bilder', bildväg),
];
const bildfil = kandidater.find(existsSync);
if (!bildfil) {
  console.error(`Hittar ingen bild som matchar "${bildväg}". Letade i:`);
  for (const k of kandidater) console.error(`  ${k}`);
  process.exit(1);
}

const mediaType = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[extname(bildfil).toLowerCase()];
if (!mediaType) { console.error(`Okänt bildformat: ${extname(bildfil)}`); process.exit(1); }
const base64 = readFileSync(bildfil).toString('base64');

// 0–1000 i stället för pixlar: modellen slipper känna till bildens verkliga
// mått, och procentomräkningen blir triviell i HTML:en.
const SYSTEM = `Du analyserar bilder av kokbokssidor och receptutskrifter.

Returnera ENBART giltig JSON, inget annat:
{
  "recipes": [
    {
      "title": "receptets rubrik",
      "box": { "x": 0, "y": 0, "width": 1000, "height": 500 },
      "ingredients": ["ingrediensnamn utan mängd"],
      "steps": 3
    }
  ]
}

Regler:
- Ett objekt per SEPARAT recept på bilden. Ser du bara ett recept blir listan ett element.
- box anger var receptet står, i ett koordinatsystem där bildens bredd och höjd båda är 1000.
  x,y är övre vänstra hörnet. Rutan ska omsluta HELA receptet: rubrik, ingredienser och tillagning.
- Rutorna FÅR överlappa varandra och behöver INTE vara lika stora. Ett recept som tar två
  tredjedelar av sidan ska ha en ruta som tar två tredjedelar.
- Hellre för stor ruta än för liten: lägg på marginal så att ingen rad hamnar utanför.
  En ruta som skär genom ingredienslistan är sämre än en som tar med lite tomrum.
- Sidnumrering, sidhuvud och bilder utan recept ska INTE bli egna objekt.
- ingredients: namnen på ingredienserna som hör till JUST det receptet. Det är den viktiga
  uppgiften — rutan visar var receptet står, listan visar vad som faktiskt hör till det.
- steps: antal tillagningssteg i receptet, 0 om inga finns.
- Ser du inget recept alls: { "recipes": [] }`;

const utfil = flagga('--out', bildfil.replace(extname(bildfil), '') + '-rutor.html');

// Nodes inbyggda fetch lämnar en keep-alive-socket öppen efter anropet, och när
// processen sedan avslutas faller Node v24 på Windows i en libuv-assertion:
//   Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c
// Den slår till EFTER att resultatet skrivits, så den är kosmetisk — men den ser
// ut som ett misslyckande. Med en egen dispatcher kan vi stänga poolen själva och
// avsluta rent. (process.exit() är inte lösningen; det UTLÖSER samma assertion.)
//
// undici är ett transitivt beroende, inte ett deklarerat — försvinner det kör vi
// vidare på inbyggd fetch och får leva med bruset vid avslut.
let pool = null;
let fetchAlternativ = {};
try {
  const undici = await import('undici');
  pool = new undici.Agent();
  fetchAlternativ = { fetch: (url, init) => undici.fetch(url, { ...init, dispatcher: pool }) };
} catch {
  console.log('(undici saknas — avslutet kan ge en libuv-assertion, resultatet påverkas inte)');
}

const client = new Anthropic(fetchAlternativ);

console.log(`Modell: ${model}`);
console.log(`Bild:   ${bildfil}`);

let svar;
try {
  svar = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: 'Var på bilden sitter varje recept?' },
      ],
    }],
  });
} catch (err) {
  // Ett experiment ska säga vad som gick fel, inte kasta en stacktrace.
  if (pool) await pool.close();
  if (err?.status === 401) {
    console.error('\nOgiltig ANTHROPIC_API_KEY. Hämta en på console.anthropic.com → API keys.');
  } else if (err?.status === 404) {
    console.error(`\nModellen "${model}" finns inte eller är inte tillgänglig för din nyckel.`);
  } else {
    console.error('\nAnropet misslyckades:', err?.message ?? err);
  }
  // Poolen är stängd här, så ett explicit avslut utlöser inte assertionen.
  process.exit(1);
}

// Modeller med tänkande påslaget (Opus 5 som standard) lägger ett thinking-block
// FÖRST i content. content[0] är då inte texten, och man får tom sträng utan att
// förstå varför. Leta upp textblocket i stället för att anta position.
const rå = svar.content.find(b => b.type === 'text')?.text ?? '';
const start = rå.indexOf('{');
const slut = rå.lastIndexOf('}');
if (start < 0 || slut <= start) {
  if (pool) await pool.close();
  console.error('Modellen svarade inte med JSON:');
  console.error(rå.slice(0, 500));
  process.exit(1);
}

const data = JSON.parse(rå.slice(start, slut + 1));
const recept = data.recipes ?? [];
console.log(`\nHittade ${recept.length} recept:`);
for (const [i, r] of recept.entries()) {
  const b = r.box ?? {};
  const ing = Array.isArray(r.ingredients) ? r.ingredients : [];
  console.log(`  ${i + 1}. ${r.title ?? '(utan rubrik)'}  —  ${ing.length} ingredienser, ${r.steps ?? 0} steg`);
  console.log(`     ruta: x=${b.x} y=${b.y} w=${b.width} h=${b.height}`);
  if (ing.length) console.log(`     ${ing.join(', ')}`);
}
console.log(`\nTokens: ${svar.usage.input_tokens} in, ${svar.usage.output_tokens} ut`);

const FÄRGER = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#ec4899'];
const rutor = recept.map((r, i) => {
  const b = r.box ?? { x: 0, y: 0, width: 0, height: 0 };
  const f = FÄRGER[i % FÄRGER.length];
  return `<div class="ruta" style="left:${b.x / 10}%;top:${b.y / 10}%;width:${b.width / 10}%;height:${b.height / 10}%;border-color:${f}">
    <span class="etikett" style="background:${f}">${i + 1}. ${(r.title ?? '').replace(/</g, '&lt;')}</span>
  </div>`;
}).join('\n');

writeFileSync(utfil, `<!doctype html>
<meta charset="utf-8">
<title>Rutor — ${basename(bildfil)} — ${model}</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 24px; background: #faf9f7; color: #1c1917; }
  .wrap { position: relative; display: inline-block; max-width: 100%; }
  img { display: block; max-width: 100%; height: auto; }
  .ruta { position: absolute; border: 3px solid; border-radius: 4px; box-sizing: border-box; }
  .etikett { position: absolute; top: -2px; left: -2px; color: #fff; font-size: 12px; font-weight: 700; padding: 2px 6px; border-radius: 4px 0 4px 0; white-space: nowrap; }
  pre { background: #fff; border: 1px solid #e7e5e4; border-radius: 8px; padding: 12px; overflow: auto; }
  h1 { font-size: 18px; } h2 { font-size: 15px; margin-top: 28px; } .meta { color: #78716c; font-weight: 400; }
  .kort { background: #fff; border: 1px solid #e7e5e4; border-left-width: 5px; border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; }
  .kort ul { margin: 6px 0 0; padding-left: 18px; } .kort li { margin: 1px 0; }
</style>
<h1>${recept.length} recept &middot; <span class="meta">${model}</span></h1>
<div class="wrap">
  <img src="data:${mediaType};base64,${base64}" alt="">
  ${rutor}
</div>
<h2>Vad hör till vilket recept?</h2>
<p class="meta">Rutan visar VAR receptet står. Listan visar VAD modellen tycker hör till det — det är den som avgör om en uppdelning blir rätt.</p>
${recept.map((r, i) => `<div class="kort" style="border-left-color:${FÄRGER[i % FÄRGER.length]}"><strong>${i + 1}. ${(r.title ?? '(utan rubrik)').replace(/</g, '&lt;')}</strong> <span class="meta">${r.steps ?? 0} steg</span><ul>${(r.ingredients ?? []).map(n => `<li>${String(n).replace(/</g, '&lt;')}</li>`).join('')}</ul></div>`).join('')}
<h2>Modellens svar</h2>
<pre>${JSON.stringify(data, null, 2).replace(/</g, '&lt;')}</pre>
`);

console.log(`\nResultat: ${utfil}`);
console.log('Öppna filen i webbläsaren och se om rutorna sitter rätt.');

if (pool) await pool.close();
console.log('Klart.');
