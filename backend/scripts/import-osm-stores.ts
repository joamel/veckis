/**
 * Läser in svenska matbutiker från OpenStreetMap till butiksbanken
 * (SharedStore). Se lib/sharedStores.ts.
 *
 * Kan köras om när som helst: raderna nycklas på OSM-id, så en omläsning
 * uppdaterar namn, adress och position. Butiker som försvunnit ur OSM tas
 * INTE bort utan --ta-bort-forsvunna: hushåll kan ha kopplat sina butiker dit,
 * och kopplingen släpps (blir en egen butik) när raden raderas.
 *
 * Användning (PowerShell, från backend/):
 *   npx tsx scripts/import-osm-stores.ts                 # torrkörning mot Overpass
 *   npx tsx scripts/import-osm-stores.ts --apply         # skriv till databasen
 *   npx tsx scripts/import-osm-stores.ts --fil osm.json  # läs en sparad hämtning
 *   --platser-fil platser.json                           # sparade orter (annars hämtas de)
 * Varje lyckad hämtning sparas i den tillfälliga katalogen (osm_se.json och
 * osm_se_platser.json), så en omkörning kan använda --fil när Overpass är nere.
 * Mot prod: sätt $env:DATABASE_URL till Railways DATABASE_PUBLIC_URL först.
 *
 * Datan: © OpenStreetMap-bidragsgivare, ODbL.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { visaMåldatabas } from './visaDb';
import { buildSpelling, fromOsm, fillMissingCity, fillFromPlaces, placeFromOsm, refineUrbanLocality, type Place, type SharedStoreRow } from '../src/lib/sharedStores';

const prisma = new PrismaClient({ log: ['error'] });

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const TA_BORT = argv.includes('--ta-bort-forsvunna');
const filIndex = argv.indexOf('--fil');
const FIL = filIndex >= 0 ? argv[filIndex + 1] : null;
const platsIndex = argv.indexOf('--platser-fil');
const PLATSER_FIL = platsIndex >= 0 ? argv[platsIndex + 1] : null;

// Matbutiker: alla stormarknader, plus närbutiker från kedjorna (ICA Nära,
// Coop, Tempo och Handlar'n är ofta taggade som convenience i OSM).
const QUERY = `[out:json][timeout:200];
area["ISO3166-1"="SE"][admin_level=2]->.se;
(
  nwr["shop"="supermarket"](area.se);
  nwr["shop"="convenience"]["brand"~"ICA|Coop|Hemköp|Willys|Lidl|City Gross|Tempo|Handlar"](area.se);
);
out center tags;`;

// Orter (städer, tätorter, byar, småorter, stadsdelar) — för butiker som
// saknar ort även efter lånet från grannbutiker.
const PLATS_QUERY = `[out:json][timeout:200];
area["ISO3166-1"="SE"][admin_level=2]->.se;
node["place"~"^(city|town|village|hamlet|suburb|neighbourhood|quarter)$"]["name"](area.se);
out qt;`;

// Overpass är gratis och ofta överbelastad: 504 (timeout) och 429 (för
// många anrop) är vanliga. Flera servrar med samma data, och ett nytt försök
// efter en paus, i stället för att ge upp på första felet.
const SERVRAR = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function hämta(query: string, sparaSom: string): Promise<unknown[]> {
  const fel: string[] = [];
  for (let varv = 0; varv < 2; varv++) {
    for (const url of SERVRAR) {
      console.log(`Hämtar från ${new URL(url).host} (tar en minut eller två) …`);
      try {
        // Overpass kräver att man presenterar sig — utan User-Agent svarar den 406.
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Handlis-butiksbank/1.0' },
          body: new URLSearchParams({ data: query }).toString(),
        });
        if (res.ok) {
          const text = await res.text();
          // Spara, så nästa körning kan använda --fil om Overpass är nere.
          const fil = join(tmpdir(), sparaSom);
          writeFileSync(fil, text);
          console.log(`  sparad som ${fil}`);
          return (JSON.parse(text) as { elements: unknown[] }).elements;
        }
        fel.push(`${new URL(url).host}: ${res.status}`);
      } catch (e) {
        fel.push(`${new URL(url).host}: ${e instanceof Error ? e.message : e}`);
      }
      console.log(`  gick inte (${fel[fel.length - 1]}) — provar nästa`);
    }
    if (varv === 0) { console.log('Alla servrar upptagna. Väntar en minut och provar igen …'); await new Promise(r => setTimeout(r, 60_000)); }
  }
  throw new Error(`Ingen Overpass-server svarade (${fel.join('; ')}). Kör med --fil <sparad hämtning> i stället.`);
}

async function main() {
  visaMåldatabas();
  const element = FIL ? JSON.parse(readFileSync(FIL, 'utf8')).elements as unknown[] : await hämta(QUERY, 'osm_se.json');
  // Orterna är en förbättring, inte ett krav: går de inte att hämta blir
  // importen ändå av, bara med grövre eller saknade orter.
  let orter: Place[] = [];
  try {
    const platsElement = PLATSER_FIL
      ? JSON.parse(readFileSync(PLATSER_FIL, 'utf8')).elements as unknown[]
      : await hämta(PLATS_QUERY, 'osm_se_platser.json');
    orter = platsElement.map(e => placeFromOsm(e as Parameters<typeof placeFromOsm>[0])).filter((p): p is Place => !!p);
  } catch (e) {
    console.log(`Orterna kunde inte hämtas (${e instanceof Error ? e.message : e}) — fortsätter utan dem.`);
  }

  // Stavningen (å/ä/ö) för namn ur webbadresser lärs från ort-, gatu- och butiksnamnen.
  const osmTaggar = element.map(e => (e as { tags?: Record<string, string> }).tags ?? {});
  const stavning = buildSpelling([
    ...orter.map(o => o.name),
    ...osmTaggar.flatMap(t => [t.name, t['addr:street'], t['addr:city']].filter((n): n is string => !!n)),
  ]);
  let rader = element.map(e => fromOsm(e as Parameters<typeof fromOsm>[0], stavning)).filter((r): r is SharedStoreRow => !!r);

  // Ordningen spelar roll:
  //  1. stadsdel i storstäderna — FÖRE grannlånet, som annars gav
  //     Sjövikshallen postorten Hägersten fast Liljeholmen låg 500 m bort
  //  2. grannbutikens postort inom 3 km
  //  3. närmaste ort, där större orter väger tyngre
  const utanOrtFöre = rader.filter(r => !r.city).length;
  const förfinade = refineUrbanLocality(rader, orter);
  const medStadsdel = förfinade.filter((r, i) => r.city !== rader[i].city).length;
  rader = fillFromPlaces(fillMissingCity(förfinade), orter);
  console.log(`${orter.length} orter; ${medStadsdel} storstadsbutiker fick stadsdel; butiker utan ort: ${utanOrtFöre} → ${rader.filter(r => !r.city).length}`);

  const perKedja = new Map<string, number>();
  for (const r of rader) perKedja.set(r.chain ?? '(ingen kedja)', (perKedja.get(r.chain ?? '(ingen kedja)') ?? 0) + 1);
  console.log(`\n${rader.length} butiker ur ${element.length} OSM-poster.`);
  for (const [k, n] of [...perKedja].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
  console.log(`  utan ort: ${rader.filter(r => !r.city).length}`);

  const befintliga = await prisma.sharedStore.findMany({ select: { id: true, osmId: true, _count: { select: { stores: true } } } });
  const nya = new Set(rader.map(r => r.osmId));
  const försvunna = befintliga.filter(b => !nya.has(b.osmId));
  const kopplade = försvunna.filter(f => f._count.stores > 0);
  console.log(`\nI databasen nu: ${befintliga.length}. Nya/uppdaterade: ${rader.length}. Försvunna ur OSM: ${försvunna.length} (varav ${kopplade.length} kopplade till hushåll).`);

  if (!APPLY) {
    console.log('\nTorrkörning. Lägg till --apply för att skriva.');
    return;
  }

  // Omgångar, så en enda transaktion inte blir enorm.
  for (let i = 0; i < rader.length; i += 200) {
    const del = rader.slice(i, i + 200);
    await prisma.$transaction(del.map(r => prisma.sharedStore.upsert({
      where: { osmId: r.osmId },
      create: r,
      update: { name: r.name, chain: r.chain, street: r.street, postcode: r.postcode, city: r.city, postalCity: r.postalCity ?? null, lat: r.lat, lon: r.lon },
    })));
    process.stdout.write(`\r  ${Math.min(i + 200, rader.length)}/${rader.length}`);
  }
  console.log('');

  if (TA_BORT && försvunna.length > 0) {
    await prisma.sharedStore.deleteMany({ where: { id: { in: försvunna.map(f => f.id) } } });
    console.log(`${försvunna.length} försvunna borttagna; ${kopplade.length} hushållsbutiker blev egna butiker igen.`);
  }
  console.log('KLART.');
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
