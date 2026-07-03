// Central färgpalett för Veckis — "varm" tema (salvia + beige + terrakotta).
//
// Historik: appen byggdes med Tailwind-indigo/violett på kalla grå. Den här
// paletten ersatte den (feature/warm-theme). Befintlig kod har fortfarande
// inline-hex (mekaniskt konverterade via sök/ersätt enligt mappningen nedan);
// NY kod ska importera tokens härifrån istället för att hårdkoda hex.
//
// Mappning gammal → ny (för framtida arkeologi):
//   indigo  #4f46e5→primary   #eef2ff→primaryTint   #818cf8→primary400 …
//   violett #7c3aed→accent    #f5f3ff→accentTint …
//   kallgrå #111827→text      #6b7280→textMuted     #f9fafb→background …

export const colors = {
  // Primär (salvia-grönt) — knappar, länkar, aktiva tillstånd
  primary:       '#4e7a5e', // ersätter indigo-600 #4f46e5
  primary500:    '#5d8a6d', // ersätter indigo-500 #6366f1
  primary400:    '#7fa88d', // ersätter indigo-400 #818cf8
  primary300:    '#a3c4ae', // ersätter indigo-300 #a5b4fc
  primary200:    '#c6ddcd', // ersätter indigo-200 #c7d2fe
  primary100:    '#e3eee5', // ersätter indigo-100 #e0e7ff
  primaryTint:   '#ecf3ec', // ersätter indigo-50  #eef2ff — chips, ghost-knappar
  primaryDark:   '#2f5340', // ersätter indigo-800 #3730a3
  primaryDarker: '#274434', // ersätter indigo-900 #312e81

  // Accent (terrakotta) — sekundära markeringar, ikoner, kategorirubriker
  accent:        '#b96a45', // ersätter violet-600 #7c3aed
  accent700:     '#a55a37', // ersätter violet-700 #6d28d9
  accentDark:    '#8f4b2c', // ersätter violet-800 #5b21b6
  accent400:     '#d29a77', // ersätter violet-400 #a78bfa
  accent300:     '#e2bda1', // ersätter violet-300 #c4b5fd
  accent200:     '#eed7c5', // ersätter violet-200 #ddd6fe
  accent100:     '#f6e8dc', // ersätter violet-100 #ede9fe
  accentTint:    '#faf1e9', // ersätter violet-50  #f5f3ff

  // Varma gråtoner (stone) — text, kanter, bakgrunder
  text:          '#292524', // ersätter gray-900 #111827
  textStrong:    '#1c1917', // ersätter slate-900 #0f172a
  textSecondary: '#44403c', // ersätter gray-700 #374151
  textMuted:     '#78716c', // ersätter gray-500 #6b7280
  textFaint:     '#a8a29e', // ersätter gray-400 #9ca3af
  border:        '#d6d3d1', // ersätter gray-300 #d1d5db
  borderLight:   '#e7e5e4', // ersätter gray-200 #e5e7eb
  surfaceSubtle: '#f1efec', // ersätter gray-100 #f3f4f6
  background:    '#faf8f3', // ersätter gray-50  #f9fafb — varm krämvit
  surface:       '#ffffff',

  // Status — behålls från gamla paletten (fungerar mot varm bas)
  success:       '#10b981',
  successLight:  '#34d399',
  danger:        '#ef4444',
  dangerDark:    '#dc2626',
  warning:       '#f59e0b',
} as const;
