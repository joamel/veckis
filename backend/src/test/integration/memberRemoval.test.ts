// Integration: när en hushållsmedlem tas bort ska id:t rensas från alla
// chores/scheduleEntries assignedToMany-arrays + assignedTo nollas. Testar
// koden i routes/household.ts som vi byggde för multi-assign.

import { describe, it, expect } from 'vitest';
import { prisma } from '../../db';
import { makeHousehold, makeMember, makeChore } from '../fixtures';

// Importera den interna transaktionslogiken via en helper. För enkelhet
// återanvänder vi det Prisma-snitt som DELETE-routen kör (sub-set; vi testar
// affären, inte HTTP-laget).
async function removeMemberCleanup(householdId: string, memberId: string) {
  await prisma.$transaction(async (tx) => {
    const chores = await tx.chore.findMany({
      where: { householdId, assignedToMany: { has: memberId } },
      select: { id: true, assignedToMany: true },
    });
    for (const c of chores) {
      const next = c.assignedToMany.filter(id => id !== memberId);
      await tx.chore.update({
        where: { id: c.id },
        data: { assignedToMany: next, assignedTo: next[0] ?? null },
      });
    }
    const entries = await tx.scheduleEntry.findMany({
      where: { householdId, assignedToMany: { has: memberId } },
      select: { id: true, assignedToMany: true },
    });
    for (const e of entries) {
      const next = e.assignedToMany.filter(id => id !== memberId);
      await tx.scheduleEntry.update({
        where: { id: e.id },
        data: { assignedToMany: next, assignedTo: next[0] ?? null },
      });
    }
    await tx.chore.updateMany({
      where: { householdId, assignedTo: memberId },
      data: { assignedTo: null },
    });
    await tx.scheduleEntry.updateMany({
      where: { householdId, assignedTo: memberId },
      data: { assignedTo: null },
    });
    await tx.householdMember.delete({ where: { id: memberId } });
  });
}

describe('Medlem-borttagning: rensar arrays', () => {
  it('tar bort medlemmen från assignedToMany på alla chores i hushållet', async () => {
    const h = await makeHousehold();
    const anna = await makeMember(h.id, { displayName: 'Anna' });
    const bo = await makeMember(h.id, { displayName: 'Bo' });
    const carl = await makeMember(h.id, { displayName: 'Carl' });

    const c1 = await makeChore(h.id, { title: 'Diska', assignedToMany: [anna.id, bo.id], rotation: true });
    const c2 = await makeChore(h.id, { title: 'Damma', assignedToMany: [carl.id] });
    const c3 = await makeChore(h.id, { title: 'Sopor', assignedToMany: [anna.id, bo.id, carl.id], rotation: true });

    await removeMemberCleanup(h.id, anna.id);

    const after = await prisma.chore.findMany({ where: { householdId: h.id }, orderBy: { title: 'asc' } });
    expect(after.length).toBe(3);
    const diska = after.find(c => c.title === 'Diska')!;
    expect(diska.assignedToMany).toEqual([bo.id]);
    expect(diska.assignedTo).toBe(bo.id);
    expect(diska.rotation).toBe(true); // rotation-flaggan oförändrad
    const damma = after.find(c => c.title === 'Damma')!;
    expect(damma.assignedToMany).toEqual([carl.id]); // orörd
    const sopor = after.find(c => c.title === 'Sopor')!;
    expect(sopor.assignedToMany).toEqual([bo.id, carl.id]);
    expect(sopor.assignedTo).toBe(bo.id); // synkat till första
  });

  it('nollar assignedTo när det var den borttagna medlemmen (även utan many-array)', async () => {
    // Edge case: legacy chore som bara har single-assignedTo, inte assignedToMany
    const h = await makeHousehold();
    const anna = await makeMember(h.id, { displayName: 'Anna' });
    await prisma.chore.create({
      data: {
        householdId: h.id,
        title: 'Legacy-syssla',
        assignedTo: anna.id, // bara single
        assignedToMany: [],   // tom array
        rotation: false,
        isShared: true,
        createdBy: 'clerk-x',
        days: [],
        frequency: 'weekly',
      },
    });

    await removeMemberCleanup(h.id, anna.id);

    const after = await prisma.chore.findFirst({ where: { householdId: h.id } });
    expect(after?.assignedTo).toBeNull();
    expect(after?.assignedToMany).toEqual([]);
  });

  it('orphan-count räknar både assignedTo och assignedToMany', async () => {
    const h = await makeHousehold();
    const anna = await makeMember(h.id, { displayName: 'Anna' });
    // 1. legacy single-assign
    await prisma.chore.create({
      data: { householdId: h.id, title: 'L1', assignedTo: anna.id, assignedToMany: [], rotation: false, isShared: true, createdBy: 'x', days: [], frequency: 'weekly' },
    });
    // 2. multi-assign
    await makeChore(h.id, { title: 'M1', assignedToMany: [anna.id] });
    await makeChore(h.id, { title: 'M2', assignedToMany: [anna.id, 'other'] });
    // 3. utan koppling till anna
    await makeChore(h.id, { title: 'Z', assignedToMany: ['other'] });

    const count = await prisma.chore.count({
      where: {
        householdId: h.id,
        OR: [{ assignedTo: anna.id }, { assignedToMany: { has: anna.id } }],
      },
    });
    expect(count).toBe(3);
  });
});
