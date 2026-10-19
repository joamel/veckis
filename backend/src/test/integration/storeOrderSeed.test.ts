// Integration: en nyvald butik startar i den ordning andra hushåll sorterat
// liknande butiker (lib/storeOrderSeedDb.ts).

import { describe, expect, it } from 'vitest';
import { prisma } from '../../db';
import { makeHousehold } from '../fixtures';
import { findOrderSeed } from '../../lib/storeOrderSeedDb';

const BRÖD_FÖRST = ['bread_bakery', 'fruit_veg', 'meat_fish', 'deli_charcuterie', 'cheese', 'dairy_eggs', 'frozen', 'canned_dry', 'snacks_sweets', 'beverages', 'special_diet', 'cleaning', 'personal_care', 'baby_kids', 'other'];

let n = 0;
async function bank(name: string, chain: string | null) {
  return prisma.sharedStore.create({ data: { osmId: `node/seed-${n++}`, name, chain, lat: 59.3, lon: 18.0 } });
}
async function sorterad(sharedStoreId: string, order = BRÖD_FÖRST) {
  const h = await makeHousehold();
  return prisma.store.create({ data: { householdId: h.id, name: 'x', categoryOrder: [], parentOrder: order, orderSource: 'custom', sharedStoreId } });
}

describe('startordning för en ny butik', () => {
  it('hämtar från samma kedja och format när två hushåll sorterat', async () => {
    await sorterad((await bank('ICA Maxi Haninge', 'ICA')).id);
    await sorterad((await bank('ICA Maxi Lindhagen', 'ICA')).id);
    const ny = await bank('ICA Maxi Nacka', 'ICA');
    const seed = await findOrderSeed(ny.id, (await makeHousehold()).id);
    expect(seed?.level).toBe('chain_format');
    expect(seed?.label).toBe('ICA Maxi');
    expect(seed?.order[0]).toBe('bread_bakery');
  });

  it('tar samma butik före formatet', async () => {
    const butik = await bank('Stora Coop Bromma', 'Coop');
    await sorterad(butik.id);
    await sorterad(butik.id);
    const seed = await findOrderSeed(butik.id, (await makeHousehold()).id);
    expect(seed?.level).toBe('shared_store');
  });

  it('räknar inte osorterade butiker eller det egna hushållet', async () => {
    const butik = await bank('Willys Hemma Fridhemsplan', 'Willys');
    const egen = await makeHousehold();
    await prisma.store.create({ data: { householdId: egen.id, name: 'x', categoryOrder: [], parentOrder: BRÖD_FÖRST, orderSource: 'custom', sharedStoreId: (await bank('Willys Hemma Odenplan', 'Willys')).id } });
    const h = await makeHousehold();
    await prisma.store.create({ data: { householdId: h.id, name: 'x', categoryOrder: [], parentOrder: BRÖD_FÖRST, sharedStoreId: (await bank('Willys Hemma Hornstull', 'Willys')).id } });
    expect(await findOrderSeed(butik.id, egen.id)).toBeNull();
  });
});
