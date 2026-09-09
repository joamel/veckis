/**
 * Platt-packar inköpslistan till en enda rad-array som en FlatList kan
 * virtualisera. Ligger utanför skärmkomponenten för att kunna testas: ordningen,
 * hopfällningen och taket på klart-högen är ren logik, och det är där felen
 * gömmer sig.
 *
 * Generisk över vara och grupp så testerna slipper hela Prisma-typen.
 */

export type ShoppingListRow<TItem, TGroup> =
  | { kind: 'catHeader'; key: string; catLabel: string; group: TGroup; label: string; collapsed: boolean }
  | { kind: 'checkedHeader'; key: string; catLabel: string; collapsed: boolean; count: number }
  | { kind: 'checkedSubLabel'; key: string; catLabel: string; label: string }
  | { kind: 'row'; key: string; catLabel: string; item: TItem; members: TItem[]; done: boolean }
  | { kind: 'showMore'; key: string; catLabel: string; remaining: number };

export interface BuildRowsParams<TItem, TGroup> {
  /** Grupper för de obockade varorna, i visningsordning. */
  activeGroups: TGroup[];
  /** Alla avbockade varor, i visningsordning. */
  checked: TItem[];
  /** Grupperar de avbockade varor som ryms under taket. */
  checkedGroupsFor: (items: TItem[]) => TGroup[];
  groupItems: (group: TGroup) => TItem[];
  groupKey: (group: TGroup) => string;
  groupLabel: (group: TGroup) => string;
  /** Slår ihop varor med samma namn+enhet till en rad med summerad mängd. */
  aggregate: (items: TItem[]) => Array<{ rep: TItem; quantity: number; members: TItem[] }>;
  itemId: (item: TItem) => string;
  /** Skapar radens visningsvara när flera slagits ihop (rep + summerad mängd). */
  withQuantity: (rep: TItem, quantity: number) => TItem;
  isCollapsed: (key: string) => boolean;
  checkedLabel: string;
  /** Hur många avbockade rader som får renderas. Höjs stegvis av "visa fler". */
  checkedLimit: number;
}

export function buildShoppingListRows<TItem, TGroup>(
  p: BuildRowsParams<TItem, TGroup>,
): Array<ShoppingListRow<TItem, TGroup>> {
  const rows: Array<ShoppingListRow<TItem, TGroup>> = [];

  const pushAggregated = (items: TItem[], catLabel: string, done: boolean) => {
    for (const g of p.aggregate(items)) {
      const single = g.members.length === 1;
      rows.push({
        kind: 'row',
        key: p.itemId(g.rep),
        catLabel,
        item: single ? g.rep : p.withQuantity(g.rep, g.quantity),
        members: g.members,
        done,
      });
    }
  };

  for (const group of p.activeGroups) {
    const key = p.groupKey(group);
    const label = p.groupLabel(group);
    const collapsed = p.isCollapsed(key);
    rows.push({ kind: 'catHeader', key: `h:${key}`, catLabel: label, group, label, collapsed });
    // Hopfälld grupp bidrar med rubriken men inga rader — det är hela poängen
    // med hopfällningen, både visuellt och för renderingskostnaden.
    if (!collapsed) pushAggregated(p.groupItems(group), label, false);
  }

  if (p.checked.length > 0) {
    const collapsed = p.isCollapsed('checked');
    rows.push({ kind: 'checkedHeader', key: 'h:checked', catLabel: p.checkedLabel, collapsed, count: p.checked.length });
    if (!collapsed) {
      const capped = p.checked.slice(0, p.checkedLimit);
      for (const group of p.checkedGroupsFor(capped)) {
        rows.push({ kind: 'checkedSubLabel', key: `cl:${p.groupKey(group)}`, catLabel: p.checkedLabel, label: p.groupLabel(group) });
        pushAggregated(p.groupItems(group), p.checkedLabel, true);
      }
      const remaining = p.checked.length - capped.length;
      if (remaining > 0) rows.push({ kind: 'showMore', key: 'show-more', catLabel: p.checkedLabel, remaining });
    }
  }

  return rows;
}
