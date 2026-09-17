/**
 * Amerikanska/brittiska mått som scraping/import kan känna igen och spara
 * RÅTT (t.ex. "1/2 cup" sparas som quantity 0.5, unit "cup") — vi rör inte
 * källans siffror vid import, det ska gå att lita på att receptet stämmer
 * mot originalet. Konvertering till svenska/metriska enheter är i stället
 * ett explicit val användaren gör i UI:t (en liten "↔"-knapp), aldrig något
 * som händer tyst i bakgrunden och aldrig ett nytt värde i enhets-väljaren.
 *
 * Faktorer är avrundade till köksvänliga tumregler (1 cup ≈ 2,4 dl osv.),
 * inte labbprecisa — det är vad receptkonvertering i praktiken alltid är.
 */
export const UNIT_CONVERSIONS: Record<string, { factor: number; unit: string }> = {
  cup: { factor: 2.4, unit: 'dl' },
  cups: { factor: 2.4, unit: 'dl' },
  tbsp: { factor: 1, unit: 'msk' },
  tablespoon: { factor: 1, unit: 'msk' },
  tablespoons: { factor: 1, unit: 'msk' },
  tsp: { factor: 1, unit: 'tsk' },
  teaspoon: { factor: 1, unit: 'tsk' },
  teaspoons: { factor: 1, unit: 'tsk' },
  oz: { factor: 28.35, unit: 'g' },
  ounce: { factor: 28.35, unit: 'g' },
  ounces: { factor: 28.35, unit: 'g' },
  lb: { factor: 453.6, unit: 'g' },
  lbs: { factor: 453.6, unit: 'g' },
  pound: { factor: 453.6, unit: 'g' },
  pounds: { factor: 453.6, unit: 'g' },
  pint: { factor: 4.73, unit: 'dl' },
  pints: { factor: 4.73, unit: 'dl' },
  quart: { factor: 9.46, unit: 'dl' },
  quarts: { factor: 9.46, unit: 'dl' },
  gallon: { factor: 3.79, unit: 'l' },
  gallons: { factor: 3.79, unit: 'l' },
  stick: { factor: 113, unit: 'g' }, // amerikansk smörstång ("1 stick butter")
  sticks: { factor: 113, unit: 'g' },
  clove: { factor: 1, unit: 'klyfta' },
  cloves: { factor: 1, unit: 'klyfta' },
  pinch: { factor: 1, unit: 'nypa' },
  dash: { factor: 1, unit: 'nypa' },
  can: { factor: 1, unit: 'burk' },
  cans: { factor: 1, unit: 'burk' },
  package: { factor: 1, unit: 'paket' },
  packages: { factor: 1, unit: 'paket' },
  slice: { factor: 1, unit: 'skiva' },
  slices: { factor: 1, unit: 'skivor' },
};

/** True om enheten är icke-metrisk/icke-svensk och kan erbjudas konvertering. */
export function isConvertibleUnit(unit: string | null | undefined): boolean {
  return !!unit && unit.toLowerCase() in UNIT_CONVERSIONS;
}

/** Byter till större enhet vid runda tal (1000 g → 1 kg, 10 dl → 1 l) och
 *  avrundar till en köksvänlig precision. */
function normalizeMetric(value: number, unit: string): { quantity: number; unit: string } {
  let v = value;
  let u = unit;
  if (u === 'g' && v >= 1000) { v /= 1000; u = 'kg'; }
  if (u === 'dl' && v >= 10) { v /= 10; u = 'l'; }
  const rounded = u === 'g' ? Math.round(v) : Math.round(v * 10) / 10;
  return { quantity: rounded, unit: u };
}

/**
 * Konverterar en mängd+enhet till svenska/metriska. Returnerar null om
 * enheten inte är konverterbar (eller quantity saknas) — anroparen ska då
 * inte visa en konverteringsknapp alls.
 */
export function convertToMetric(quantity: number | null, unit: string | null): { quantity: number; unit: string } | null {
  if (quantity == null || !unit) return null;
  const conversion = UNIT_CONVERSIONS[unit.toLowerCase()];
  if (!conversion) return null;
  // Faktor 1 är bara ett enhetsbyte (tbsp→msk, clove→klyfta) — ingen
  // uträkning skedde, så mängden ska förbli exakt, inte avrundas.
  if (conversion.factor === 1) return { quantity, unit: conversion.unit };
  return normalizeMetric(quantity * conversion.factor, conversion.unit);
}
