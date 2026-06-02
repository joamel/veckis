// Test-fixtures: minimala factory-funktioner för att snabbt skapa hushåll +
// medlemmar + relaterade entiteter i tester. Alla helpers använder den
// delade prisma-klienten (= test-DB:n via setup.ts).

import { prisma } from '../db';

let counter = 0;
const uid = (prefix: string) => `${prefix}-${++counter}-${Date.now()}`;

export async function makeHousehold(name = 'Test-hushåll') {
  return prisma.household.create({ data: { name } });
}

export async function makeMember(
  householdId: string,
  opts: { displayName?: string; clerkUserId?: string | null; role?: 'admin' | 'member' } = {},
) {
  return prisma.householdMember.create({
    data: {
      householdId,
      displayName: opts.displayName ?? `Medlem ${counter + 1}`,
      clerkUserId: opts.clerkUserId === undefined ? uid('clerk') : opts.clerkUserId,
      role: opts.role ?? 'member',
    },
  });
}

export async function makeChore(
  householdId: string,
  opts: {
    title?: string;
    assignedToMany?: string[];
    rotation?: boolean;
    isShared?: boolean;
    createdBy?: string;
  } = {},
) {
  const assignedToMany = opts.assignedToMany ?? [];
  return prisma.chore.create({
    data: {
      householdId,
      title: opts.title ?? 'Testsyssla',
      assignedToMany,
      assignedTo: assignedToMany[0] ?? null,
      rotation: opts.rotation ?? false,
      isShared: opts.isShared ?? true,
      createdBy: opts.createdBy ?? uid('clerk'),
      days: [],
      frequency: 'weekly',
    },
  });
}

export async function makeStore(householdId: string, name = 'Testbutik') {
  return prisma.store.create({
    data: { householdId, name, categoryOrder: [], customCategories: [], expandedSubs: [] },
  });
}

export async function makeShoppingList(
  householdId: string,
  opts: { name?: string; createdBy?: string; storeId?: string | null } = {},
) {
  return prisma.shoppingList.create({
    data: {
      householdId,
      name: opts.name ?? 'Testlista',
      createdBy: opts.createdBy ?? uid('clerk'),
      storeId: opts.storeId ?? null,
    },
  });
}
