// Snabblistan: hushållets egna snabbvaror, valda för hand i redigeringen av en
// vara. Aldrig inlärda — ett val kan inte glida ur synk med hur man handlar.
import { DEFAULT_CATEGORY_ORDER, type StapleItem } from '@veckis/shared';

export interface QuickListRow {
  staple: StapleItem;
  /** Står redan obockad på listan. Går ändå att välja (snabbvarans mängd
   *  läggs till ovanpå), men "Välj alla" hoppar över den. */
  onList: boolean;
}

/** Snabbvarans egen mängd. null/null = bara namnet. */
export interface QuickAmount { quickQuantity: number | null; quickUnit: string | null }

/** En rads mängd som snabbmängd. En rad utan enhet med mängden 1 är bara
 *  namnet — så ser en vara ut som lagts till utan mängd. */
export function amountOf(item: { quantity: number | null; unit: string | null }): QuickAmount {
  const unit = item.unit?.trim() || null;
  if (!unit && (item.quantity == null || item.quantity === 1)) return { quickQuantity: null, quickUnit: null };
  return { quickQuantity: item.quantity ?? 1, quickUnit: unit };
}

/** "1,5 l", "2", eller tom sträng när snabbvaran bara är namnet. */
export function quickAmountLabel(a: Partial<QuickAmount>): string {
  const qty = a.quickQuantity != null ? String(a.quickQuantity).replace('.', ',') : '';
  return [qty, a.quickUnit?.trim() ?? ''].filter(Boolean).join(' ');
}

type ListItem = { name: string; isChecked: boolean };

const key = (name: string) => name.trim().toLowerCase();

/** Basvaran bakom ett namn i listan, om hushållet har en. */
export function stapleForName(staples: StapleItem[], name: string): StapleItem | undefined {
  const k = key(name);
  return staples.find(s => key(s.name) === k);
}

/** Snabbvarorna i butiksordning (kategori, sedan namn), var och en markerad om
 *  den redan står obockad på listan. En avbockad rad räknas inte — den är
 *  handlad, och nästa vecka ska varan kunna läggas till igen. */
export function quickListRows(staples: StapleItem[], items: ListItem[]): QuickListRow[] {
  const open = new Set(items.filter(i => !i.isChecked).map(i => key(i.name)));
  const rank = (s: StapleItem) => {
    const i = DEFAULT_CATEGORY_ORDER.indexOf(s.category);
    return i < 0 ? DEFAULT_CATEGORY_ORDER.length : i;
  };
  return staples
    .filter(s => s.inQuickList)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'sv'))
    .map(staple => ({ staple, onList: open.has(key(staple.name)) }));
}

type BoughtItem = ListItem & { checkedAt?: string | null; recipeId?: string | null; menuItemId?: string | null };

/** Hur långt bak "just handlat" når när ingen "Jag handlar"-start finns. */
export const RECENT_PURCHASE_MS = 24 * 60 * 60 * 1000;

/** Kandidater till snabblistan: det som bockats av sedan `since`, utom det som
 *  kom från veckomenyn eller ett recept (dagens middag är ingen snabbvara) och
 *  det som redan är snabbvaror. En rad per namn, de oftast tillagda först —
 *  engångsköpen hamnar sist men tas aldrig bort, så en ny vana kan komma med. */
export function quickListCandidates(
  items: (BoughtItem & { quantity: number | null; unit: string | null })[],
  staples: StapleItem[],
  since: Date,
): (QuickAmount & { name: string })[] {
  const usage = new Map(staples.map(s => [key(s.name), s]));
  const seen = new Set<string>();
  const found: (QuickAmount & { name: string })[] = [];
  for (const i of items) {
    const k = key(i.name);
    if (!i.isChecked || !i.checkedAt || new Date(i.checkedAt) < since) continue;
    if (i.recipeId || i.menuItemId) continue;
    if (usage.get(k)?.inQuickList || seen.has(k)) continue;
    seen.add(k);
    // Mängden från det som handlades blir snabbvarans mängd.
    found.push({ name: i.name.trim(), ...amountOf(i) });
  }
  const count = (n: string) => usage.get(key(n))?.usageCount ?? 0;
  return found.sort((a, b) => count(b.name) - count(a.name) || a.name.localeCompare(b.name, 'sv'));
}
