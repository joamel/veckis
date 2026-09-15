// Den nya designen ("skog & lime") — bakom inställningen Ny design (beta).
//
// Egen, liten palett i stället för nya nycklar i Palette: designen testas vy
// för vy, och så länge den är beta ska den gamla paletten vara orörd. Bara
// ljust läge än så länge; mörkt läge får egna värden när designen är vald.

export const ny = {
  /** Sidhuvud, flikrad, rubriker, bildlösa recept. */
  skog: '#1d3b2e',
  /** Ytor ovanpå skog (bildlösa kort). */
  skogMellan: '#2c4a3b',
  /** Det man trycker på: filter, knappar, bockar. */
  lime: '#cde66b',
  /** Sidans botten. */
  bakgrund: '#eef1e8',
  /** Kort och rader. */
  kort: '#e2e9d8',
  /** Brickor och chips ovanpå kort. */
  bricka: '#d2dcc4',
  /** Bottenrader och små knappar ovanpå kort. */
  ljus: '#f8faf4',
  text: '#1d2a22',
  textDampad: '#6b7a6f',
  chipText: '#2c4a3b',
  kontur: '#b9c8ad',
  /** Text och ikoner på skog. */
  rubrikLjus: '#f1f3ec',
  underrubrik: '#9fbfa9',
  ikonLjus: '#b9cfc0',
  glas: 'rgba(255,255,255,0.12)',
  glasSvag: 'rgba(255,255,255,0.1)',
} as const;

/** Outfit laddas i rotlayouten (assets/fonts, OFL-licens). */
export const nyFont = {
  fet: 'Outfit_700Bold',
  halvfet: 'Outfit_600SemiBold',
} as const;
