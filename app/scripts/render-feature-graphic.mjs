// Play Store "Feature graphic" (1024×500, ingen transparens). Bygger en SVG
// med den befintliga app-ikonen inbäddad som base64-PNG (enklast och mest
// pålitligt sätt att återanvända ikonens redan renderade konst i stället för
// att härleda om alla path-transformer för hand) + "Handlis"-ordmärke i
// Outfit Bold, samma typsnitt som resten av nya designen.
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', 'assets');
const publicDir = join(here, '..', 'public');

const iconPng = readFileSync(join(assets, 'icon.png'));
const iconBase64 = iconPng.toString('base64');
const fontPath = join(assets, 'fonts', 'Outfit_700Bold.ttf');

const W = 1024;
const H = 500;
const ICON = 380;
const ICON_X = 60;
const ICON_Y = (H - ICON) / 2;

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1d3b2e"/>
      <stop offset="1" stop-color="#16302a"/>
    </linearGradient>
    <clipPath id="iconClip">
      <rect x="${ICON_X}" y="${ICON_Y}" width="${ICON}" height="${ICON}" rx="${ICON * 0.22}"/>
    </clipPath>
  </defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#bg)"/>
  <image x="${ICON_X}" y="${ICON_Y}" width="${ICON}" height="${ICON}"
         href="data:image/png;base64,${iconBase64}" clip-path="url(#iconClip)" />
  <text x="500" y="255" font-family="Outfit" font-weight="700" font-size="108"
        fill="#cde66b">Handlis</text>
  <rect x="502" y="285" width="180" height="6" rx="3" fill="#cde66b"/>
  <text x="500" y="345" font-family="Outfit" font-weight="700" font-size="34"
        fill="#d2dcc4">Inköpslista, recept &amp; veckomeny</text>
  <text x="500" y="388" font-family="Outfit" font-weight="700" font-size="34"
        fill="#d2dcc4">för hela hushållet.</text>
</svg>
`;

const resvg = new Resvg(svg, {
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: 'Outfit' },
  background: '#1d3b2e',
});
const rgbaPng = resvg.render().asPng();

// Play Console kräver 24-bit PNG/JPG UTAN alfakanal för feature graphic —
// resvg skriver alltid RGBA. Plattar till mot samma mörkgröna botten och
// tar bort kanalen helt (inte bara sätter alfa=255, som fortfarande räknas
// som "har en alfakanal" av vissa validerare).
const png = await sharp(rgbaPng).flatten({ background: '#1d3b2e' }).png({ palette: false }).toBuffer();
writeFileSync(join(publicDir, 'play-feature-graphic.png'), png);
console.log(`✓ play-feature-graphic.png  (${W}×${H}, ingen alfakanal)`);
