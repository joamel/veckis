// Pure helpers for planning how an incoming batch of ingredients should be
// merged into an existing shopping list. Splits the work into two phases:
//   1) planIncomingMatch  — match each incoming ingredient against existing
//      rows. Same menuItemId match wins. Otherwise fall back to a same
//      name+unit match against unbound items.
//   2) planAutoMerge      — after creates and updates, find groups of visible
//      items sharing name+unit and propose soft-merge containers.
//
// "Unit" comparison is case-insensitive and trimmed. Name comparison uses the
// `normalize` callback (defaults to identity) so callers can pass a stripper.

export interface IncomingIngredient {
  name: string;
  unit: string | null;
  quantity: number | null;
  menuItemId?: string | null;
  category?: string;
}

export interface ExistingItem {
  id: string;
  name: string;
  unit: string | null;
  quantity: number;
  menuItemId: string | null;
  mergedIntoId: string | null;
  isChecked: boolean;
  category: string;
  /**
   * True when at least one other item points to this row via mergedIntoId.
   * Containers are synthetic aggregates: bumping their qty without adding
   * a child orphans the contribution. The unbound-fallback in
   * `planIncomingMatch` must skip containers.
   */
  hasChildren?: boolean;
}

export interface MatchPlan {
  /** Existing rows to bump quantity (and maybe canonicalize name) on. */
  toUpdate: Array<{ id: string; quantity: number; name: string }>;
  /** Incoming ingredients with no match — must be created fresh. */
  toCreate: IncomingIngredient[];
}

export interface MergeGroup {
  ids: string[];
  totalQty: number;
  name: string;
  unit: string | null;
  category: string;
}

function keyOf(name: string, unit: string | null, normalize: (s: string) => string): string {
  return `${normalize(name)}|${(unit ?? '').toLowerCase().trim()}`;
}

/**
 * Decide what to update vs create from an incoming batch.
 * Rules:
 * - existing items with `mergedIntoId` or `isChecked` are ignored.
 * - An incoming with menuItemId X first looks for an existing with menuItemId X
 *   sharing the same name+unit (additive within the same rätt).
 * - If no menuItemId match, fall back to an unbound (menuItemId === null) item
 *   with the same name+unit. This is how a recipe imported once and again with
 *   different rätter still collapses to a single visible row before phase 2.
 * - Without menuItemId we only ever merge with another unbound item.
 */
export function planIncomingMatch(
  incoming: IncomingIngredient[],
  existing: ExistingItem[],
  normalize: (s: string) => string = (s) => s.toLowerCase().trim(),
): MatchPlan {
  const active = existing.filter(e => !e.mergedIntoId && !e.isChecked);
  const byMenuItem = new Map<string, ExistingItem>(); // `${name|unit}|${menuItemId}`
  const byNameUnit = new Map<string, ExistingItem>(); // unbound, non-container only
  for (const e of active) {
    const k = keyOf(e.name, e.unit, normalize);
    if (e.menuItemId) byMenuItem.set(`${k}|${e.menuItemId}`, e);
    // Skip containers: bumping their qty silently orphans the contribution
    // because containers have no menuItemId of their own (their children do).
    else if (!e.hasChildren) byNameUnit.set(k, e);
  }

  const toUpdate: MatchPlan['toUpdate'] = [];
  const toCreate: IncomingIngredient[] = [];
  // Track in-batch growth on the same existing row so two incoming rows pointing
  // at the same existing don't both reset its quantity.
  const updatedQtyById = new Map<string, number>();

  function applyUpdate(id: string, addQty: number, name: string) {
    const current = updatedQtyById.get(id) ?? (active.find(e => e.id === id)!.quantity);
    const next = current + addQty;
    updatedQtyById.set(id, next);
    const existingEntry = toUpdate.find(u => u.id === id);
    if (existingEntry) { existingEntry.quantity = next; existingEntry.name = name; }
    else toUpdate.push({ id, quantity: next, name });
  }

  for (const ing of incoming) {
    const k = keyOf(ing.name, ing.unit, normalize);
    const qty = ing.quantity ?? 1;
    if (ing.menuItemId) {
      const m = byMenuItem.get(`${k}|${ing.menuItemId}`);
      if (m) { applyUpdate(m.id, qty, ing.name); continue; }
      const fallback = byNameUnit.get(k);
      if (fallback) { applyUpdate(fallback.id, qty, ing.name); continue; }
      toCreate.push(ing);
    } else {
      const m = byNameUnit.get(k);
      if (m) { applyUpdate(m.id, qty, ing.name); continue; }
      toCreate.push(ing);
    }
  }

  return { toUpdate, toCreate };
}

/**
 * After creates/updates have landed, find groups of visible items that share
 * name+unit. Each group with ≥2 entries should be wrapped in a soft-merge
 * container so the list stays clean.
 */
export function planAutoMerge(
  visibleItems: ExistingItem[],
  normalize: (s: string) => string = (s) => s.toLowerCase().trim(),
): MergeGroup[] {
  const groups = new Map<string, ExistingItem[]>();
  for (const v of visibleItems) {
    if (v.mergedIntoId || v.isChecked) continue;
    const k = keyOf(v.name, v.unit, normalize);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(v);
  }
  const out: MergeGroup[] = [];
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    out.push({
      ids: group.map(g => g.id),
      totalQty: group.reduce((sum, g) => sum + g.quantity, 0),
      name: group[0].name,
      unit: group[0].unit,
      category: group[0].category,
    });
  }
  return out;
}
