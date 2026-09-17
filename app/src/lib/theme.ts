// Central färgpalett för Handlis — semantiska tokens med LIGHT + DARK.
//
// Historik: appen byggdes med Tailwind-indigo/violett, ersattes av en varm
// palett (salvia + beige + terrakotta). Mycket befintlig kod har fortfarande
// inline-hex; dark mode konverteras skärm för skärm att läsa dessa tokens via
// `useTheme()` i stället för hårdkodade hex.
//
// Dark-paletten är byggd på "Laga nu"-lägets gamla mörka färger (bg #1c1917,
// ljus text, salvia-grön accent) som användaren gillade.

export interface Palette {
  // Primär (salvia-grönt)
  primary: string; primary500: string; primary400: string; primary300: string;
  primary200: string; primary100: string; primaryTint: string;
  primaryDark: string; primaryDarker: string;
  // Knappyta. Egen nyckel eftersom `primary` bär två roller som drar åt varsitt
  // håll i mörkt läge: som FÖRGRUND (117 anrop: ikoner, länkar, etiketter) måste
  // den vara ljus mot den mörka ytan, som KNAPPBAKGRUND (26 anrop, med vit text)
  // måste den vara mörk. En enda ton kan inte göra båda — jämför `padYta` i
  // nyDesign.ts, som är samma problem för `skog`.
  primaryBtn: string;
  // Accent (terrakotta)
  accent: string; accent700: string; accentDark: string; accent400: string;
  accent300: string; accent200: string; accent100: string; accentTint: string;
  // Text + ytor
  text: string; textStrong: string; textSecondary: string; textMuted: string; textFaint: string;
  border: string; borderLight: string; surfaceSubtle: string; background: string; surface: string;
  // Fält (input/sök) — ljusare än surface i mörkt läge för kontrast mot korten
  inputBg: string;
  // Status
  success: string; successLight: string; danger: string; dangerDark: string; warning: string;
  // Status-ytor (banner-bakgrunder, delete-knappar) + text på dem
  dangerTint: string; dangerBorder: string; warningTint: string; warningText: string;
  // "Handlar nu"-indikator (rosa)
  pink: string; pinkTint: string;
}

export const light: Palette = {
  primary: '#4e7a5e', primary500: '#5d8a6d', primary400: '#7fa88d', primary300: '#a3c4ae',
  primary200: '#c6ddcd', primary100: '#e3eee5', primaryTint: '#ecf3ec',
  primaryDark: '#2f5340', primaryDarker: '#274434',
  // Samma ton som `primary` — ljust läge är oförändrat.
  primaryBtn: '#4e7a5e',
  accent: '#b96a45', accent700: '#a55a37', accentDark: '#8f4b2c', accent400: '#d29a77',
  accent300: '#e2bda1', accent200: '#eed7c5', accent100: '#f6e8dc', accentTint: '#faf1e9',
  text: '#292524', textStrong: '#1c1917', textSecondary: '#44403c', textMuted: '#78716c', textFaint: '#a8a29e',
  border: '#d6d3d1', borderLight: '#e7e5e4', surfaceSubtle: '#f1efec', background: '#faf8f3', surface: '#ffffff',
  inputBg: '#faf8f3',
  success: '#10b981', successLight: '#34d399', danger: '#ef4444', dangerDark: '#dc2626', warning: '#f59e0b',
  dangerTint: '#fef2f2', dangerBorder: '#fca5a5', warningTint: '#fef3c7', warningText: '#92400e',
  pink: '#db2777', pinkTint: '#fce7f3',
};

// Mörkt läge är skog & lime, inte en mörk version av den varma paletten.
//
// Den här paletten var tidigare varm och neutral (stengrå #1c1917/#292524,
// salviagrön primary). Det var rätt så länge appen var beige och salvia, men
// när den nya designen blev appens enda utseende hamnade de varma grå tonerna
// mitt i grönt — muddigt, och med för svag kontrast i modaler och popupar, där
// mest gammal palett fanns kvar. Ytorna ligger nu på samma värden som
// `nyMork` i nyDesign.ts, så det som ännu läser `c.*` landar rätt av sig självt
// i stället för att behöva skrivas om anrop för anrop.
//
// LJUSA paletten är orörd — den här filen byter bara vad mörkt läge betyder.
export const dark: Palette = {
  // `primary` är i första hand FÖRGRUND här (se primaryBtn i Palette).
  primary: '#b9d98a', primary500: '#a3c77a', primary400: '#7fa06a', primary300: '#5e8f72',
  primary200: '#43594a', primary100: '#35493c', primaryTint: '#2c3d33',
  primaryDark: '#cfe6b4', primaryDarker: '#e0f0cc',
  // Ljus nog att lyfta från kortet den ligger på, mörk nog för vit text (4,3:1).
  primaryBtn: '#4e7a5e',
  accent: '#d29a77', accent700: '#c58860', accentDark: '#e2bda1', accent400: '#b96a45',
  accent300: '#a55a37', accent200: '#8f4b2c', accent100: '#5a3826', accentTint: '#332721',
  text: '#e9f0e4', textStrong: '#ffffff', textSecondary: '#cfdcc9', textMuted: '#9bb09d', textFaint: '#849a86',
  // Samma trappa som nyMork — se kommentaren där om varför stegen är breda.
  border: '#43594a', borderLight: '#2c3d33', surfaceSubtle: '#2c3d33', background: '#0e1613', surface: '#22322a',
  // Inmatning ligger UNDER kortet den ligger på, så fältet läses som insänkt.
  inputBg: '#16231c',
  success: '#34d399', successLight: '#6ee7b7', danger: '#f87171', dangerDark: '#ef4444', warning: '#fbbf24',
  dangerTint: '#3f211f', dangerBorder: '#7f3f3f', warningTint: '#3a3320', warningText: '#fcd34d',
  pink: '#f472b6', pinkTint: '#3a2230',
};

export type ThemeScheme = 'light' | 'dark';

export function paletteFor(scheme: ThemeScheme): Palette {
  return scheme === 'dark' ? dark : light;
}

// Bakåtkompat: tidigare `colors`-export (light) — behålls tills all kod använder tokens.
export const colors = light;
