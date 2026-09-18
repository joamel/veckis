// OG/social-preview-bild (1200×630) i den nya "skog & lime"-identiteten.
// Samma teknik som render-feature-graphic.mjs — bäddar in den befintliga
// app-ikonen som base64-PNG och lägger "Handlis"-ordmärke + tagline i
// Outfit Bold ovanpå en skog-gradient.
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

const W = 1200;
const H = 630;
const ICON = 420;
const ICON_X = 110;
const ICON_Y = (H - ICON) / 2;
const TEXT_X = 590;

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
  <text x="${TEXT_X}" y="300" font-family="Outfit" font-weight="700" font-size="120"
        fill="#cde66b">Handlis</text>
  <rect x="${TEXT_X + 2}" y="332" width="200" height="7" rx="3.5" fill="#cde66b"/>
  <text x="${TEXT_X}" y="405" font-family="Outfit" font-weight="700" font-size="38"
        fill="#d2dcc4">Inköpslista, recept &amp; veckomeny</text>
  <text x="${TEXT_X}" y="455" font-family="Outfit" font-weight="700" font-size="38"
        fill="#d2dcc4">för hela hushållet.</text>
</svg>
`;

const resvg = new Resvg(svg, {
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: 'Outfit' },
  background: '#1d3b2e',
});
const rgbaPng = resvg.render().asPng();
const png = await sharp(rgbaPng).flatten({ background: '#1d3b2e' }).png({ palette: false }).toBuffer();
writeFileSync(join(publicDir, 'og-image.png'), png);
console.log(`✓ og-image.png  (${W}×${H})`);
