// Integration: bockhändelser sparas med rätt fält, utan personuppgifter, och
// försvinner med butiken.

import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../db';
import { makeHousehold, makeStore } from '../fixtures';
import { recordCheckEvent, shopperKey } from '../../lib/checkEvents';

beforeAll(() => {
  process.env.PSEUDONYM_SECRET = 'test-hemlighet';
});

const mjölk = { category: 'dairy_eggs', subCategory: 'mjölk', customCategory: null, customSubCategory: null };

describe('recordCheckEvent', () => {
  it('sparar kategori, underkategori, telefonens tidpunkt och en pseudonym', async () => {
    const h = await makeHousehold();
    const store = await makeStore(h.id);

    await recordCheckEvent(store.id, 'clerk_anna', mjölk, new Date(Date.now() - 60_000).toISOString(), false);

    const [e] = await prisma.shoppingCheckEvent.findMany({ where: { storeId: store.id } });
    expect(e.category).toBe('dairy_eggs');
    expect(e.subCategory).toBe('mjölk');
    expect(e.bulk).toBe(false);
    expect(Date.now() - e.checkedAt.getTime()).toBeGreaterThanOrEqual(59_000);
    expect(e.shopperKey).toBe(shopperKey('clerk_anna', store.id, 'test-hemlighet'));
    // Inget användar-id någonstans i raden.
    expect(JSON.stringify(e)).not.toContain('clerk_anna');
  });

  it('märker massbockar, så de inte räknas som en väg genom butiken', async () => {
    const h = await makeHousehold();
    const store = await makeStore(h.id);
    await recordCheckEvent(store.id, 'clerk_anna', mjölk, undefined, true);
    const [e] = await prisma.shoppingCheckEvent.findMany({ where: { storeId: store.id } });
    expect(e.bulk).toBe(true);
  });

  it('sparar egna kategorier som de är', async () => {
    const h = await makeHousehold();
    const store = await makeStore(h.id);
    await recordCheckEvent(store.id, 'clerk_anna',
      { category: 'other', subCategory: null, customCategory: 'Hundmat', customSubCategory: 'Torrfoder' }, undefined, false);
    const [e] = await prisma.shoppingCheckEvent.findMany({ where: { storeId: store.id } });
    expect(e.customCategory).toBe('Hundmat');
    expect(e.customSubCategory).toBe('Torrfoder');
  });

  it('händelserna försvinner när butiken tas bort', async () => {
    const h = await makeHousehold();
    const store = await makeStore(h.id);
    await recordCheckEvent(store.id, 'clerk_anna', mjölk, undefined, false);
    await prisma.store.delete({ where: { id: store.id } });
    expect(await prisma.shoppingCheckEvent.count({ where: { storeId: store.id } })).toBe(0);
  });
});
