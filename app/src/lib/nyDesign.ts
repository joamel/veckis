// Den nya designen ("skog & lime") — appens utseende, i ljust och mörkt läge.
//
// Egen, liten palett vid sidan av `Palette` i theme.ts: designen växte fram vy
// för vy och har egna namn för sina ytor. Nycklarna är desamma i båda lägena —
// `ny.skog` heter `ny.skog` överallt och pekar bara på olika hex beroende på
// läge, så inga anropsställen behöver skrivas om när temat byts.
//
// Mörkt läge är "djup skog": grönt hela vägen ner, nästan svart-grön botten,
// korten en snäpp ljusare, lime oförändrat som det man trycker på.
//
// OBS om ordningen: `ljus` betyder "ljusast av alla" i ljust läge (bottenrader
// och små knappar ovanpå korten) — i mörkt läge vänder betydelsen till
// UPPHÖJD yta, alltså ljusare än kortet. Samma roll, spegelvänd ton.

import type { ThemeScheme } from './theme';

export interface NyPalett {
  /** Sidhuvud, flikrad, rubriker, bildlösa recept. */
  skog: string;
  /** Ytor ovanpå skog (bildlösa kort). */
  skogMellan: string;
  /** Det man trycker på: filter, knappar, bockar. */
  lime: string;
  /** Sidans botten. */
  bakgrund: string;
  /** Kort och rader. */
  kort: string;
  /** Brickor och chips ovanpå kort. */
  bricka: string;
  /** Bottenrader och små knappar ovanpå kort. */
  ljus: string;
  /** Ljus platshållare för recept utan bild — egen ton, så den inte blir
   *  vit mot de ljusa korten. Bär även dagens ruta i veckomenyn. */
  platsLjus: string;
  /** Förgrund (ikoner, versala rubriker, bockar) PÅ kort och ljusa ytor.
   *  Var `skog` i ljust läge; i mörkt läge måste den vända till en ljus ton,
   *  annars försvinner den rakt in i bakgrunden. */
  padYta: string;
  /** Mörk knappyta ovanpå en LJUS platshållare (receptkortens hörnknapp). */
  hornMorkYta: string;
  /** Kompaktradens kalenderknapp: mörkgrön yta. */
  kalenderYta: string;
  /** Ikonen i kompaktradens kalenderknapp. Samma dämpade ljusgröna som
   *  sidhuvudets ikonknappar (ikonLjus) i ljust läge — lime mot mörkgrönt
   *  blev för intensivt i den täta listan, där knappen står på varje rad.
   *  I mörkt läge är lime kvar: den bär "tryckbart" där. */
  kalenderIkon: string;
  /** Vald/aktiv mörkgrön yta ovanpå ett kort (chips, ikonval). Var `skog` i
   *  ljust läge; i mörkt läge måste den LYFTA från kortet i stället för att
   *  sjunka in i det, annars syns det inte vad som är valt. */
  valdYta: string;
  /** Bandet under titeln på ett receptkort med bild. */
  bandOverlay: string;
  /** Den stora matikonen på en ljus platshållare. */
  ytIkon: string;
  /** Samma ikon på en mörk platshållare. */
  ytIkonMork: string;
  /** Destruktiva handlingar (Ta bort). */
  fara: string;
  faraYta: string;
  /** Destruktiv text på skog. `fara` är för mörk mot mörkgrönt och
   *  `faraYta` som knappbakgrund blev en skrikig ljusröd lapp. */
  faraLjus: string;
  text: string;
  textDampad: string;
  chipText: string;
  kontur: string;
  /** Text och ikoner på skog. */
  rubrikLjus: string;
  underrubrik: string;
  ikonLjus: string;
  /** Inaktiva flikar i den mörka flikraden. */
  flikInaktiv: string;
  /** Draghandtaget i arkens mörka huvud. */
  handtagSkog: string;
  glas: string;
  glasSvag: string;
}

export const nyLjus: NyPalett = {
  skog: '#1d3b2e',
  skogMellan: '#2c4a3b',
  lime: '#cde66b',
  bakgrund: '#eef1e8',
  kort: '#e2e9d8',
  bricka: '#d2dcc4',
  ljus: '#f8faf4',
  platsLjus: '#cddcb3',
  padYta: '#1d3b2e',
  hornMorkYta: '#1d3b2e',
  kalenderYta: '#1d3b2e',
  kalenderIkon: '#b9cfc0',
  valdYta: '#1d3b2e',
  bandOverlay: 'rgba(29,59,46,0.8)',
  ytIkon: 'rgba(29,59,46,0.16)',
  ytIkonMork: 'rgba(205,230,107,0.3)',
  fara: '#b3261e',
  faraYta: '#f8e1de',
  faraLjus: '#f2b8b5',
  text: '#1d2a22',
  textDampad: '#6b7a6f',
  chipText: '#2c4a3b',
  kontur: '#b9c8ad',
  rubrikLjus: '#f1f3ec',
  underrubrik: '#9fbfa9',
  ikonLjus: '#b9cfc0',
  flikInaktiv: '#8aa595',
  handtagSkog: 'rgba(255,255,255,0.3)',
  glas: 'rgba(255,255,255,0.12)',
  glasSvag: 'rgba(255,255,255,0.1)',
};

// Trappan mellan ytnivåerna måste vara BREDARE i mörkt läge än man tror.
//
// Första försöket lade nivåerna nära varandra (skog #17281f, kort #1b2a21,
// ljus #22332a) för att det såg balanserat ut i en palettabell. På skärm blev
// ett ark en enda platt grön yta: arkets mörka huvud gick inte att skilja från
// kroppen, inmatningsfält syntes inte mot kortet de låg på, och ramar försvann.
// Ögat läser skillnader i mörka toner sämre än i ljusa, så samma steg som
// räcker i ljust läge är för litet här. Nivåerna nedan ligger längre isär, och
// ordningen bakgrund < skog < kort < ljus < bricka < kontur gäller genomgående.
export const nyMork: NyPalett = {
  skog: '#15231b',
  skogMellan: '#26402f',
  lime: '#cde66b',
  bakgrund: '#0e1613',
  kort: '#22322a',
  bricka: '#35493c',
  ljus: '#2c3d33',
  platsLjus: '#33503c',
  padYta: '#b9d98a',
  hornMorkYta: '#0e1613',
  kalenderYta: '#15231b',
  kalenderIkon: '#cde66b',
  valdYta: '#46705a',
  bandOverlay: 'rgba(8,14,10,0.8)',
  ytIkon: 'rgba(205,230,107,0.22)',
  ytIkonMork: 'rgba(205,230,107,0.3)',
  fara: '#f2b8b5',
  faraYta: '#3f211f',
  faraLjus: '#f2b8b5',
  text: '#e9f0e4',
  // Lyft mot det ljusare kortet — #93a795 låg på 4,3:1 mot den nya ytan.
  textDampad: '#9bb09d',
  chipText: '#c2de96',
  // Ramar måste synas mot BÅDE kort och ljus, därför ett rejält steg över dem.
  kontur: '#43594a',
  rubrikLjus: '#f1f3ec',
  underrubrik: '#8fae99',
  ikonLjus: '#b9cfc0',
  flikInaktiv: '#7e9a88',
  handtagSkog: 'rgba(255,255,255,0.3)',
  // Genomskinligt vitt lyser upp mer mot en mörk yta — dämpa det något.
  glas: 'rgba(255,255,255,0.08)',
  glasSvag: 'rgba(255,255,255,0.06)',
};

export function nyFor(scheme: ThemeScheme): NyPalett {
  return scheme === 'dark' ? nyMork : nyLjus;
}


/** Outfit laddas i rotlayouten (assets/fonts, OFL-licens). */
export const nyFont = {
  fet: 'Outfit_700Bold',
  halvfet: 'Outfit_600SemiBold',
} as const;
