import { describe, expect, it } from 'vitest';
import {
  buildSpelling, chainFrom, distanceKm, fillFromPlaces, fillMissingCity, fromOsm, normalizePostcode, positionForPostcode, refineUrbanLocality, searchSharedStores, type SharedStoreRow,
} from './sharedStores';

// Riktiga rader ur OSM-hämtningen 2026-09-28 (förenklade).
const orminge: SharedStoreRow = { osmId: 'way/1', name: 'Stora Coop Orminge', chain: 'Coop', street: 'Ormingeplan 3', postcode: '13230', city: 'Saltsjö-Boo', lat: 59.327, lon: 18.25 };
const gbgCoop: SharedStoreRow = { osmId: 'node/2', name: 'Coop Gustavsberg', chain: 'Coop', street: 'Skärgårdsvägen 5', postcode: null, city: 'Gustavsberg', lat: 59.326, lon: 18.39 };
const gbgLidl: SharedStoreRow = { osmId: 'node/3', name: 'Lidl', chain: 'Lidl', street: 'Medeas väg 2', postcode: '13444', city: 'Gustavsberg', lat: 59.33, lon: 18.36 };
const malmö: SharedStoreRow = { osmId: 'node/4', name: 'Coop Värnhem', chain: 'Coop', street: null, postcode: '21215', city: 'Malmö', lat: 55.6, lon: 13.02 };
const nacka: SharedStoreRow = { osmId: 'node/5', name: 'ICA Nära Fisksätra', chain: 'ICA', street: null, postcode: '13241', city: 'Saltsjöbaden', lat: 59.29, lon: 18.25 };
const alla = [orminge, gbgCoop, gbgLidl, malmö, nacka];

describe('chainFrom', () => {
  it('läser kedjan ur brand, annars ur namnet', () => {
    expect(chainFrom({ brand: 'Maxi ICA Stormarknad' })).toBe('ICA');
    expect(chainFrom({ brand: 'Coop (Sweden)' })).toBe('Coop');
    expect(chainFrom({ name: 'Coop Konsum Hagaby' })).toBe('Coop');
    expect(chainFrom({ name: 'Hemköp Gustavsberg Hamnen' })).toBe('Hemköp');
    expect(chainFrom({ brand: "Handlar'n" })).toBe("Handlar'n");
    expect(chainFrom({ name: 'Handlarn Ljusdal' })).toBe("Handlar'n");
  });

  it('ger null för butiker utanför kedjorna, och tolkar inte in delord', () => {
    expect(chainFrom({ name: 'Byaboden' })).toBeNull();
    expect(chainFrom({ name: 'Picard' })).toBeNull(); // innehåller "ica" men är inte ICA
  });
});

describe('normalizePostcode', () => {
  it('tar bort mellanslag och godtar bara fem siffror', () => {
    expect(normalizePostcode('134 39')).toBe('13439');
    expect(normalizePostcode('13230')).toBe('13230');
    expect(normalizePostcode('1323')).toBeNull();
    expect(normalizePostcode(undefined)).toBeNull();
  });
});

describe('fromOsm', () => {
  it('tar position ur center för ytor och ur lat/lon för punkter', () => {
    expect(fromOsm({ type: 'way', id: 9, center: { lat: 1, lon: 2 }, tags: { name: 'Willys' } })).toMatchObject({ osmId: 'way/9', lat: 1, lon: 2, chain: 'Willys' });
    expect(fromOsm({ type: 'node', id: 8, lat: 3, lon: 4, tags: { name: 'Lidl', 'addr:street': 'Medeas väg', 'addr:housenumber': '2', 'addr:postcode': '134 44' } }))
      .toMatchObject({ street: 'Medeas väg 2', postcode: '13444' });
  });

  it('hoppar över poster utan namn eller position', () => {
    expect(fromOsm({ type: 'node', id: 1, lat: 1, lon: 1, tags: {} })).toBeNull();
    expect(fromOsm({ type: 'way', id: 1, tags: { name: 'X' } })).toBeNull();
  });
});

describe('searchSharedStores', () => {
  it('hittar samma butik oavsett ordföljd', () => {
    expect(searchSharedStores(alla, { q: 'orminge coop' }).map(s => s.osmId)).toEqual(['way/1']);
    expect(searchSharedStores(alla, { q: 'coop orminge' }).map(s => s.osmId)).toEqual(['way/1']);
    expect(searchSharedStores(alla, { q: 'Coop Orm' }).map(s => s.osmId)).toEqual(['way/1']);
  });

  it('söker även på ort, gata och postnummer', () => {
    expect(searchSharedStores(alla, { q: 'gustavsberg' }).map(s => s.osmId).sort()).toEqual(['node/2', 'node/3']);
    expect(searchSharedStores(alla, { q: 'medeas' }).map(s => s.osmId)).toEqual(['node/3']);
    expect(searchSharedStores(alla, { q: '13230' }).map(s => s.osmId)).toEqual(['way/1']);
  });

  it('sorterar närmast först när en position finns', () => {
    const iOrminge = { lat: 59.327, lon: 18.25 };
    const coop = searchSharedStores(alla, { q: 'coop', near: iOrminge });
    expect(coop.map(s => s.osmId)).toEqual(['way/1', 'node/2', 'node/4']);
    expect(coop[0].distanceKm).toBeLessThan(0.1);
  });

  it('visar de närmaste utan sökord, och ingenting utan varken sökord eller position', () => {
    const nära = searchSharedStores(alla, { near: { lat: 59.327, lon: 18.25 }, limit: 2 });
    expect(nära.map(s => s.osmId)).toEqual(['way/1', 'node/5']);
    expect(searchSharedStores(alla, {})).toEqual([]);
  });
});

describe('butiker med bara kedjans namn', () => {
  // Den riktiga posten: node/459776346, heter bara "ICA Supermarket" i OSM.
  const sjövik = {
    type: 'node', id: 459776346, lat: 59.307, lon: 18.03,
    tags: {
      brand: 'ICA Supermarket', name: 'ICA Supermarket', shop: 'supermarket',
      email: 'kundkontakt.sjovikshallen@supermarket.ica.se',
      website: 'https://www.ica.se/butiker/supermarket/stockholm/ica-supermarket-sjovikshallen-1109001/',
    },
  };

  it('får ortsdelen ur webbadressen', () => {
    expect(fromOsm(sjövik)!.name).toBe('ICA Supermarket Sjovikshallen');
  });

  it('faller tillbaka på e-posten, och rör inte namn som redan säger vilken butik', () => {
    const utanWebb = { ...sjövik, tags: { ...sjövik.tags, website: '' } };
    expect(fromOsm(utanWebb)!.name).toBe('ICA Supermarket Sjovikshallen');
    const riktigt = { ...sjövik, tags: { ...sjövik.tags, name: 'ICA Nära Björknäs' } };
    expect(fromOsm(riktigt)!.name).toBe('ICA Nära Björknäs');
  });

  it('hoppar över sidnamn i webbadressen och tar butiken i delen före', () => {
    const start = { ...sjövik, tags: { ...sjövik.tags, email: '', website: 'https://www.ica.se/butiker/kvantum/norrkoping/ica-kvantum-tuna-1234/start/' } };
    expect(fromOsm(start)!.name).toBe('ICA Supermarket Tuna');
    const kontakt = { ...sjövik, tags: { ...sjövik.tags, email: '', website: 'https://handlarn.se/kallby/kontakta-oss' } };
    expect(fromOsm(kontakt)!.name).toBe('ICA Supermarket Kallby');
  });

  it('får tillbaka å/ä/ö ur stavningsordlistan, även i sammansatta ord', () => {
    // Ur riktiga OSM-namn: "Sjövik" (ort), "hallen" betydligt vanligare än "hällen".
    const stavning = buildSpelling(['Sjövik', 'Sjövik', 'Hallen', 'Hallen', 'Hällen', 'Malmö']);
    expect(fromOsm(sjövik, stavning)!.name).toBe('ICA Supermarket Sjövikshallen');
    const malmö = { ...sjövik, tags: { ...sjövik.tags, email: '', website: 'https://www.ica.se/butiker/nara/malmo/ica-nara-malmo-1/' } };
    expect(fromOsm(malmö, stavning)!.name).toBe('ICA Supermarket Malmö');
  });

  it('skriver tillbaka å/ä/ö som webbadresser skriver aa/ae/oe', () => {
    const lidl = { type: 'node', id: 1, lat: 1, lon: 1, tags: { name: 'Lidl', brand: 'Lidl', website: 'https://www.lidl.se/s/sv-SE/filialer/stockholm/tellusvaegen-5/' } };
    expect(fromOsm(lidl)!.name).toBe('Lidl Tellusvägen');
  });

  it('hittas på "sjövik" och "Sjövikshallen" trots att webbadressen saknar ö', () => {
    const rad = fromOsm(sjövik)!;
    expect(searchSharedStores([rad], { q: 'sjövik' })).toHaveLength(1);
    expect(searchSharedStores([rad], { q: 'ica sjövikshallen' })).toHaveLength(1);
  });

  it('åäö spelar ingen roll i sökningen åt något håll', () => {
    expect(searchSharedStores(alla, { q: 'saltsjo-boo' }).map(s => s.osmId)).toEqual(['way/1']);
  });
});

describe('fillMissingCity', () => {
  it('lånar ort från närmaste butik inom räckhåll, men inte från andra sidan landet', () => {
    const utanOrt: SharedStoreRow = { ...gbgLidl, osmId: 'node/9', name: 'Willys', city: null, lat: 59.331, lon: 18.361 };
    const långtBort: SharedStoreRow = { ...utanOrt, osmId: 'node/10', lat: 63.8, lon: 20.3 };
    const ut = fillMissingCity([...alla, utanOrt, långtBort]);
    expect(ut.find(r => r.osmId === 'node/9')!.city).toBe('Gustavsberg');
    expect(ut.find(r => r.osmId === 'node/10')!.city).toBeNull();
  });
});

describe('fillFromPlaces', () => {
  const landsbygd: SharedStoreRow = { osmId: 'node/20', name: "Handlar'n", chain: "Handlar'n", street: null, postcode: null, city: null, lat: 63.2, lon: 14.6 };

  it('ger butiker utan ort namnet på närmaste ort', () => {
    const orter = [
      { name: 'Långt bort', lat: 63.5, lon: 14.6 },
      { name: 'Byn', lat: 63.21, lon: 14.61 },
      { name: 'Grannbyn', lat: 63.25, lon: 14.6 },
    ];
    expect(fillFromPlaces([landsbygd], orter)[0].city).toBe('Byn');
  });

  it('rör inte butiker som redan har ort, och lämnar tomt när ingen ort finns inom räckhåll', () => {
    expect(fillFromPlaces([orminge], [{ name: 'Annat', lat: 59.327, lon: 18.25 }])[0].city).toBe('Saltsjö-Boo');
    expect(fillFromPlaces([landsbygd], [{ name: 'Långt bort', lat: 64.5, lon: 14.6 }])[0].city).toBeNull();
  });

  it('tar orten i butikens namn när den finns i närheten', () => {
    // Det riktiga fallet: "ICA Nära Byxelkrok" fick förut gården Mellby.
    const byxelkrok = { ...landsbygd, name: 'ICA Nära Byxelkrok', lat: 57.33, lon: 17.0 };
    const orter = [
      { name: 'Mellby', lat: 57.331, lon: 17.0, kind: 'hamlet' },
      { name: 'Byxelkrok', lat: 57.325, lon: 17.01, kind: 'village' },
    ];
    expect(fillFromPlaces([byxelkrok], orter)[0].city).toBe('Byxelkrok');
  });

  it('låter en större ort vinna över en gård alldeles intill', () => {
    // "ICA Kvantum Hovås" fick förut gården Stora Svindal.
    const orter = [
      { name: 'Gården', lat: 63.21, lon: 14.6, kind: 'hamlet' },       // ~1,1 km
      { name: 'Tätorten', lat: 63.23, lon: 14.6, kind: 'town' },       // ~3,3 km (/4 = 0,8)
    ];
    expect(fillFromPlaces([landsbygd], orter)[0].city).toBe('Tätorten');
  });

  it('hittar orter över en gradgräns i rutnätet', () => {
    const vidGräns = { ...landsbygd, lat: 62.999, lon: 14.999 };
    expect(fillFromPlaces([vidGräns], [{ name: 'Andra sidan', lat: 63.001, lon: 15.001 }])[0].city).toBe('Andra sidan');
  });
});

describe('refineUrbanLocality', () => {
  // Riktiga punkter ur OSM runt Sjövikshallen.
  const stadsdelar = [
    { name: 'Liljeholmen', lat: 59.3108, lon: 18.0266, kind: 'suburb' },   // ~0,5 km
    { name: 'Årsta', lat: 59.2995, lon: 18.0496, kind: 'suburb' },         // ~1,8 km
    { name: 'Långt borta', lat: 59.40, lon: 18.03, kind: 'suburb' },
    { name: 'Stockholm', lat: 59.3294, lon: 18.0686, kind: 'city' },       // ~3,4 km, stad väger 4
    { name: 'Sundbyberg', lat: 59.361, lon: 17.971, kind: 'town' },        // ~7 km, tätort väger 1,5
  ];
  const sjövik: SharedStoreRow = { osmId: 'node/459776346', name: 'ICA Supermarket Sjovikshallen', chain: 'ICA', street: null, postcode: null, city: null, lat: 59.3073, lon: 18.0297 };

  it('ger en butik utan ort närmaste stadsdel och staden — inte en postort från en grannbutik', () => {
    const ut = refineUrbanLocality([sjövik], stadsdelar);
    expect(ut[0].city).toBe('Liljeholmen, Stockholm');
    // Och den står kvar när grannlånet körs efteråt.
    expect(fillMissingCity([...ut, { ...orminge, city: 'Hägersten', lat: 59.31, lon: 18.03 }])[0].city).toBe('Liljeholmen, Stockholm');
  });

  it('sätter stadsdelen före storstaden, och båda går att söka på', () => {
    const iStan = refineUrbanLocality([{ ...sjövik, city: 'Stockholm', postalCity: 'Stockholm' }], stadsdelar);
    expect(iStan[0].city).toBe('Liljeholmen, Stockholm');
    expect(searchSharedStores(iStan, { q: 'ica liljeholmen' })).toHaveLength(1);
    expect(searchSharedStores(iStan, { q: 'ica stockholm' })).toHaveLength(1);
  });

  it('söker även på postorten när den skiljer sig från orten som visas', () => {
    const rad = { ...sjövik, city: 'Liljeholmen, Stockholm', postalCity: 'Hägersten' };
    expect(searchSharedStores([rad], { q: 'hägersten' })).toHaveLength(1);
  });

  it('föredrar stadsdelen framför kvarteret, och stadsdelen i butiksnamnet framför båda', () => {
    const med = [...stadsdelar, { name: 'Nybohov', lat: 59.3052, lon: 18.0211, kind: 'neighbourhood' }]; // ~0,5 km
    expect(refineUrbanLocality([sjövik], med)[0].city).toBe('Liljeholmen, Stockholm');
    expect(refineUrbanLocality([{ ...sjövik, name: 'ICA Nära Nybohov' }], med)[0].city).toBe('Nybohov, Stockholm');
    expect(refineUrbanLocality([{ ...sjövik, name: 'Coop Årsta' }], med)[0].city).toBe('Årsta, Stockholm');
  });

  it('rör inte orter utanför storstäderna, eller butiker utan stadsdel i närheten', () => {
    expect(refineUrbanLocality([orminge], stadsdelar)[0].city).toBe('Saltsjö-Boo');
    const avsides = { ...sjövik, lat: 63.2, lon: 14.6 };
    expect(refineUrbanLocality([avsides], stadsdelar)[0].city).toBeNull();
  });
});

describe('positionForPostcode', () => {
  it('använder exakt postnummer när det finns', () => {
    expect(positionForPostcode('132 30', alla)).toEqual({ lat: 59.327, lon: 18.25 });
  });

  it('faller tillbaka på de tre första siffrorna — samma område', () => {
    // Inget 13299, men 132xx finns: Orminge och Fisksätra.
    const p = positionForPostcode('13299', alla)!;
    expect(distanceKm(p, { lat: 59.31, lon: 18.25 })).toBeLessThan(5);
  });

  it('ger null för ogiltiga postnummer eller helt okända områden', () => {
    expect(positionForPostcode('abc', alla)).toBeNull();
    expect(positionForPostcode('98765', alla)).toBeNull();
  });
});
