import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { randomBytes } from 'crypto';

export const householdRouter = Router();

const createSchema = z.object({ name: z.string().min(1).max(100) });
const joinSchema = z.object({ code: z.string().length(8) });

// POST /api/households — create new household
householdRouter.post('/', requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const body = createSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  const household = await prisma.household.create({
    data: {
      name: body.data.name,
      members: {
        create: {
          clerkUserId: authReq.clerkUserId,
          displayName: req.body.displayName ?? 'Admin',
          role: 'admin',
        },
      },
    },
    include: { members: true },
  });

  res.status(201).json(household);
});

// POST /api/households/join — join via invite code
householdRouter.post('/join', requireAuth, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const body = joinSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  const invite = await prisma.inviteCode.findUnique({
    where: { code: body.data.code },
  });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invalid or expired invite code' });
    return;
  }

  const [, member] = await prisma.$transaction([
    prisma.inviteCode.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedBy: authReq.clerkUserId },
    }),
    prisma.householdMember.create({
      data: {
        householdId: invite.householdId,
        clerkUserId: authReq.clerkUserId,
        displayName: req.body.displayName ?? 'Member',
        role: 'member',
      },
    }),
  ]);

  res.status(201).json(member);
});

// POST /api/households/:householdId/invite — generate invite code
householdRouter.post(
  '/:householdId/invite',
  requireAuth,
  requireHouseholdMember,
  async (req, res) => {
    const { householdId } = req.params;
    const code = randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const invite = await prisma.inviteCode.create({
      data: {
        code,
        householdId,
        createdBy: (req as AuthenticatedRequest).clerkUserId,
        expiresAt,
      },
    });

    res.status(201).json(invite);
  },
);

// GET /api/households/:householdId — get household with members
householdRouter.get(
  '/:householdId',
  requireAuth,
  requireHouseholdMember,
  async (req, res) => {
    const household = await prisma.household.findUnique({
      where: { id: req.params.householdId },
      include: { members: true },
    });
    res.json(household);
  },
);
