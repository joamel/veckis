import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const DIR = 'C:/Users/joaki/AppData/Local/Temp/claude/c--Users-joaki-repos-veckis/270765c5-8274-4714-8358-91df8f5d21cb/scratchpad/hdr';
export default async function run(page) {
  const ctx = await page.context().browser().newContext({ viewport: { width: 1920, height: 823 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(join(DIR, 'header.html')).href);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(DIR, 'header-raw.png'), type: 'png' });
  await p.setViewportSize({ width: 1920, height: 823 });
  return 'ok';
}
