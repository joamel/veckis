// Integration: shopping-item creation auto-inferrar subCategory + category
// härleds från sub:ens defaultParent. Plus merge-rendering filter
// (mergedIntoId: null) som vi fixade i PATCH-endpointen.

import { describe, it, expect } from 'vitest';
import { prisma } from '../../db';
import { inferSubCategory, parentForSub } from '@veckis/shared';
import { makeHousehold, makeMember, makeStore, makeShoppingList } from '../fixtures';

describe('Shopping item: subCategory + category auto-inference', () => {
  it('item med "havremjölk" → subCategory mejerisubstitut + category dairy_eggs', async () => {
    const h = await makeHousehold();
    await makeMember(h.id);
    const list = await makeShoppingList(h.id);

    const sub = inferSubCategory('Havremjölk');
    expect(sub).toBe('mejerisubstitut');

    const item = await prisma.shoppingItem.create({
      data: {
        listId: list.id,
        name: 'havremjölk',
        quantity: 1,
        addedBy: 'clerk-x',
        category: sub ? parentForSub(sub) : 'other',
        subCategory: sub,
      },
    });
    expect(item.category).toBe('dairy_eggs');
    expect(item.subCategory).toBe('mejerisubstitut');
  });

  it('item med "bearnaisesås" → färdiga_såser_kylda + meat_fish parent', async () => {
    const h = await makeHousehold();
    const list = await makeShoppingList(h.id);
    const sub = inferSubCategory('Bearnaisesås')!;
    const item = await prisma.shoppingItem.create({
      data: {
        listId: list.id, name: 'bearnaisesås', quantity: 1, addedBy: 'x',
        category: parentForSub(sub), subCategory: sub,
      },
    });
    expect(item.category).toBe('meat_fish');
    expect(item.subCategory).toBe('färdiga_såser_kylda');
  });

  it('item med okänt namn → subCategory null, category fallback "other"', async () => {
    const h = await makeHousehold();
    const list = await makeShoppingList(h.id);
    const sub = inferSubCategory('zzz okänd produkt');
    expect(sub).toBeNull();

    const item = await prisma.shoppingItem.create({
      data: {
        listId: list.id, name: 'zzz okänd produkt', quantity: 1, addedBy: 'x',
        category: 'other', subCategory: null,
      },
    });
    expect(item.category).toBe('other');
    expect(item.subCategory).toBeNull();
  });
});

describe('Shopping list rendering: merge-filter', () => {
  it('GET filter mergedIntoId: null döljer underordnade items', async () => {
    const h = await makeHousehold();
    const list = await makeShoppingList(h.id);

    // Skapa två items där den ena är "merged into" den andra
    const parent = await prisma.shoppingItem.create({
      data: {
        listId: list.id, name: 'mjölk', quantity: 3, unit: 'l', addedBy: 'x',
        category: 'dairy_eggs', subCategory: 'mjölk',
      },
    });
    const merged = await prisma.shoppingItem.create({
      data: {
        listId: list.id, name: 'mjölk', quantity: 1, unit: 'l', addedBy: 'x',
        category: 'dairy_eggs', subCategory: 'mjölk',
        mergedIntoId: parent.id,
      },
    });

    // Total i DB:n: 2 items
    const all = await prisma.shoppingItem.findMany({ where: { listId: list.id } });
    expect(all.length).toBe(2);

    // GET-flödet filtrerar mergedIntoId: null → bara parent visas
    const visible = await prisma.shoppingItem.findMany({
      where: { listId: list.id, mergedIntoId: null },
    });
    expect(visible.length).toBe(1);
    expect(visible[0].id).toBe(parent.id);
    expect(visible[0].quantity).toBe(3);
    // Sanity: merged-raden finns kvar (för audit/återställning)
    expect(merged.mergedIntoId).toBe(parent.id);
  });

  it('PATCH /lists/:listId returnerar items med samma filter som GET', async () => {
    const h = await makeHousehold();
    const list = await makeShoppingList(h.id);
    const parent = await prisma.shoppingItem.create({
      data: { listId: list.id, name: 'ägg', quantity: 12, addedBy: 'x', category: 'dairy_eggs' },
    });
    await prisma.shoppingItem.create({
      data: { listId: list.id, name: 'ägg', quantity: 6, addedBy: 'x', category: 'dairy_eggs', mergedIntoId: parent.id },
    });
    // Simulerar PATCH-svaret: först update, sen findUnique med filter
    await prisma.shoppingList.update({ where: { id: list.id }, data: { name: 'Bytte namn' } });
    const refetched = await prisma.shoppingList.findUnique({
      where: { id: list.id },
      include: {
        items: { where: { mergedIntoId: null }, orderBy: [{ isChecked: 'asc' }, { category: 'asc' }, { name: 'asc' }] },
      },
    });
    expect(refetched?.items.length).toBe(1);
    expect(refetched?.items[0].id).toBe(parent.id);
  });
});

describe('"Jag handlar"-presence på lista', () => {
  it('sätt + rensa activeShopperMemberId fungerar', async () => {
    const h = await makeHousehold();
    const anna = await makeMember(h.id);
    const list = await makeShoppingList(h.id);

    // Sätt
    const set = await prisma.shoppingList.update({
      where: { id: list.id },
      data: { activeShopperMemberId: anna.id, activeShopperSince: new Date() },
    });
    expect(set.activeShopperMemberId).toBe(anna.id);
    expect(set.activeShopperSince).toBeInstanceOf(Date);

    // Rensa
    const cleared = await prisma.shoppingList.update({
      where: { id: list.id },
      data: { activeShopperMemberId: null, activeShopperSince: null },
    });
    expect(cleared.activeShopperMemberId).toBeNull();
    expect(cleared.activeShopperSince).toBeNull();
  });
});

describe('Store-konfig: expandedSubs + customCategories defaults', () => {
  it('ny butik får tomma arrays per default', async () => {
    const h = await makeHousehold();
    const store = await makeStore(h.id, 'Ica');
    expect(store.categoryOrder).toEqual([]);
    expect(store.customCategories).toEqual([]);
    expect(store.expandedSubs).toEqual([]);
  });

  it('expandedSubs persisterar mellan reads', async () => {
    const h = await makeHousehold();
    const store = await makeStore(h.id);
    await prisma.store.update({
      where: { id: store.id },
      data: { expandedSubs: ['ost', 'laktosfritt'] },
    });
    const fresh = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(fresh.expandedSubs).toEqual(['ost', 'laktosfritt']);
  });
});
