import { pathToFileURL } from 'node:url';
const DIR = 'C:/Users/joaki/AppData/Local/Temp/claude/c--Users-joaki-repos-veckis/270765c5-8274-4714-8358-91df8f5d21cb/scratchpad/ig/';
export default async function run(pg) {
  const ctx = await pg.context().browser().newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(DIR + 'cover.html').href);
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: DIR + 'reel-omslag.jpg', type: 'jpeg', quality: 92 });
  return 'ok';
}
