// Snabblistan: hushållets egna snabbvaror, valda för hand i redigeringen av en
// vara. Aldrig inlärda — ett val kan inte glida ur synk med hur man handlar.
import { DEFAULT_CATEGORY_ORDER, type StapleItem } from '@veckis/shared';

export interface QuickListRow {
  staple: StapleItem;
  /** Står redan obockad på listan — läggs inte till en gång till. */
  onList: boolean;
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
