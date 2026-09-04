import { PrismaClient } from '@prisma/client';

// Säkerhetsspärr — samma mönster som test/setup.ts. Utan den här kan
// db:seed råka skapa skräp-hushåll i produktion om DATABASE_URL av misstag
// pekar dit (hände 2026, se BACKLOG_AFTER_PROD.md).
const url = process.env.DATABASE_URL ?? '';
if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
  throw new Error(`db:seed pekar inte på en lokal databas — avbryter. DATABASE_URL="${url}"`);
}

const prisma = new PrismaClient();

async function main() {
  const household = await prisma.household.create({
    data: {
      name: 'Testfamiljen',
      members: {
        create: {
          clerkUserId: 'user_dev_placeholder',
          displayName: 'Dev User',
          role: 'admin',
        },
      },
      stores: {
        create: {
          name: 'ICA',
          categoryOrder: [
            'fruit_veg',
            'meat_fish',
            'dairy_eggs',
            'bread_bakery',
            'frozen',
            'canned_dry',
            'beverages',
            'cleaning',
            'other',
          ],
        },
      },
    },
  });

  console.log(`Seed klar. Hushåll: ${household.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
