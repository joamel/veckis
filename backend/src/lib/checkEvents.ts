/**
 * Bockhändelser — råmaterialet för att lära sig i vilken ordning en butik
 * handlas (se "Listan lär sig butikens ordning" i BACKLOG_AFTER_PROD.md).
 *
 * Tre val som är svåra att ändra i efterhand, eftersom sparade händelser inte
 * går att komplettera:
 *
 *  - FINASTE nivån sparas: kategori OCH underkategori. Det går alltid att räkna
 *    upp till kategori, aldrig ned.
 *  - Händelsen knyts till butikens id, inte till hushållet, så handlingar kan
 *    räknas ihop i efterhand när butiken kopplas till en gemensam butik.
 *  - Personen sparas som en PSEUDONYM nyckel per person och butik — nog för att
 *    dela upp handlingar, men den pekar inte ut någon. HMAC med en hemlighet,
 *    så den inte går att räkna fram ur listan över användar-id:n.
 *
 * Tidpunkten är telefonens: offlinekön skickar bockar samlat när nätet kommer
 * tillbaka, och serverns klocka skulle då säga att allt bockades på en gång.
 */
import { createHmac } from 'node:crypto';
import { prisma } from '../db';

/** Hur långt från serverns klocka en telefons tidpunkt får ligga. */
const MAX_FRAMÅT_MS = 5 * 60 * 1000;
const MAX_BAKÅT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Telefonens tidpunkt om den är rimlig, annars serverns. Offlinekön kan
 * skicka en bock dagar efter att den gjordes, men inte veckor; och en klocka
 * som går före ska inte ge händelser i framtiden.
 */
export function checkTime(clientAt: string | undefined, now: Date): Date {
  if (!clientAt) return now;
  const t = new Date(clientAt);
  if (Number.isNaN(t.getTime())) return now;
  const diff = t.getTime() - now.getTime();
  if (diff > MAX_FRAMÅT_MS || diff < -MAX_BAKÅT_MS) return now;
  return t;
}

/** Pseudonym nyckel för en person i en butik. Samma person + butik → samma
 *  nyckel; samma person i en annan butik → en annan. */
export function shopperKey(clerkUserId: string, storeId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${clerkUserId}:${storeId}`).digest('hex').slice(0, 24);
}

/** Hemligheten för pseudonymerna. Egen variabel i första hand; annars Clerks
 *  hemliga nyckel, som alltid finns i drift och aldrig lämnar servern. */
export function pseudonymSecret(): string | null {
  return process.env.PSEUDONYM_SECRET || process.env.CLERK_SECRET_KEY || null;
}

/** Händelser äldre än så rensas bort. Ordningen i en butik ändras, och gamla
 *  handlingar ska inte väga in för evigt. */
export const CHECK_EVENT_MAX_AGE_DAYS = 180;

/** Sparar en bockhändelse. Anropas av bock-rutten efter svaret. */
export async function recordCheckEvent(
  storeId: string,
  clerkUserId: string,
  item: { category: string; subCategory: string | null; customCategory: string | null; customSubCategory: string | null },
  clientAt: string | undefined,
  bulk: boolean,
): Promise<void> {
  const secret = pseudonymSecret();
  if (!secret) return;
  const now = new Date();
  await prisma.shoppingCheckEvent.create({
    data: {
      storeId,
      shopperKey: shopperKey(clerkUserId, storeId, secret),
      category: item.category,
      subCategory: item.subCategory,
      customCategory: item.customCategory,
      customSubCategory: item.customSubCategory,
      checkedAt: checkTime(clientAt, now),
      bulk,
    },
  });
  // Rensa gamla händelser då och då, i stället för vid varje bock.
  if (Math.random() < 0.05) {
    const gräns = new Date(now.getTime() - CHECK_EVENT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    await prisma.shoppingCheckEvent.deleteMany({ where: { storeId, checkedAt: { lt: gräns } } });
  }
}
