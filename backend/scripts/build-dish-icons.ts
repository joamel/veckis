/**
 * Bygger appens matsymboler: varje symbol i DISH_ICON_EMOJIS hämtas från
 * Twemoji (CC-BY 4.0), ritas som vita konturer på genomskinlig botten och
 * sparas i app/assets/dish-icons/. Appen färgar dem själv (Image tintColor),
 * så de följer ljust och mörkt läge. Skriver också app/src/lib/dishIcons.ts.
 *
 *   npx tsx scripts/build-dish-icons.ts
 *
 * Körs för hand när listan i shared/src/lib/dishIconList.ts ändras.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { DISH_ICON_EMOJIS } from '@veckis/shared';
import { fetchEmojiSvg, outlineSvg, twemojiCode } from '../src/lib/twemoji';

const SIZE = 192;
const APP = path.join(__dirname, '..', '..', 'app');
const OUT = path.join(APP, 'assets', 'dish-icons');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const rows: string[] = [];
  const missing: string[] = [];
  for (const emoji of DISH_ICON_EMOJIS) {
    const svg = await fetchEmojiSvg(emoji);
    if (!svg) { missing.push(emoji); continue; }
    const code = twemojiCode(emoji);
    // Tjockare linje än i stora bilder: ikonen visas 28–76 px stor.
    const png = await sharp(Buffer.from(outlineSvg(svg, '#ffffff', 1.6)), { density: 400 })
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ palette: true, colours: 16, compressionLevel: 9 })
      .toBuffer();
    fs.writeFileSync(path.join(OUT, `${code}.png`), png);
    rows.push(`  '${emoji}': require('../../assets/dish-icons/${code}.png'),`);
  }
  const ts = `// GENERERAD av backend/scripts/build-dish-icons.ts — ändra inte för hand.
// Matsymboler (Twemoji, CC-BY 4.0) som vita konturer; färgas med tintColor.
import type { ImageSourcePropType } from 'react-native';

export const DISH_ICONS: Record<string, ImageSourcePropType> = {
${rows.join('\n')}
};
`;
  fs.writeFileSync(path.join(APP, 'src', 'lib', 'dishIcons.ts'), ts);
  const bytes = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`${rows.length} symboler, ${(bytes / 1024).toFixed(0)} KB${missing.length ? `, saknas: ${missing.join(' ')}` : ''}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
