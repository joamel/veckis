// Integration: när ett Clerk-konto raderas (user.deleted-webhook) ska
// handleClerkUserDeleted rensa medlemskap i alla hushåll, rensa assignedToMany,
// och befordra en ny admin om den raderade var ende admin.

import { describe, it, expect } from 'vitest';
import { prisma } from '../../db';
import { makeHousehold, makeMember, makeChore } from '../fixtures';
import { handleClerkUserDeleted } from '../../lib/memberCleanup';

describe('handleClerkUserDeleted', () => {
  it('tar bort medlemskapet och rensar id:t ur assignedToMany', async () => {
    const hh = await makeHousehold();
    const a = await makeMember(hh.id, { clerkUserId: 'clerk_del', role: 'member' });
    const b = await makeMember(hh.id, { role: 'admin' });
    const chore = await makeChore(hh.id, { assignedToMany: [a.id, b.id] });

    const removed = await handleClerkUserDeleted('clerk_del');

    expect(removed).toEqual([{ householdId: hh.id, memberId: a.id }]);
    expect(await prisma.householdMember.findUnique({ where: { id: a.id } })).toBeNull();
    const updated = await prisma.chore.findUnique({ where: { id: chore.id } });
    expect(updated?.assignedToMany).toEqual([b.id]);
    expect(updated?.assignedTo).toBe(b.id);
  });

  it('befordrar äldsta kvarvarande medlemmen när ende admin raderas', async () => {
    const hh = await makeHousehold();
    const admin = await makeMember(hh.id, { clerkUserId: 'clerk_admin', role: 'admin' });
    const other = await makeMember(hh.id, { role: 'member' });

    await handleClerkUserDeleted('clerk_admin');

    const heir = await prisma.householdMember.findUnique({ where: { id: other.id } });
    expect(heir?.role).toBe('admin');
    expect(await prisma.householdMember.findUnique({ where: { id: admin.id } })).toBeNull();
  });

  it('rensar medlemskap i ALLA hushåll för samma clerkUserId', async () => {
    const h1 = await makeHousehold('H1');
    const h2 = await makeHousehold('H2');
    const m1 = await makeMember(h1.id, { clerkUserId: 'clerk_multi', role: 'member' });
    await makeMember(h1.id, { role: 'admin' });
    const m2 = await makeMember(h2.id, { clerkUserId: 'clerk_multi', role: 'admin' });
    await makeMember(h2.id, { role: 'member' });

    const removed = await handleClerkUserDeleted('clerk_multi');

    expect(removed.map(r => r.memberId).sort()).toEqual([m1.id, m2.id].sort());
    expect(await prisma.householdMember.findUnique({ where: { id: m1.id } })).toBeNull();
    expect(await prisma.householdMember.findUnique({ where: { id: m2.id } })).toBeNull();
  });
});
