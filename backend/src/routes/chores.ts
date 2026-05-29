import { Router, Response } from 'express';
import { z } from 'zod';
import { ChoreFrequency, WeekDay, RecurrenceType, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { wsBroadcast } from '../lib/wsHub';
import { actorName } from '../lib/actor';

export const choresRouter = Router();

const recurrenceFields = {
  recurrenceType: z.nativeEnum(RecurrenceType).optional(),
  recurrenceWeeks: z.number().int().min(1).max(52).optional(),
  monthlyType: z.enum(['day_of_month', 'weekday_of_month']).optional(),
  recurrenceWeekOfMonth: z.number().int().min(1).max(5).nullable().optional(),
};

const createChoreSchema = z.object({
  householdId: z.string(),
  title: z.string().min(1).max(200),
  emoji: z.string().max(8).nullable().optional(),
  description: z.string().optional(),
  frequency: z.nativeEnum(ChoreFrequency).default('weekly'),
  assignedTo: z.string().nullable().optional(),
  days: z.array(z.nativeEnum(WeekDay)).default([]),
  isShared: z.boolean().default(true),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ...recurrenceFields,
});

const updateChoreSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  emoji: z.string().max(8).nullable().optional(),
  description: z.string().nullable().optional(),
  frequency: z.nativeEnum(ChoreFrequency).optional(),
  assignedTo: z.string().nullable().optional(),
  days: z.array(z.nativeEnum(WeekDay)).optional(),
  isShared: z.boolean().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  ...recurrenceFields,
});

// Keep legacy frequency in sync with recurrenceType so older clients still work.
function deriveFrequency(rt: RecurrenceType | undefined, weeks: number | undefined): ChoreFrequency | undefined {
  if (!rt) return undefined;
  if (rt === 'none') return 'once';
  if (rt === 'daily') return 'daily';
  if (rt === 'weekly' || rt === 'custom_days') return (weeks ?? 1) >= 2 ? 'biweekly' : 'weekly';
  if (rt === 'monthly') return 'monthly';
  if (rt === 'yearly') return 'monthly';
  return undefined;
}

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

  const derivedFreq = deriveFrequency(body.data.recurrenceType, body.data.recurrenceWeeks);
  const chore = await prisma.chore.create({
    data: {
      ...body.data,
      frequency: derivedFreq ?? body.data.frequency,
      createdBy: (req as AuthenticatedRequest).clerkUserId,
    } as Prisma.ChoreUncheckedCreateInput,
  });
  wsBroadcast(`household:${chore.householdId}`, { type: 'chore_added', data: { ...chore, completions: [] } });
  res.status(201).json(chore);
}));

// PATCH /api/chores/:choreId
choresRouter.patch('/:choreId', requireAuth, asyncHandler(async (req, res) => {
  const chore = await getChoreAndVerifyMember(req.params.choreId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!chore) return;

  const body = updateChoreSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const derivedFreq = deriveFrequency(body.data.recurrenceType, body.data.recurrenceWeeks);
  const updated = await prisma.chore.update({
    where: { id: chore.id },
    data: { ...body.data, ...(derivedFreq ? { frequency: derivedFreq } : {}) },
  });
  const actor = await actorName(updated.householdId, (req as AuthenticatedRequest).clerkUserId);
  wsBroadcast(`household:${updated.householdId}`, { type: 'chore_updated', data: updated, actor });
  res.json(updated);
}));

// DELETE /api/chores/:choreId
choresRouter.delete('/:choreId', requireAuth, asyncHandler(async (req, res) => {
  const chore = await getChoreAndVerifyMember(req.params.choreId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!chore) return;

  const actor = await actorName(chore.householdId, (req as AuthenticatedRequest).clerkUserId);
  await prisma.chore.delete({ where: { id: chore.id } });
  wsBroadcast(`household:${chore.householdId}`, { type: 'chore_deleted', data: { id: chore.id }, actor });
  res.status(204).send();
}));

// POST /api/chores/:choreId/complete
choresRouter.post('/:choreId/complete', requireAuth, asyncHandler(async (req, res) => {
  const chore = await getChoreAndVerifyMember(req.params.choreId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!chore) return;

  const body = z.object({
    note: z.string().optional(),
    day: z.nativeEnum(WeekDay).nullable().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const completion = await prisma.choreCompletion.create({
    data: {
      choreId: chore.id,
      completedBy: (req as AuthenticatedRequest).clerkUserId,
      note: body.data.note,
      day: body.data.day ?? null,
      date: body.data.date ?? null,
    },
  });
  wsBroadcast(`household:${chore.householdId}`, { type: 'chore_completed', data: completion });
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

// DELETE /api/chores/:choreId/complete?date=YYYY-MM-DD — undo completion for that date.
// Falls back to ?day=mon (legacy) which removes completions of that weekday within last 24h.
choresRouter.delete('/:choreId/complete', requireAuth, asyncHandler(async (req, res) => {
  const chore = await getChoreAndVerifyMember(req.params.choreId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!chore) return;

  const dateRaw = req.query.date;
  const dateParse = typeof dateRaw === 'string' ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(dateRaw) : null;
  const date = dateParse?.success ? dateParse.data : null;

  if (date) {
    await prisma.choreCompletion.deleteMany({ where: { choreId: chore.id, date } });
    wsBroadcast(`household:${chore.householdId}`, { type: 'chore_uncompleted', data: { id: chore.id, day: null, date } });
    res.status(204).send();
    return;
  }

  const dayRaw = req.query.day;
  const dayParse = typeof dayRaw === 'string' ? z.nativeEnum(WeekDay).safeParse(dayRaw) : null;
  const day = dayParse?.success ? dayParse.data : null;
  const cutoff = new Date(Date.now() - 86400000);

  await prisma.choreCompletion.deleteMany({
    where: { choreId: chore.id, day, completedAt: { gte: cutoff } },
  });
  wsBroadcast(`household:${chore.householdId}`, { type: 'chore_uncompleted', data: { id: chore.id, day } });
  res.status(204).send();
}));
