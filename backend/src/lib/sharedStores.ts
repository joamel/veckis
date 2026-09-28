/**
 * Butiksbanken: svenska matbutiker från OpenStreetMap, som hushållens egna
 * butiker kan kopplas till. Då räknas handlingar i samma butik ihop, och den
 * som väljer en butik där andra redan handlat får en bra ordning direkt.
 *
 * Butiker känns igen genom att man VÄLJER ur listan — inte genom att jämföra
 * fritext. "Orminge Coop", "Coop Orminge" och "coop orm" blir aldrig
 * tillförlitligt samma sak, men alla tre hittar Stora Coop Orminge i sökningen.
 *
 * Datan: © OpenStreetMap-bidragsgivare, ODbL. Källan ska anges där listan visas.
 *
 * Allt här är rent och testat (sharedStores.test.ts).
 */

export type SharedStoreRow = {
  osmId: string;
  name: string;
  chain: string | null;
  street: string | null;
  postcode: string | null;
  /** Orten som visas: postorten, eller stadsdel + stad i storstäderna. */
  city: string | null;
  /** Postorten ur OSM (addr:city), för postadressen. */
  postalCity?: string | null;
  lat: number;
  lon: number;
};

type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** Kedjorna i den ordning de prövas — Maxi ICA före ICA, Coop Konsum före Coop. */
const KEDJOR: Array<[RegExp, string]> = [
  [/\bica\b/i, 'ICA'],
  [/\b(coop|konsum)\b/i, 'Coop'],
  [/\bwillys\b/i, 'Willys'],
  [/\bhemk[öo]p\b/i, 'Hemköp'],
  [/\blidl\b/i, 'Lidl'],
  [/\bcity\s*gross\b/i, 'City Gross'],
  [/\btempo\b/i, 'Tempo'],
  [/\bhandlar'?n\b/i, "Handlar'n"],
];

/** Kedjan ur brand-taggen, annars ur namnet. null när ingen känns igen. */
export function chainFrom(tags: Record<string, string>): string | null {
  for (const källa of [tags.brand, tags.name]) {
    if (!källa) continue;
    for (const [re, kedja] of KEDJOR) if (re.test(källa)) return kedja;
  }
  return null;
}

/** "134 39" → "13439". Allt som inte blir fem siffror ger null. */
export function normalizePostcode(raw: string | null | undefined): string | null {
  const siffror = (raw ?? '').replace(/\D/g, '');
  return siffror.length === 5 ? siffror : null;
}

/** Å, ä, ö och andra diakriter bort, gemener — så "sjövik" och "sjovik"
 *  (som i en webbadress) jämförs som samma ord. */
export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/** Ord som bara säger vilken kedja eller butikstyp det är — inte VILKEN butik. */
const GENERISKA_ORD = new Set([
  'ica', 'nara', 'supermarket', 'kvantum', 'maxi', 'stormarknad', 'coop', 'konsum', 'extra', 'forum',
  'stora', 'willys', 'hemma', 'hemkop', 'lidl', 'city', 'gross', 'tempo', 'handlarn', 'handlar', 'n', 'butik', 'se',
]);

/**
 * Ortsdelen ur en butiks webbadress eller e-post, när namnet inte säger den.
 * I OSM heter många butiker bara "ICA Supermarket", medan webbadressen är
 * ".../ica-supermarket-sjovikshallen-1109001/" och e-posten
 * "kundkontakt.sjovikshallen@supermarket.ica.se". Utan det här gick
 * ICA Supermarket Sjövikshallen inte att hitta på "Sjövikshallen".
 * Adresser saknar å/ä/ö — med en stavningsordlista (buildSpelling) får
 * de tillbaka dem: "sjovikshallen" → "Sjövikshallen".
 */
export function localityFrom(tags: Record<string, string>, spelling?: Spelling): string | null {
  const kandidater: string[] = [];
  const webb = tags.website ?? tags['contact:website'];
  if (webb) {
    // Bakifrån: sista delen är ofta ett sidnamn ("/start", "/kontakta-oss"),
    // och då står butiken i delen före.
    const delar = webb.replace(/[?#].*$/, '').replace(/^https?:\/\//, '').split('/').slice(1).filter(Boolean);
    for (const d of delar.reverse()) if (!d.includes('.')) kandidater.push(d);
  }
  const epost = tags.email ?? tags['contact:email'];
  if (epost) kandidater.push(epost.split('@')[0]);
  for (const k of kandidater) {
    const ord = k.split(/[-_.]+/)
      .map(o => fold(o))
      .filter(o => o && !/^\d+$/.test(o) && !GENERISKA_ORD.has(o) && !SIDORD.has(o));
    if (ord.length > 0) return ord.map(o => snyggtOrd(withSpelling(o, spelling))).join(' ');
  }
  return null;
}

/** Delar av webbadresser och e-post som är sidor eller funktioner, inte orter. */
const SIDORD = new Set([
  'start', 'index', 'hem', 'om', 'oss', 'kontakta', 'kontakt', 'kundkontakt', 'info', 'butiker', 'butik',
  'butiken', 'erbjudanden', 'store', 'stores', 'sv', 'sverige', 'se', 'www', 'html', 'php',
]);

/** Stavning med å/ä/ö, nycklad på stavningen utan: "sjovik" → "sjövik". */
export type Spelling = Map<string, string>;

/**
 * Stavningsordlista ur ortnamn, gatunamn och butiksnamn. Varje ord får sin
 * vanligaste stavning, och bara ord där den har å/ä/ö kommer med — "hallen"
 * (28 gånger i OSM) vinner över "hällen" (3) och lämnas alltså i fred.
 */
export function buildSpelling(names: string[]): Spelling {
  const räkning = new Map<string, Map<string, number>>();
  for (const namn of names) {
    for (const o of namn.split(/[ -]+/)) {
      if (o.length < 4) continue;
      const nyckel = fold(o);
      const stavning = o.toLowerCase();
      const m = räkning.get(nyckel) ?? new Map<string, number>();
      m.set(stavning, (m.get(stavning) ?? 0) + 1);
      räkning.set(nyckel, m);
    }
  }
  // Även ord utan å/ä/ö kommer med: längsta kända ord ska vinna, så "hallen"
  // blir kvar som det är i stället för att bli "häll" + "en".
  const ut: Spelling = new Map();
  for (const [nyckel, m] of räkning) ut.set(nyckel, [...m].sort((a, b) => b[1] - a[1])[0][0]);
  return ut;
}

/**
 * Ett ord utan å/ä/ö med svensk stavning, även sammansatt: längsta kända
 * början först, sedan resten (efter ett eventuellt foge-s) på samma sätt.
 * "sjovikshallen" → "sjövik" + "s" + "hallen".
 */
function withSpelling(o: string, spelling?: Spelling): string {
  if (!spelling) return o;
  let ut = '';
  let rest = o;
  while (rest.length >= 4) {
    let n = rest.length;
    while (n >= 4 && !spelling.has(rest.slice(0, n))) n--;
    if (n < 4) break;
    ut += spelling.get(rest.slice(0, n));
    rest = rest.slice(n);
    if (rest.startsWith('s') && rest.length > 4) { ut += 's'; rest = rest.slice(1); }
  }
  return ut + rest;
}

/** Webbadresser skriver å/ä/ö som aa/ae/oe ("tellusvaegen"). Tillbaka till
 *  svenska i visningen; sökningen tar ändå hand om både o och ö (fold). */
function snyggtOrd(o: string): string {
  const svenskt = o.replace(/aa/g, 'å').replace(/ae/g, 'ä').replace(/oe/g, 'ö');
  return svenskt[0].toUpperCase() + svenskt.slice(1);
}

/** Är namnet bara kedjan/butikstypen, utan något som skiljer ut butiken? */
function ärGeneriskt(name: string): boolean {
  return fold(name).split(/[\s'-]+/).filter(Boolean).every(o => GENERISKA_ORD.has(o));
}

/** En OSM-post som rad i butiksbanken, eller null om den saknar namn/position. */
export function fromOsm(e: OsmElement, spelling?: Spelling): SharedStoreRow | null {
  const tags = e.tags ?? {};
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  let name = tags.name?.trim();
  if (!name || lat == null || lon == null) return null;
  // "ICA Supermarket" → "ICA Supermarket Sjövikshallen" när webbadressen
  // eller e-posten säger vilken butik det är.
  if (ärGeneriskt(name)) {
    const ort = localityFrom(tags, spelling);
    if (ort) name = `${name} ${ort}`;
  }
  const gata = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ') || null;
  return {
    osmId: `${e.type}/${e.id}`,
    name,
    chain: chainFrom(tags),
    street: gata,
    postcode: normalizePostcode(tags['addr:postcode']),
    city: tags['addr:city']?.trim() || null,
    postalCity: tags['addr:city']?.trim() || null,
    lat,
    lon,
  };
}

export type Position = { lat: number; lon: number };

/** Avstånd i km (haversine). */
export function distanceKm(a: Position, b: Position): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function medel(punkter: Position[]): Position | null {
  if (punkter.length === 0) return null;
  return {
    lat: punkter.reduce((s, p) => s + p.lat, 0) / punkter.length,
    lon: punkter.reduce((s, p) => s + p.lon, 0) / punkter.length,
  };
}

/**
 * Ungefärlig position för ett postnummer: medelpunkten av butikerna med samma
 * nummer, annars samma tre första siffror (ett område, t.ex. 132 = Nacka),
 * annars två. Bara 41 % av butikerna har postnummer, så exakt träff är
 * ovanligt — men tre siffror räcker för att sortera närmaste först.
 */
export function positionForPostcode(postcode: string, stores: SharedStoreRow[]): Position | null {
  const pn = normalizePostcode(postcode);
  if (!pn) return null;
  for (const längd of [5, 3, 2]) {
    const prefix = pn.slice(0, längd);
    const träffar = stores.filter(s => s.postcode?.startsWith(prefix)).map(s => ({ lat: s.lat, lon: s.lon }));
    const p = medel(träffar);
    if (p) return p;
  }
  return null;
}

/**
 * Ort åt butiker som saknar den: lånas från närmaste butik med ort inom
 * maxKm. Utan det var "Willys", "Willys" och "Willys" omöjliga att skilja åt i
 * sökresultatet — 43 % av butikerna saknar ort i OSM. Lånad ort är en
 * gissning, så den gäller bara visning och sökning, aldrig identitet.
 */
export function fillMissingCity(rows: SharedStoreRow[], maxKm = 3): SharedStoreRow[] {
  const medOrt = rows.filter(r => r.city);
  return rows.map(r => {
    if (r.city) return r;
    let bäst: { city: string; km: number } | null = null;
    for (const o of medOrt) {
      const km = distanceKm(r, o);
      if (km <= maxKm && (!bäst || km < bäst.km)) bäst = { city: o.city!, km };
    }
    return bäst ? { ...r, city: bäst.city } : r;
  });
}

export type Place = { name: string; lat: number; lon: number; kind?: string };

/** En ort-punkt ur OSM (place=city/town/village/…), eller null. */
export function placeFromOsm(e: OsmElement): Place | null {
  const name = e.tags?.name?.trim();
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  return name && lat != null && lon != null ? { name, lat, lon, kind: e.tags?.place } : null;
}

/**
 * Hur mycket längre bort en ort får ligga och ändå vinna över en mindre.
 * Den NÄRMASTE orten var ofta en gård eller en stadsdel: "ICA Kvantum Hovås"
 * fick Stora Svindal och "ICA Nära Byxelkrok" fick Mellby. Avståndet delas med
 * vikten, så en tätort fyra km bort slår en gård en km bort.
 */
const ORTVIKT: Record<string, number> = {
  city: 4, town: 4, village: 2.5, suburb: 2, quarter: 1.5, neighbourhood: 1.2, hamlet: 1,
};

/**
 * Sista utvägen för butiker utan ort: namnet på närmaste ort i OSM inom maxKm.
 * Efter lånet från grannbutiker saknade 426 butiker fortfarande ort — oftast
 * på landsbygden, där närmaste butik med adress ligger långt bort men en by
 * eller småort finns alldeles intill. Rutnät per grad, så 3 000 butiker mot
 * tiotusentals orter inte blir en jämförelse var med var.
 */
export function fillFromPlaces(rows: SharedStoreRow[], places: Place[], maxKm = 10): SharedStoreRow[] {
  const ruta = (lat: number, lon: number) => `${Math.floor(lat)}:${Math.floor(lon)}`;
  const nät = new Map<string, Place[]>();
  for (const p of places) {
    const k = ruta(p.lat, p.lon);
    if (!nät.has(k)) nät.set(k, []);
    nät.get(k)!.push(p);
  }
  return rows.map(r => {
    if (r.city) return r;
    const namnOrd = new Set(fold(r.name).split(/[^a-z0-9]+/).filter(Boolean));
    let iNamnet: { name: string; km: number } | null = null;
    let bäst: { name: string; poäng: number } | null = null;
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        for (const p of nät.get(ruta(r.lat + dLat, r.lon + dLon)) ?? []) {
          const km = distanceKm(r, p);
          if (km > maxKm) continue;
          // Står ortens namn i butikens namn ("ICA Nära Byxelkrok") är det
          // den orten — den säkraste ledtråden som finns.
          const ortOrd = fold(p.name).split(/[^a-z0-9]+/).filter(Boolean);
          if (ortOrd.length > 0 && ortOrd.every(o => namnOrd.has(o)) && (!iNamnet || km < iNamnet.km)) {
            iNamnet = { name: p.name, km };
          }
          const poäng = km / (ORTVIKT[p.kind ?? ''] ?? 1);
          if (!bäst || poäng < bäst.poäng) bäst = { name: p.name, poäng };
        }
      }
    }
    const val = iNamnet?.name ?? bäst?.name;
    return val ? { ...r, city: val } : r;
  });
}

/** Städer där postorten är för grov — där säger man stadsdel. */
const STORSTÄDER = new Set(['stockholm', 'goteborg', 'malmo', 'uppsala']);
const STADSDEL = new Set(['suburb', 'quarter', 'neighbourhood']);

/**
 * Stadsdel i storstäderna, FÖRE alla andra reserver. I Stockholm säger
 * postorten "Stockholm" eller "Hägersten" för butiker som ligger nio minuter
 * isär med bil — en evighet i innerstan. ICA Supermarket Sjövikshallen saknar
 * ort i OSM och fick låna "Hägersten" från en grannbutik, fast Liljeholmen
 * ligger 500 m bort.
 *
 * Gäller butiker utan ort och butiker vars ort är en storstad: närmaste
 * stadsdel inom maxKm, följd av staden — "Liljeholmen, Stockholm", så den
 * som inte känner stadsdelen ändå vet var butiken ligger. Staden är
 * postorten när den är en storstad, annars närmaste stad eller tätort (där
 * en stad väger mer än en tätort, så Rinkeby blir Stockholm och inte
 * Sundbyberg). Körs före fillMissingCity, som annars lånar postorten först.
 */
export function refineUrbanLocality(rows: SharedStoreRow[], places: Place[], maxKm = 1.5): SharedStoreRow[] {
  const delar = places.filter(p => STADSDEL.has(p.kind ?? ''));
  const städer = places.filter(p => p.kind === 'city' || p.kind === 'town');
  const staden = (r: SharedStoreRow): string | null => {
    if (r.city) return r.city;
    let bäst: { name: string; poäng: number } | null = null;
    for (const p of städer) {
      const km = distanceKm(r, p);
      if (km > 20) continue;
      const poäng = km / (p.kind === 'city' ? 4 : 1.5);
      if (!bäst || poäng < bäst.poäng) bäst = { name: p.name, poäng };
    }
    return bäst?.name ?? null;
  };
  const ruta = (lat: number, lon: number) => `${Math.floor(lat * 10)}:${Math.floor(lon * 10)}`;
  const nät = new Map<string, Place[]>();
  for (const p of delar) {
    const k = ruta(p.lat, p.lon);
    if (!nät.has(k)) nät.set(k, []);
    nät.get(k)!.push(p);
  }
  return rows.map(r => {
    if (r.city && !STORSTÄDER.has(fold(r.city))) return r;
    // Stadsdelen (suburb) först: det är nivån folk säger — Östermalm,
    // Kungsholmen, Liljeholmen. Kvarteren (quarter/neighbourhood) är ofta för
    // små ("Ruddammen", "Atlasområdet") och används bara när ingen stadsdel
    // finns nära, och då bara på 1 km.
    // Står stadsdelen i butikens namn ("Willys Hemma Malmö Möllevången") vinner
    // den, på upp till 2,5 km — namnet är den säkraste ledtråden.
    const namnOrd = new Set(fold(r.name).split(/[^a-z0-9]+/).filter(Boolean));
    let iNamnet: { name: string; km: number } | null = null;
    let stadsdel: { name: string; km: number } | null = null;
    let kvarter: { name: string; km: number } | null = null;
    // Rutor på en tiondels grad (~5–11 km) — tre åt varje håll räcker för 2,5 km.
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        for (const p of nät.get(`${Math.floor(r.lat * 10) + dLat}:${Math.floor(r.lon * 10) + dLon}`) ?? []) {
          const km = distanceKm(r, p);
          const ortOrd = fold(p.name).split(/[^a-z0-9]+/).filter(Boolean);
          if (km <= 2.5 && ortOrd.length > 0 && ortOrd.every(o => namnOrd.has(o)) && (!iNamnet || km < iNamnet.km)) {
            iNamnet = { name: p.name, km };
          }
          if (p.kind === 'suburb') {
            if (km <= maxKm && (!stadsdel || km < stadsdel.km)) stadsdel = { name: p.name, km };
          } else if (km <= Math.min(1, maxKm) && (!kvarter || km < kvarter.km)) {
            kvarter = { name: p.name, km };
          }
        }
      }
    }
    const val = iNamnet ?? stadsdel ?? kvarter;
    if (!val) return r;
    const stad = staden(r);
    return { ...r, city: stad && fold(stad) !== fold(val.name) ? `${val.name}, ${stad}` : val.name };
  });
}

export type SearchHit = SharedStoreRow & { distanceKm: number | null };

/**
 * Sök i butiksbanken. Varje ord i sökningen måste finnas någonstans i
 * butikens namn, kedja, gata, postnummer eller ort — i valfri ordning, så
 * "orminge coop" och "coop orminge" hittar samma butik. Med en position
 * sorteras träffarna närmast först; utan sökord visas bara de närmaste.
 */
export function searchSharedStores(
  stores: SharedStoreRow[],
  opts: { q?: string; near?: Position | null; limit?: number },
): SearchHit[] {
  const ord = fold(opts.q ?? '').split(/\s+/).map(o => o.trim()).filter(Boolean);
  const limit = opts.limit ?? 20;
  if (ord.length === 0 && !opts.near) return [];

  const träffar: Array<SearchHit & { poäng: number }> = [];
  for (const s of stores) {
    const namn = fold(s.name);
    const allt = fold([s.name, s.chain, s.street, s.postcode, s.city, s.postalCity].filter(Boolean).join(' '));
    if (!ord.every(o => allt.includes(o))) continue;
    // Ord som träffar i NAMNET väger tyngst — "coop" ska ge Coop-butiker före
    // en butik som ligger på Coopvägen.
    const poäng = ord.filter(o => namn.includes(o)).length;
    träffar.push({ ...s, distanceKm: opts.near ? distanceKm(opts.near, s) : null, poäng });
  }

  träffar.sort((a, b) =>
    (a.distanceKm !== null && b.distanceKm !== null ? a.distanceKm - b.distanceKm : 0)
    || b.poäng - a.poäng
    || a.name.localeCompare(b.name, 'sv'),
  );
  return träffar.slice(0, limit).map(({ poäng: _p, ...h }) => h);
}
