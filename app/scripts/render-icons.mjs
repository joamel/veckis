// Render SVG → PNG för app-ikonerna. Kör en gång efter att SVG:erna ändrats.
// Output skrivs till app/assets/ (icon.png, adaptive-icon.png, splash-icon.png,
// favicon.png). Resvg ger pixel-perfekta rasters utan headless browser.
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', 'assets');

const renders = [
  { src: 'icon.svg',          out: 'icon.png',          size: 1024 },
  { src: 'adaptive-icon.svg', out: 'adaptive-icon.png', size: 1024 },
  { src: 'splash-icon.svg',   out: 'splash-icon.png',   size: 1024 },
  { src: 'icon.svg',          out: 'favicon.png',       size: 48   },
];

for (const r of renders) {
  const svg = readFileSync(join(assets, r.src), 'utf8');
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: r.size } });
  const png = resvg.render().asPng();
  writeFileSync(join(assets, r.out), png);
  console.log(`✓ ${r.out}  (${r.size}×${r.size})`);
}
