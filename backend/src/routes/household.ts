import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { randomBytes } from 'crypto';
import { wsBroadcast } from '../lib/wsHub';
import { sendPush } from '../lib/sendPush';

function broadcastHousehold(householdId: string, type: string, data: unknown) {
  wsBroadcast(`household:${householdId}`, { type, data });
}

export const householdRouter = Router();

const createSchema = z.object({ name: z.string().min(1).max(100), displayName: z.string().min(1).max(100).optional() });
const joinSchema = z.object({ code: z.string().length(8), displayName: z.string().min(1).max(100).optional() });

// POST /api/households
householdRouter.post('/', requireAuth, asyncHandler(async (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const household = await prisma.household.create({
    data: {
      name: body.data.name,
      members: {
        create: {
          clerkUserId: (req as AuthenticatedRequest).clerkUserId,
          displayName: body.data.displayName ?? 'Admin',
          role: 'admin',
        },
      },
    },
    include: { members: true },
  });
  res.status(201).json(household);
}));

// POST /api/households/join
householdRouter.post('/join', requireAuth, asyncHandler(async (req, res) => {
  const body = joinSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const invite = await prisma.inviteCode.findUnique({ where: { code: body.data.code } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invalid or expired invite code' });
    return;
  }

  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  const existing = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: invite.householdId, clerkUserId } },
  });
  if (existing) {
    res.status(409).json({ error: 'Already a member of this household' });
    return;
  }

  const [, member] = await prisma.$transaction([
    prisma.inviteCode.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedBy: clerkUserId },
    }),
    prisma.householdMember.create({
      data: {
        householdId: invite.householdId,
        clerkUserId,
        displayName: body.data.displayName ?? 'Member',
        role: 'member',
      },
    }),
  ]);
  res.status(201).json(member);

  // Notify existing members that someone joined (best-effort, after responding).
  const household = await prisma.household.findUnique({
    where: { id: invite.householdId },
    select: { name: true, members: { select: { clerkUserId: true } } },
  });
  const others = (household?.members ?? [])
    .map(m => m.clerkUserId)
    .filter((id): id is string => !!id && id !== clerkUserId);
  if (others.length > 0) {
    void sendPush(others, 'newMember', {
      title: 'Ny medlem i hushållet',
      body: `${member.displayName} gick med i ${household?.name ?? 'hushållet'}`,
      data: { type: 'newMember', householdId: invite.householdId },
    });
  }
}));

// GET /api/households/me — must be before /:householdId
householdRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const memberships = await prisma.householdMember.findMany({
    where: { clerkUserId: (req as AuthenticatedRequest).clerkUserId },
    include: { household: true },
  });
  res.json(memberships);
}));

// GET /api/households/:householdId
householdRouter.get('/:householdId', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const household = await prisma.household.findUnique({
    where: { id: req.params.householdId },
    include: { members: true, stores: true },
  });
  res.json(household);
}));

// PATCH /api/households/:householdId
householdRouter.patch('/:householdId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const body = z.object({ name: z.string().min(1).max(100) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const household = await prisma.household.update({
    where: { id: req.params.householdId },
    data: { name: body.data.name },
  });
  broadcastHousehold(household.id, 'household_updated', household);
  res.json(household);
}));

// DELETE /api/households/:householdId
householdRouter.delete('/:householdId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const existing = await prisma.household.findUnique({ where: { id: req.params.householdId } });
  if (!existing) { res.status(404).json({ error: 'Household not found' }); return; }
  await prisma.household.delete({ where: { id: req.params.householdId } });
  res.status(204).send();
}));

// POST /api/households/:householdId/invite
householdRouter.post('/:householdId/invite', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const code = randomBytes(4).toString('hex').toUpperCase();
  const invite = await prisma.inviteCode.create({
    data: {
      code,
      householdId: req.params.householdId,
      createdBy: (req as AuthenticatedRequest).clerkUserId,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  });
  res.status(201).json(invite);
}));

// PATCH /api/households/:householdId/members/:memberId
householdRouter.patch('/:householdId/members/:memberId', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    displayName: z.string().min(1).max(100).optional(),
    role: z.enum(['admin', 'member']).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const target = await prisma.householdMember.findUnique({ where: { id: req.params.memberId } });
  if (!target || target.householdId !== req.params.householdId) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: req.params.householdId, clerkUserId } },
  });
  const isAdmin = member?.role === 'admin';
  const isSelf = target.clerkUserId === clerkUserId;

  if (body.data.role !== undefined && !isAdmin) {
    res.status(403).json({ error: 'Only admins can change roles' });
    return;
  }
  if (body.data.displayName !== undefined && !isSelf && !isAdmin) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  const updated = await prisma.householdMember.update({
    where: { id: target.id },
    data: {
      ...(body.data.displayName !== undefined ? { displayName: body.data.displayName } : {}),
      ...(body.data.role !== undefined ? { role: body.data.role } : {}),
    },
  });
  broadcastHousehold(updated.householdId, 'member_updated', updated);
  res.json(updated);
}));

// POST /api/households/:householdId/members
householdRouter.post('/:householdId/members', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const body = z.object({ displayName: z.string().min(1).max(100) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const member = await prisma.householdMember.create({
    data: {
      householdId: req.params.householdId,
      displayName: body.data.displayName,
      role: 'member',
    },
  });
  broadcastHousehold(member.householdId, 'member_added', member);
  res.status(201).json(member);
}));

// GET /api/households/:householdId/members/:memberId/assignments
// Count chores + activities assigned to a member, for the removal warning.
householdRouter.get('/:householdId/members/:memberId/assignments', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const { householdId, memberId } = req.params;
  const [chores, activities] = await Promise.all([
    prisma.chore.count({
      where: { householdId, OR: [{ assignedTo: memberId }, { assignedToMany: { has: memberId } }] },
    }),
    prisma.scheduleEntry.count({
      where: { householdId, OR: [{ assignedTo: memberId }, { assignedToMany: { has: memberId } }] },
    }),
  ]);
  res.json({ chores, activities });
}));

// DELETE /api/households/:householdId/members/:memberId
householdRouter.delete('/:householdId/members/:memberId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const target = await prisma.householdMember.findUnique({ where: { id: req.params.memberId } });
  if (!target || target.householdId !== req.params.householdId) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  if (target.clerkUserId === (req as AuthenticatedRequest).clerkUserId) {
    res.status(400).json({ error: 'Cannot remove yourself' });
    return;
  }
  // Rensa medlemmen från alla assignedToMany-arrays innan vi raderar raden så
  // ingen syssla/aktivitet pekar på en död id. assignedTo nullas i en separat
  // sweep eftersom Prisma inte stödjer set-filter på enstaka fält.
  await prisma.$transaction(async (tx) => {
    const chores = await tx.chore.findMany({
      where: { householdId: target.householdId, assignedToMany: { has: target.id } },
      select: { id: true, assignedToMany: true },
    });
    for (const c of chores) {
      const next = c.assignedToMany.filter(id => id !== target.id);
      await tx.chore.update({
        where: { id: c.id },
        data: { assignedToMany: next, assignedTo: next[0] ?? null },
      });
    }
    const entries = await tx.scheduleEntry.findMany({
      where: { householdId: target.householdId, assignedToMany: { has: target.id } },
      select: { id: true, assignedToMany: true },
    });
    for (const e of entries) {
      const next = e.assignedToMany.filter(id => id !== target.id);
      await tx.scheduleEntry.update({
        where: { id: e.id },
        data: { assignedToMany: next, assignedTo: next[0] ?? null },
      });
    }
    // Legacy: chores/aktiviteter som bara hade single assignedTo = memberId
    await tx.chore.updateMany({
      where: { householdId: target.householdId, assignedTo: target.id },
      data: { assignedTo: null },
    });
    await tx.scheduleEntry.updateMany({
      where: { householdId: target.householdId, assignedTo: target.id },
      data: { assignedTo: null },
    });
    await tx.householdMember.delete({ where: { id: target.id } });
  });
  broadcastHousehold(target.householdId, 'member_deleted', { id: target.id });
  res.status(204).send();
}));
