import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { randomBytes } from 'crypto';

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
  res.json(household);
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
  const body = z.object({ displayName: z.string().min(1).max(100) }).safeParse(req.body);
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

  if (!isSelf && !isAdmin) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  const updated = await prisma.householdMember.update({
    where: { id: target.id },
    data: { displayName: body.data.displayName },
  });
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
  res.status(201).json(member);
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
  await prisma.householdMember.delete({ where: { id: target.id } });
  res.status(204).send();
}));
