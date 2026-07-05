// Vitest setup: laddar .env.test innan test-modulerna importeras så att den
// delade Prisma-klienten i `src/db.ts` plockar upp test-DB-URL:n. Resetar
// tabellerna mellan varje test så att tester inte läcker state.
//
// Tester som bara använder rena helpers (utan DB) är oberörda — setup:n
// rör inget om prisma inte används.

import { beforeAll, beforeEach, afterAll } from 'vitest';
import { config } from 'dotenv';
import path from 'path';

// Ladda .env.test FÖRST så att process.env.DATABASE_URL är test-DB:n när
// src/db.ts senare importeras av testfilerna.
config({ path: path.resolve(__dirname, '../../.env.test') });

// Lazy import — först efter env är laddad.
let prisma: typeof import('../db').prisma | null = null;
async function getPrisma() {
  if (!prisma) {
    const mod = await import('../db');
    prisma = mod.prisma;
  }
  return prisma!;
}

beforeAll(async () => {
  // Verifiera att vi pekar på test-DB:n (säkerhetsspärr — vill inte råka
  // truncate:a dev-DB:n).
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('veckis_test')) {
    throw new Error(`Test setup pekar inte på veckis_test — avbryter. DATABASE_URL="${url}"`);
  }
  // Ping för att etablera connection.
  const p = await getPrisma();
  await p.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  const p = await getPrisma();
  // TRUNCATE alla tabeller i en svep med CASCADE för att respektera FKs.
  // Behåller schemat — bara raderar data. Snabbare än att köra om migrations.
  await p.$executeRawUnsafe(`
    TRUNCATE TABLE
      "ChoreCompletion",
      "Chore",
      "ShoppingItem",
      "ShoppingList",
      "Store",
      "WeekMenuItem",
      "MenuTemplateItem",
      "MenuTemplate",
      "RecipeIngredient",
      "Recipe",
      "ScheduleEntry",
      "StapleItem",
      "IngredientAlias",
      "UnitEquivalence",
      "PushToken",
      "NotificationPreference",
      "NotificationLog",
      "InviteCode",
      "HouseholdMember",
      "Household"
    RESTART IDENTITY CASCADE
  `);
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});
