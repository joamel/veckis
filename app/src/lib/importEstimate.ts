import { anyLink } from './extractUrl';

/**
 * Ungefär hur många sekunder AI-tolkningen av en import tar, så att
 * laddningstexterna byts i takt med den i stället för efter fasta tider —
 * förut stod "Nästan klart…" efter 7 s även när en veckomeny tog 25 s.
 *
 * Tiden styrs av hur mycket modellen ska skriva, och det följer textens längd:
 * en önskan ("frasiga våfflor") ~6 s, ett recept ~10 s, en Instagram-bildtext
 * med fem recept (~2 200 tecken) ~15–25 s inklistrad och ~30 s som länk
 * (Railway-loggen 2026-10-26, skärminspelning 2026-10-28).
 * En länk vet vi inte längden på i förväg; Instagram-inlägg kan vara långa.
 */
export function estimateImportSeconds(kind: 'paste' | 'link', text: string): number {
  if (kind === 'link') return /instagram\.com|instagr\.am|threads\.net/i.test(anyLink(text) ?? text) ? 30 : 9;
  return Math.min(40, Math.max(6, Math.round(5 + text.trim().length / 150)));
}

/**
 * När laddningstexterna byts, i millisekunder: steg 1 och 2 under förväntad
 * tid, steg 3 ("tar längre än vanligt") först när tiden passerats ordentligt.
 */
export function importStageTimes(seconds: number): number[] {
  return [0.2, 0.7, 1.4].map(f => Math.round(f * seconds * 1000));
}
