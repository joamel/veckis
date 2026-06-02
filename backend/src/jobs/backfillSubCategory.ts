// Engångsjobb som backfillar ShoppingItem.subCategory via inferSubCategory på
// items där fältet är null. Körs vid backend-start (idempotent — befintliga
// subCategory-värden lämnas orörda). Migrerar även items med customCategory:
// försöker hitta en matchande sub via inferSubCategory på CustomCategory-namnet;
// vid lyckad match nollas customCategory och sätts subCategory.

import { prisma } from '../db';
import { inferSubCategory } from '@veckis/shared';

export async function backfillSubCategory(): Promise<{ items: number; customMigrated: number }> {
  const items = await prisma.shoppingItem.findMany({
    where: { subCategory: null },
    select: { id: true, name: true, customCategory: true },
    take: 5000, // safety cap; körs vid varje start tills allt är konverterat
  });

  let itemsUpdated = 0;
  let customMigrated = 0;
  for (const item of items) {
    // Försök matcha customCategory-strängen först — det är användarens manuella
    // val och innehåller mer information än bara varunamnet.
    let sub = item.customCategory ? inferSubCategory(item.customCategory) : null;
    if (!sub) sub = inferSubCategory(item.name);
    if (!sub) continue;

    await prisma.shoppingItem.update({
      where: { id: item.id },
      data: {
        subCategory: sub,
        // Rensa customCategory bara om vi lyckades härleda subCategory från
        // dess sträng (alltså konverterat det). Om vi hittade via namnet
        // istället låter vi customCategory ligga kvar tills användaren
        // antingen redigerar varan eller customCategory tas bort i schemat.
        ...(item.customCategory && inferSubCategory(item.customCategory) ? { customCategory: null } : {}),
      },
    });
    itemsUpdated++;
    if (item.customCategory && inferSubCategory(item.customCategory)) customMigrated++;
  }
  return { items: itemsUpdated, customMigrated };
}
