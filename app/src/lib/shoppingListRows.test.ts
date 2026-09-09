import { describe, it, expect } from 'vitest';
import { buildShoppingListRows, type ShoppingListRow } from './shoppingListRows';

type Item = { id: string; name: string; unit: string | null; quantity: number | null };
type Group = { key: string; label: string; items: Item[] };

const item = (id: string, name = id, unit: string | null = null, quantity: number | null = 1): Item =>
  ({ id, name, unit, quantity });

function build(over: Partial<Parameters<typeof buildShoppingListRows<Item, Group>>[0]> = {}) {
  return buildShoppingListRows<Item, Group>({
    activeGroups: [],
    checked: [],
    checkedGroupsFor: items => (items.length ? [{ key: 'done', label: 'Klart-grupp', items }] : []),
    groupItems: g => g.items,
    groupKey: g => g.key,
    groupLabel: g => g.label,
    aggregate: items => {
      const map = new Map<string, { rep: Item; quantity: number; members: Item[] }>();
      for (const it of items) {
        const k = `${it.name}|${it.unit ?? ''}`;
        const g = map.get(k);
        if (g) { g.quantity += it.quantity ?? 1; g.members.push(it); }
        else map.set(k, { rep: it, quantity: it.quantity ?? 1, members: [it] });
      }
      return [...map.values()];
    },
    itemId: i => i.id,
    withQuantity: (rep, quantity) => ({ ...rep, quantity }),
    isCollapsed: () => false,
    checkedLabel: 'Klart',
    checkedLimit: 50,
    ...over,
  });
}

const kinds = (rows: Array<ShoppingListRow<Item, Group>>) => rows.map(r => r.kind);

describe('buildShoppingListRows', () => {
  it('lägger en rubrik före varje grupps rader', () => {
    const rows = build({
      activeGroups: [
        { key: 'frukt', label: 'Frukt', items: [item('a'), item('b')] },
        { key: 'mejeri', label: 'Mejeri', items: [item('c')] },
      ],
    });
    expect(kinds(rows)).toEqual(['catHeader', 'row', 'row', 'catHeader', 'row']);
  });

  it('hopfälld grupp bidrar med rubriken men inga rader', () => {
    const rows = build({
      activeGroups: [{ key: 'frukt', label: 'Frukt', items: [item('a'), item('b')] }],
      isCollapsed: key => key === 'frukt',
    });
    expect(kinds(rows)).toEqual(['catHeader']);
    expect(rows[0]).toMatchObject({ collapsed: true });
  });

  it('slår ihop samma namn+enhet till en rad med summerad mängd', () => {
    const rows = build({
      activeGroups: [{ key: 'frukt', label: 'Frukt', items: [item('a', 'Äpple', 'st', 2), item('b', 'Äpple', 'st', 3)] }],
    });
    const row = rows.find(r => r.kind === 'row');
    expect(row).toMatchObject({ kind: 'row', item: { quantity: 5 } });
    expect(row && 'members' in row && row.members).toHaveLength(2);
  });

  it('hopfälld klart-sektion visar antalet men inga rader', () => {
    const rows = build({
      checked: [item('x'), item('y')],
      isCollapsed: key => key === 'checked',
    });
    expect(kinds(rows)).toEqual(['checkedHeader']);
    expect(rows[0]).toMatchObject({ collapsed: true, count: 2 });
  });

  it('taket begränsar antalet avbockade rader och lägger till visa-fler', () => {
    const checked = Array.from({ length: 12 }, (_, i) => item(`c${i}`, `Vara ${i}`));
    const rows = build({ checked, checkedLimit: 5 });
    expect(rows.filter(r => r.kind === 'row')).toHaveLength(5);
    const more = rows.find(r => r.kind === 'showMore');
    expect(more).toMatchObject({ kind: 'showMore', remaining: 7 });
  });

  it('ingen visa-fler-rad när taket rymmer allt', () => {
    const rows = build({ checked: [item('x'), item('y')], checkedLimit: 50 });
    expect(rows.some(r => r.kind === 'showMore')).toBe(false);
  });

  it('varje rad bär sin kategorietikett — sticky-rubriken läser den', () => {
    const rows = build({
      activeGroups: [{ key: 'frukt', label: 'Frukt', items: [item('a')] }],
      checked: [item('x')],
    });
    expect(rows.map(r => r.catLabel)).toEqual(['Frukt', 'Frukt', 'Klart', 'Klart', 'Klart']);
  });

  it('nycklarna är unika — FlatList kräver det', () => {
    const rows = build({
      activeGroups: [
        { key: 'frukt', label: 'Frukt', items: [item('a')] },
        { key: 'mejeri', label: 'Mejeri', items: [item('b')] },
      ],
      checked: [item('x')],
    });
    const keys = rows.map(r => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('tom lista ger inga rader alls', () => {
    expect(build()).toEqual([]);
  });
});
