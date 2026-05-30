#!/usr/bin/env node
// Snabbtest av OpenFoodFacts-täckning för svenska hushållsvaror.
// Användning (interaktiv): node scripts/barcode-test.mjs
// Användning (engång):     node scripts/barcode-test.mjs 7310240001235 7311070000020

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const API = 'https://world.openfoodfacts.org/api/v2/product';
// Be bara om fälten vi bryr oss om — mindre svar, snabbare.
const FIELDS = [
  'product_name',
  'product_name_sv',
  'generic_name_sv',
  'brands',
  'quantity',
  'categories_tags',
  'image_small_url',
  'nutriscore_grade',
  'status_verbose',
].join(',');

async function lookup(barcode) {
  const url = `${API}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Veckis-barcode-test/1.0' } });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const json = await res.json();
    if (json.status === 0 || json.status_verbose === 'product not found') {
      return { error: 'inte hittad i OpenFoodFacts' };
    }
    return { product: json.product ?? null };
  } catch (e) {
    return { error: `nätverksfel: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function pretty(barcode, r) {
  const sep = '─'.repeat(60);
  console.log('\n' + sep);
  console.log(`Streckkod : ${barcode}`);
  if (r.error) {
    console.log(`  → ${r.error}`);
    console.log(sep);
    return;
  }
  const p = r.product ?? {};
  const name = p.product_name_sv || p.product_name || '(inget namn)';
  const cats = Array.isArray(p.categories_tags) ? p.categories_tags.slice(-3).join(', ') : '–';
  console.log(`  Namn       : ${name}`);
  if (p.generic_name_sv) console.log(`  Generisk   : ${p.generic_name_sv}`);
  console.log(`  Märke      : ${p.brands || '–'}`);
  console.log(`  Mängd      : ${p.quantity || '–'}`);
  console.log(`  Kategorier : ${cats}`);
  if (p.image_small_url) console.log(`  Bild       : ${p.image_small_url}`);
  console.log(sep);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    for (const code of args) pretty(code, await lookup(code));
    return;
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log('Veckis streckkodstest (OpenFoodFacts).');
  console.log('Skriv en streckkod + Enter. Tom rad eller "q" avslutar.\n');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const input = (await rl.question('streckkod> ')).trim();
    if (!input || input.toLowerCase() === 'q') break;
    pretty(input, await lookup(input));
  }
  rl.close();
  console.log('\nHej då!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
