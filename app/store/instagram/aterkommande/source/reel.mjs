import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
const DIR = 'C:/Users/joaki/AppData/Local/Temp/claude/c--Users-joaki-repos-veckis/270765c5-8274-4714-8358-91df8f5d21cb/scratchpad/ig/';
export default async function run(pg) {
  const ctx = await pg.context().browser().newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(DIR + (process.env.REEL || 'reel') + '.html').href);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  const FR = DIR + (process.env.REEL || 'reel') + '-frames/'; mkdirSync(FR, { recursive: true });
  const FPS = 30, N = Math.round(27.9 * FPS);
  for (let i = 0; i < N; i++) {
    await p.evaluate(t => window.setTime(t), i / FPS, false);
    // PNG, inte JPEG: ingen förlust innan videokodningen (Instagram komprimerar ändå om).
    await p.screenshot({ path: FR + String(i).padStart(4, '0') + '.png', type: 'png' });
  }
  return N;
}
