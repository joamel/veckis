/**
 * Månadstak för fototolkning, per användare.
 *
 * Kostnadslarmet i aiCost.ts skyddar notan, men larmar först EFTER att pengarna
 * är spenderade. Hinner någon fota in en hel kokbok står alla andra utan
 * funktionen tills månaden är slut. Taket gör att en enskild användare inte kan
 * förstöra för resten.
 *
 * Räknas per Clerk-användare, inte per hushåll: from-photo-routen får inget
 * hushålls-id — receptet skapas i ett separat anrop efteråt.
 */

import { prisma } from '../db';

/**
 * Foton per användare och månad. 50 räcker med god marginal för normal
 * användning — den som lägger in 50 recept från foto på en månad är redan en
 * ovanligt flitig användare — men stoppar den som systematiskt fotar av en hel
 * kokbok.
 */
export const MAX_FOTON_PER_MANAD = 50;

const månadsnyckel = () => new Date().toISOString().slice(0, 7);

export interface KvotSvar {
  tillåtet: boolean;
  kvar: number;
}

/**
 * Räknar upp och svarar om anropet får göras. Räknar upp FÖRE anropet: annars
 * kan ett misslyckat men dyrt anrop upprepas fritt.
 *
 * Vid databasfel släpps anropet igenom — en trasig kvoträknare ska inte stänga
 * av funktionen för alla. Kostnadslarmet fångar ändå om notan drar iväg.
 */
export async function taFotokvot(clerkUserId: string): Promise<KvotSvar> {
  const month = månadsnyckel();
  try {
    const rad = await prisma.photoQuota.upsert({
      where: { clerkUserId_month: { clerkUserId, month } },
      create: { clerkUserId, month, count: 1 },
      update: { count: { increment: 1 } },
    });
    return {
      tillåtet: rad.count <= MAX_FOTON_PER_MANAD,
      kvar: Math.max(0, MAX_FOTON_PER_MANAD - rad.count),
    };
  } catch (err) {
    console.error('Kunde inte räkna fotokvot:', err instanceof Error ? err.message : err);
    return { tillåtet: true, kvar: MAX_FOTON_PER_MANAD };
  }
}
