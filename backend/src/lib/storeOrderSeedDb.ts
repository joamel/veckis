import { StoreCategory } from '@prisma/client';
import { prisma } from '../db';
import { pickSeed, storeFormat, type SeedResult } from './storeOrderSeed';

/**
 * Startordning för en butik ur banken: andra hushålls sortering av samma
 * butik, annars av samma kedja och format, annars av samma kedja. Se
 * lib/storeOrderSeed.ts. null när underlaget inte räcker.
 */
export async function findOrderSeed(sharedStoreId: string, householdId: string): Promise<SeedResult | null> {
  const shared = await prisma.sharedStore.findUnique({ where: { id: sharedStoreId }, select: { id: true, name: true, chain: true } });
  if (!shared) return null;
  const others = await prisma.store.findMany({
    where: {
      householdId: { not: householdId },
      orderSource: 'custom',
      sharedStore: shared.chain ? { chain: shared.chain } : { id: shared.id },
    },
    select: { householdId: true, parentOrder: true, sharedStoreId: true, sharedStore: { select: { name: true, chain: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const candidate = (s: typeof others[number]) => ({ householdId: s.householdId, parentOrder: s.parentOrder });
  const format = storeFormat(shared.chain, shared.name);
  const levels: Parameters<typeof pickSeed>[0] = [
    { level: 'shared_store', label: shared.name, candidates: others.filter(s => s.sharedStoreId === shared.id).map(candidate) },
  ];
  // "ICA Maxi" är mer träffsäkert än "ICA" — men en butik som bara heter ICA
  // har inget eget format, och då är kedjan nästa nivå.
  if (format && format !== shared.chain) {
    levels.push({
      level: 'chain_format',
      label: format,
      candidates: others.filter(s => s.sharedStore && storeFormat(s.sharedStore.chain, s.sharedStore.name) === format).map(candidate),
    });
  }
  if (shared.chain) levels.push({ level: 'chain', label: shared.chain, candidates: others.map(candidate) });
  return pickSeed(levels, Object.values(StoreCategory) as StoreCategory[]);
}
