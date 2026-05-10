import { Router, Response } from 'express';
import { z } from 'zod';
import { ChoreFrequency, WeekDay, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

export const choresRouter = Router();

const createChoreSchema = z.object({
  householdId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  frequency: z.nativeEnum(ChoreFrequency).default('weekly'),
  assignedTo: z.string().nullable().optional(),
  days: z.array(z.nativeEnum(WeekDay)).default([]),
  isShared: z.boolean().default(true),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const updateChoreSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  frequency: z.nativeEnum(ChoreFrequency).optional(),
  assignedTo: z.string().nullable().optional(),
  days: z.array(z.nativeEnum(WeekDay)).optional(),
  isShared: z.boolean().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

async function getChoreAndVerifyMember(choreId: string, clerkUserId: string, res: Response) {
  const chore = await prisma.chore.findUnique({ where: { id: choreId } });
  if (!chore) {
    res.status(404).json({ error: 'Chore not found' });
    return null;
  }
  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: chore.householdId, clerkUserId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member of this household' });
    return null;
  }
  return chore;
}

// GET /api/chores?householdId=
choresRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { householdId } = req.query;
  if (typeof householdId !== 'string') { res.status(400).json({ error: 'Missing householdId' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  const chores = await prisma.chore.findMany({
    where: { householdId },
    include: {
      completions: { orderBy: { completedAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(chores);
}));

// POST /api/chores
choresRouter.post('/', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = createChoreSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const chore = await prisma.chore.create({
    data: { ...body.data, createdBy: (req as AuthenticatedRequest).clerkUserId } as Prisma.ChoreUncheckedCreateInput,
  });
  res.status(201).json(chore);
}));

// PATCH /api/chores/:choreId
choresRouter.patch('/:choreId', requireAuth, asyncHandler(async (req, res) => {
  const chore = await getChoreAndVerifyMember(req.params.choreId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!chore) return;

  const body = updateChoreSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const updated = await prisma.chore.update({ where: { id: chore.id }, data: body.data });
  res.json(updated);
}));

// DELETE /api/chores/:choreId
choresRouter.delete('/:choreId', requireAuth, asyncHandler(async (req, res) => {
  const chore = await getChoreAndVerifyMember(req.params.choreId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!chore) return;

  await prisma.chore.delete({ where: { id: chore.id } });
  res.status(204).send();
}));

// POST /api/chores/:choreId/complete
choresRouter.post('/:choreId/complete', requireAuth, asyncHandler(async (req, res) => {
  const chore = await getChoreAndVerifyMember(req.params.choreId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!chore) return;

  const body = z.object({
    note: z.string().optional(),
    day: z.nativeEnum(WeekDay).nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const completion = await prisma.choreCompletion.create({
    data: {
      choreId: chore.id,
      completedBy: (req as AuthenticatedRequest).clerkUserId,
      note: body.data.note,
      day: body.data.day ?? null,
    },
  });
  res.status(201).json(completion);
}));

// GET /api/chores/:choreId/completions
choresRouter.get('/:choreId/completions', requireAuth, asyncHandler(async (req, res) => {
  const chore = await getChoreAndVerifyMember(req.params.choreId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!chore) return;

  const completions = await prisma.choreCompletion.findMany({
    where: { choreId: chore.id },
    orderBy: { completedAt: 'desc' },
    take: 50,
  });
  res.json(completions);
}));

// DELETE /api/chores/:choreId/complete?day=mon  — undo completion within last 24h
choresRouter.delete('/:choreId/complete', requireAuth, asyncHandler(async (req, res) => {
  const chore = await getChoreAndVerifyMember(req.params.choreId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!chore) return;

  const dayRaw = req.query.day;
  const dayParse = typeof dayRaw === 'string' ? z.nativeEnum(WeekDay).safeParse(dayRaw) : null;
  const day = dayParse?.success ? dayParse.data : null;
  const cutoff = new Date(Date.now() - 86400000);

  await prisma.choreCompletion.deleteMany({
    where: { choreId: chore.id, day, completedAt: { gte: cutoff } },
  });
  res.status(204).send();
}));
