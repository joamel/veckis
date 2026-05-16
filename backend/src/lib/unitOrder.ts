// Unit magnitude ordering and conversion to a common base (ml or g).
// When merging same-name ingredients with different units we want the
// "largest" reasonable unit to be chosen, with the quantity converted.

export const VOLUME_TO_ML: Record<string, number> = {
  krm: 1,
  tsk: 5,
  msk: 15,
  cl: 10,
  dl: 100,
  ml: 1,
  l: 1000,
};

export const MASS_TO_G: Record<string, number> = {
  g: 1,
  kg: 1000,
};

const VOLUME_UNITS = Object.keys(VOLUME_TO_ML);
const MASS_UNITS = Object.keys(MASS_TO_G);

function family(unit: string): 'volume' | 'mass' | 'other' {
  const u = unit.toLowerCase().trim();
  if (VOLUME_UNITS.includes(u)) return 'volume';
  if (MASS_UNITS.includes(u)) return 'mass';
  return 'other';
}

/**
 * Given a list of {quantity, unit} entries, sum them by their magnitude family.
 * Returns a single {quantity, unit} expressed in the largest unit that still
 * keeps quantity >= 1 (so 1500 ml → 1.5 l, but 50 ml → 50 ml, not 0.05 l).
 *
 * If units are incompatible (mixed families or "other"), returns null and the
 * caller should keep them as separate entries.
 */
export function combineQuantities(
  entries: Array<{ quantity: number; unit: string | null | undefined }>,
): { quantity: number; unit: string } | null {
  if (entries.length === 0) return null;
  const families = new Set(entries.map(e => e.unit ? family(e.unit) : 'other'));
  if (families.size > 1 || families.has('other')) return null;

  const fam = [...families][0];
  if (fam === 'volume') {
    const ml = entries.reduce((sum, e) => sum + e.quantity * (VOLUME_TO_ML[e.unit!.toLowerCase()] ?? 1), 0);
    if (ml >= 1000) return { quantity: round(ml / 1000), unit: 'l' };
    if (ml >= 500) return { quantity: 0.5, unit: 'l' };
    if (ml >= 100) return { quantity: round(ml / 100), unit: 'dl' };
    if (ml >= 15) return { quantity: round(ml / 15), unit: 'msk' };
    if (ml >= 5) return { quantity: round(ml / 5), unit: 'tsk' };
    if (ml >= 1) return { quantity: round(ml), unit: 'ml' };
    return { quantity: round(ml), unit: 'krm' };
  }
  if (fam === 'mass') {
    const g = entries.reduce((sum, e) => sum + e.quantity * (MASS_TO_G[e.unit!.toLowerCase()] ?? 1), 0);
    if (g >= 1000) return { quantity: round(g / 1000), unit: 'kg' };
    if (g >= 500) return { quantity: 0.5, unit: 'kg' };
    return { quantity: round(g), unit: 'g' };
  }
  return null;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
