// Central färgpalett för Veckis — semantiska tokens med LIGHT + DARK.
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
  accent: '#b96a45', accent700: '#a55a37', accentDark: '#8f4b2c', accent400: '#d29a77',
  accent300: '#e2bda1', accent200: '#eed7c5', accent100: '#f6e8dc', accentTint: '#faf1e9',
  text: '#292524', textStrong: '#1c1917', textSecondary: '#44403c', textMuted: '#78716c', textFaint: '#a8a29e',
  border: '#d6d3d1', borderLight: '#e7e5e4', surfaceSubtle: '#f1efec', background: '#faf8f3', surface: '#ffffff',
  inputBg: '#faf8f3',
  success: '#10b981', successLight: '#34d399', danger: '#ef4444', dangerDark: '#dc2626', warning: '#f59e0b',
  dangerTint: '#fef2f2', dangerBorder: '#fca5a5', warningTint: '#fef3c7', warningText: '#92400e',
  pink: '#db2777', pinkTint: '#fce7f3',
};

export const dark: Palette = {
  // Grönt lyfts något så det syns mot mörk bakgrund
  primary: '#7fa88d', primary500: '#6d9a7d', primary400: '#5d8a6d', primary300: '#4e7a5e',
  primary200: '#3f6650', primary100: '#2f5340', primaryTint: '#2b3a31',
  primaryDark: '#a3c4ae', primaryDarker: '#c6ddcd',
  accent: '#d29a77', accent700: '#c58860', accentDark: '#e2bda1', accent400: '#b96a45',
  accent300: '#a55a37', accent200: '#8f4b2c', accent100: '#5a3826', accentTint: '#332721',
  text: '#f1efec', textStrong: '#ffffff', textSecondary: '#e7e5e4', textMuted: '#a8a29e', textFaint: '#78716c',
  border: '#57534e', borderLight: '#3a3431', surfaceSubtle: '#2b2724', background: '#1c1917', surface: '#292524',
  inputBg: '#3a3431',
  success: '#34d399', successLight: '#6ee7b7', danger: '#f87171', dangerDark: '#ef4444', warning: '#fbbf24',
  dangerTint: '#3a2523', dangerBorder: '#7f3f3f', warningTint: '#3a3320', warningText: '#fcd34d',
  pink: '#f472b6', pinkTint: '#3a2230',
};

export type ThemeScheme = 'light' | 'dark';

export function paletteFor(scheme: ThemeScheme): Palette {
  return scheme === 'dark' ? dark : light;
}

// Bakåtkompat: tidigare `colors`-export (light) — behålls tills all kod använder tokens.
export const colors = light;
