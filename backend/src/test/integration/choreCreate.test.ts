// Integration: chore create/update med assignedToMany + rotation. Säkerställer
// att DB-laget håller fälten i sync via syncAssignedTo-helpern och att
// rotation-beräkningen (computeCurrentTurn på completions.length) ger rätt
// turperson efter klarmarkeringar.

import { describe, it, expect } from 'vitest';
import { prisma } from '../../db';
import { syncAssignedTo } from '../../lib/assignedToSync';
import { computeCurrentTurn } from '../../lib/choreRotation';
import { makeHousehold, makeMember } from '../fixtures';

describe('Chore create/update med multi-assign + rotation', () => {
  it('syncAssignedTo speglar arrayen → singular vid create', async () => {
    const h = await makeHousehold();
    const anna = await makeMember(h.id);
    const bo = await makeMember(h.id);

    const synced = syncAssignedTo({ assignedToMany: [anna.id, bo.id] });
    const chore = await prisma.chore.create({
      data: {
        householdId: h.id,
        title: 'Diska',
        ...synced,
        rotation: true,
        isShared: true,
        createdBy: 'clerk-x',
        days: [],
        frequency: 'weekly',
      },
    });
    expect(chore.assignedToMany).toEqual([anna.id, bo.id]);
    expect(chore.assignedTo).toBe(anna.id); // sync: =[0]
    expect(chore.rotation).toBe(true);
  });

  it('syncAssignedTo håller fälten i sync vid update (many = source of truth)', async () => {
    const h = await makeHousehold();
    const anna = await makeMember(h.id);
    const bo = await makeMember(h.id);
    const c = await prisma.chore.create({
      data: {
        householdId: h.id, title: 'D', assignedTo: anna.id, assignedToMany: [anna.id],
        rotation: false, isShared: true, createdBy: 'x', days: [], frequency: 'weekly',
      },
    });

    const synced = syncAssignedTo({ assignedToMany: [bo.id, anna.id] }); // bytte ordning
    const updated = await prisma.chore.update({
      where: { id: c.id },
      data: synced,
    });
    expect(updated.assignedToMany).toEqual([bo.id, anna.id]);
    expect(updated.assignedTo).toBe(bo.id); // synkat till nya [0]
  });

  it('rotation-turn räknas korrekt från completions.length', async () => {
    const h = await makeHousehold();
    const anna = await makeMember(h.id);
    const bo = await makeMember(h.id);
    const carl = await makeMember(h.id);
    const chore = await prisma.chore.create({
      data: {
        householdId: h.id, title: 'Roterar', assignedTo: anna.id,
        assignedToMany: [anna.id, bo.id, carl.id], rotation: true,
        isShared: true, createdBy: 'x', days: [], frequency: 'weekly',
      },
      include: { completions: true },
    });

    // 0 completions → Annas tur
    expect(computeCurrentTurn(chore, chore.completions.length)).toBe(anna.id);

    // Anna klarade → 1 completion → Bos tur
    await prisma.choreCompletion.create({
      data: { choreId: chore.id, completedBy: 'clerk-anna', day: null, date: '2026-06-01' },
    });
    const after1 = await prisma.chore.findUniqueOrThrow({ where: { id: chore.id }, include: { completions: true } });
    expect(computeCurrentTurn(after1, after1.completions.length)).toBe(bo.id);

    // Bo klarade → Carls tur
    await prisma.choreCompletion.create({
      data: { choreId: chore.id, completedBy: 'clerk-bo', day: null, date: '2026-06-02' },
    });
    const after2 = await prisma.chore.findUniqueOrThrow({ where: { id: chore.id }, include: { completions: true } });
    expect(computeCurrentTurn(after2, after2.completions.length)).toBe(carl.id);

    // Carl klarade → tillbaka till Anna (wraps)
    await prisma.choreCompletion.create({
      data: { choreId: chore.id, completedBy: 'clerk-carl', day: null, date: '2026-06-03' },
    });
    const after3 = await prisma.chore.findUniqueOrThrow({ where: { id: chore.id }, include: { completions: true } });
    expect(computeCurrentTurn(after3, after3.completions.length)).toBe(anna.id);
  });

  it('rotation av → computeCurrentTurn returnerar null oavsett completions', async () => {
    const h = await makeHousehold();
    const anna = await makeMember(h.id);
    const bo = await makeMember(h.id);
    const chore = await prisma.chore.create({
      data: {
        householdId: h.id, title: 'Gemensamt', assignedTo: anna.id,
        assignedToMany: [anna.id, bo.id], rotation: false,
        isShared: true, createdBy: 'x', days: [], frequency: 'weekly',
      },
    });
    expect(computeCurrentTurn(chore, 0)).toBeNull();
    expect(computeCurrentTurn(chore, 5)).toBeNull();
  });

  it('borttagning av en chore cascade:ar dess completions', async () => {
    const h = await makeHousehold();
    const anna = await makeMember(h.id);
    const c = await prisma.chore.create({
      data: {
        householdId: h.id, title: 'T', assignedTo: anna.id, assignedToMany: [anna.id],
        rotation: false, isShared: true, createdBy: 'x', days: [], frequency: 'weekly',
      },
    });
    await prisma.choreCompletion.createMany({
      data: [
        { choreId: c.id, completedBy: 'clerk-anna', day: null, date: '2026-06-01' },
        { choreId: c.id, completedBy: 'clerk-anna', day: null, date: '2026-06-02' },
      ],
    });
    expect(await prisma.choreCompletion.count({ where: { choreId: c.id } })).toBe(2);

    await prisma.chore.delete({ where: { id: c.id } });
    expect(await prisma.choreCompletion.count({ where: { choreId: c.id } })).toBe(0);
  });
});
