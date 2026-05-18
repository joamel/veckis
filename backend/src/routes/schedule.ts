import { Router, Response } from 'express';
import { z } from 'zod';
import { WeekDay, RecurrenceType, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { wsBroadcast } from '../lib/wsHub';
import { syncAssignedTo } from '../lib/assignedToSync';

export const scheduleRouter = Router();

const timeRegex = /^\d{2}:\d{2}$/;

const createEntrySchema = z.object({
  householdId: z.string(),
  title: z.string().min(1).max(200),
  emoji: z.string().max(8).nullable().optional(),
  description: z.string().optional(),
  day: z.nativeEnum(WeekDay),
  startTime: z.string().regex(timeRegex, 'Format HH:MM').optional(),
  endTime: z.string().regex(timeRegex, 'Format HH:MM').optional(),
  assignedTo: z.string().optional(),
  assignedToMany: z.array(z.string()).optional(),
  isShared: z.boolean().default(true),
  recurrenceType: z.nativeEnum(RecurrenceType).default('none'),
  recurrenceDays: z.nativeEnum(WeekDay).array().default([]),
  recurrenceWeeks: z.number().int().min(1).default(1),
  monthlyType: z.string().optional(),
  recurrenceWeekOfMonth: z.number().int().optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

const updateEntrySchema = createEntrySchema.omit({ householdId: true }).partial().extend({
  startTime: z.string().regex(timeRegex).nullish(),
  assignedTo: z.string().nullable().optional(),
});

async function getEntryAndVerifyMember(entryId: string, clerkUserId: string, res: Response) {
  const entry = await prisma.scheduleEntry.findUnique({ where: { id: entryId } });
  if (!entry) {
    res.status(404).json({ error: 'Schedule entry not found' });
    return null;
  }
  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: entry.householdId, clerkUserId } },
  });
  if (!member) {
    res.status(403).json({ error: 'Not a member of this household' });
    return null;
  }
  return entry;
}

// GET /api/schedule?householdId=
scheduleRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { householdId } = req.query;
  if (typeof householdId !== 'string') { res.status(400).json({ error: 'Missing householdId' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member of this household' }); return; }

  const entries = await prisma.scheduleEntry.findMany({
    where: { householdId },
    orderBy: [{ day: 'asc' }, { startTime: 'asc' }],
  });
  res.json(entries);
}));

// POST /api/schedule
scheduleRouter.post('/', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = createEntrySchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const data = syncAssignedTo({ ...body.data });
  const entry = await prisma.scheduleEntry.create({
    data: { ...data, createdBy: (req as AuthenticatedRequest).clerkUserId } as Prisma.ScheduleEntryUncheckedCreateInput,
  });
  wsBroadcast(`household:${entry.householdId}`, { type: 'schedule_entry_added', data: entry });
  res.status(201).json(entry);
}));

// PATCH /api/schedule/:entryId
scheduleRouter.patch('/:entryId', requireAuth, asyncHandler(async (req, res) => {
  const entry = await getEntryAndVerifyMember(req.params.entryId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!entry) return;

  const body = updateEntrySchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const data = syncAssignedTo({ ...body.data });
  const updated = await prisma.scheduleEntry.update({ where: { id: entry.id }, data });
  wsBroadcast(`household:${updated.householdId}`, { type: 'schedule_entry_updated', data: updated });
  res.json(updated);
}));

// DELETE /api/schedule/:entryId
// If ?date=YYYY-MM-DD is present and entry is recurring, adds date to exceptions instead of deleting
scheduleRouter.delete('/:entryId', requireAuth, asyncHandler(async (req, res) => {
  const entry = await getEntryAndVerifyMember(req.params.entryId, (req as AuthenticatedRequest).clerkUserId, res);
  if (!entry) return;

  const { date } = req.query;
  if (typeof date === 'string' && entry.recurrenceType !== 'none') {
    const updated = await prisma.scheduleEntry.update({
      where: { id: entry.id },
      data: { exceptions: { push: date } },
    });
    wsBroadcast(`household:${updated.householdId}`, { type: 'schedule_entry_updated', data: updated });
    res.status(200).json(updated);
    return;
  }

  await prisma.scheduleEntry.delete({ where: { id: entry.id } });
  wsBroadcast(`household:${entry.householdId}`, { type: 'schedule_entry_deleted', data: { id: entry.id } });
  res.status(204).send();
}));
