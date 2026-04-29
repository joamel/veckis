import { PrismaClient } from '@prisma/client';

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
