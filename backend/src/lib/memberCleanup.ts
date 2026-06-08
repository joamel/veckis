import { Prisma } from '@prisma/client';
import { prisma } from '../db';

/**
 * Rensar en medlem ur alla `assignedToMany`/`assignedTo` på hushållets chores +
 * scheduleEntries och raderar medlemsraden. Delad cascade-logik för leave,
 * admin-driven remove och Clerk `user.deleted`-webhooken. Körs inom `tx`.
 */
export async function cascadeRemoveMember(
  tx: Prisma.TransactionClient,
  householdId: string,
  memberId: string,
): Promise<void> {
  const chores = await tx.chore.findMany({
    where: { householdId, assignedToMany: { has: memberId } },
    select: { id: true, assignedToMany: true },
  });
  for (const c of chores) {
    const next = c.assignedToMany.filter(id => id !== memberId);
    await tx.chore.update({ where: { id: c.id }, data: { assignedToMany: next, assignedTo: next[0] ?? null } });
  }
  const entries = await tx.scheduleEntry.findMany({
    where: { householdId, assignedToMany: { has: memberId } },
    select: { id: true, assignedToMany: true },
  });
  for (const e of entries) {
    const next = e.assignedToMany.filter(id => id !== memberId);
    await tx.scheduleEntry.update({ where: { id: e.id }, data: { assignedToMany: next, assignedTo: next[0] ?? null } });
  }
  await tx.chore.updateMany({ where: { householdId, assignedTo: memberId }, data: { assignedTo: null } });
  await tx.scheduleEntry.updateMany({ where: { householdId, assignedTo: memberId }, data: { assignedTo: null } });
  await tx.householdMember.delete({ where: { id: memberId } });
}

/**
 * Hanterar att ett Clerk-konto raderats: tar bort användarens medlemskap i ALLA
 * hushåll (en clerkUserId kan vara med i flera). Om hen var ende admin i ett
 * hushåll och det finns andra medlemmar → befordra den äldsta till admin
 * (annars lämnas hushållet tomt för framtida städning). Returnerar de borttagna
 * medlemskapen så anroparen kan broadcasta `member_deleted`.
 */
export async function handleClerkUserDeleted(
  clerkUserId: string,
): Promise<{ householdId: string; memberId: string }[]> {
  const memberships = await prisma.householdMember.findMany({ where: { clerkUserId } });
  const removed: { householdId: string; memberId: string }[] = [];
  for (const m of memberships) {
    await prisma.$transaction(async (tx) => {
      if (m.role === 'admin') {
        const otherAdmins = await tx.householdMember.count({
          where: { householdId: m.householdId, role: 'admin', NOT: { id: m.id } },
        });
        if (otherAdmins === 0) {
          const heir = await tx.householdMember.findFirst({
            where: { householdId: m.householdId, NOT: { id: m.id } },
            orderBy: { joinedAt: 'asc' },
          });
          if (heir) await tx.householdMember.update({ where: { id: heir.id }, data: { role: 'admin' } });
        }
      }
      await cascadeRemoveMember(tx, m.householdId, m.id);
    });
    removed.push({ householdId: m.householdId, memberId: m.id });
  }
  return removed;
}
