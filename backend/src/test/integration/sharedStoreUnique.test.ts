// Integration: en butik ur butiksbanken finns högst en gång per hushåll.

import { describe, expect, it } from 'vitest';
import { prisma } from '../../db';
import { makeHousehold } from '../fixtures';

async function bankbutik(osmId: string) {
  return prisma.sharedStore.create({ data: { osmId, name: 'Stora Coop Orminge', lat: 59.3, lon: 18.2 } });
}
async function butik(householdId: string, sharedStoreId: string | null, name = 'Coop') {
  return prisma.store.create({ data: { householdId, name, categoryOrder: [], sharedStoreId } });
}

describe('en bankbutik per hushåll', () => {
  it('stoppar en andra koppling till samma bankbutik i samma hushåll', async () => {
    const h = await makeHousehold();
    const bank = await bankbutik('way/unik-1');
    await butik(h.id, bank.id);
    await expect(butik(h.id, bank.id, 'Coop igen')).rejects.toThrow();
  });

  it('tillåter samma bankbutik i olika hushåll — det är hela poängen', async () => {
    const bank = await bankbutik('way/unik-2');
    await butik((await makeHousehold()).id, bank.id);
    await expect(butik((await makeHousehold()).id, bank.id)).resolves.toBeTruthy();
  });

  it('påverkar inte egna butiker utan koppling', async () => {
    const h = await makeHousehold();
    await butik(h.id, null, 'Egen 1');
    await expect(butik(h.id, null, 'Egen 2')).resolves.toBeTruthy();
  });
});
