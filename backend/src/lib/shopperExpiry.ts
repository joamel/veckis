import { prisma } from '../db';
import { wsBroadcast } from './wsHub';

const EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 timmar
const TICK_MS = 15 * 60 * 1000;       // kontrollera var 15:e minut

async function expireStaleShoppers(): Promise<void> {
  const cutoff = new Date(Date.now() - EXPIRY_MS);
  const stale = await prisma.shoppingList.findMany({
    where: {
      activeShopperMemberId: { not: null },
      activeShopperSince: { lt: cutoff },
    },
    select: { id: true, householdId: true },
  });
  if (stale.length === 0) return;

  await prisma.shoppingList.updateMany({
    where: { id: { in: stale.map(l => l.id) } },
    data: { activeShopperMemberId: null, activeShopperSince: null },
  });

  for (const list of stale) {
    const payload = { type: 'shopping_presence', data: { listId: list.id, memberId: null, since: null } };
    wsBroadcast(`household:${list.householdId}`, payload);
    wsBroadcast(list.id, payload);
  }
  console.log(`[shopperExpiry] rensade ${stale.length} inaktiva handlar-presence`);
}

export function startShopperExpiry(): void {
  void expireStaleShoppers();
  setInterval(() => { void expireStaleShoppers(); }, TICK_MS);
}
