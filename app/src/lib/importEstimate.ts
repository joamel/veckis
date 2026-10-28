import { anyLink } from './extractUrl';

/**
 * Ungefär hur många sekunder AI-tolkningen av en import tar, så att
 * laddningstexterna byts i takt med den i stället för efter fasta tider —
 * förut stod "Nästan klart…" efter 7 s även när en veckomeny tog 25 s.
 *
 * Tiden styrs av hur mycket modellen ska skriva, och det följer textens längd:
 * en önskan ("frasiga våfflor") ~6 s, ett recept ~7–10 s. Långa texter med flera
 * recept tolkas sedan 2026-10-28 parallellt i backend: en Instagram-veckomeny med
 * fem recept tar ~8 s (förut ~28 s).
 * En länk vet vi inte längden på i förväg; Instagram-inlägg kan vara långa.
 */
export function estimateImportSeconds(kind: 'paste' | 'link', text: string): number {
  if (kind === 'link') return /instagram\.com|instagr\.am|threads\.net/i.test(anyLink(text) ?? text) ? 11 : 9;
  return Math.min(20, Math.max(6, Math.round(5 + text.trim().length / 400)));
}

/**
 * När laddningstexterna byts, i millisekunder: steg 1 och 2 under förväntad
 * tid, steg 3 ("tar längre än vanligt") först när tiden passerats ordentligt.
 */
export function importStageTimes(seconds: number): number[] {
  return [0.2, 0.7, 1.4].map(f => Math.round(f * seconds * 1000));
}
