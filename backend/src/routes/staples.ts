import { Router } from 'express';
import { z } from 'zod';
import { StoreCategory } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireHouseholdMember, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

export const staplesRouter = Router();

const categoryEnum = z.nativeEnum(StoreCategory);

// GET /api/staples?householdId=
staplesRouter.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { householdId } = req.query;
  if (typeof householdId !== 'string') { res.status(400).json({ error: 'Missing householdId' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member' }); return; }

  const staples = await prisma.stapleItem.findMany({
    where: { householdId },
    orderBy: { name: 'asc' },
  });
  res.json(staples);
}));

// POST /api/staples — upsert by name
staplesRouter.post('/', requireAuth, requireHouseholdMember, asyncHandler(async (req, res) => {
  const body = z.object({
    householdId: z.string(),
    name: z.string().min(1).max(200),
    category: categoryEnum.default('other'),
    unit: z.string().max(50).nullable().optional(),
    defaultQuantity: z.number().positive().nullable().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const staple = await prisma.stapleItem.upsert({
    where: { householdId_name: { householdId: body.data.householdId, name: body.data.name } },
    create: body.data,
    update: { category: body.data.category, unit: body.data.unit, defaultQuantity: body.data.defaultQuantity },
  });
  res.status(201).json(staple);
}));

// DELETE /api/staples/:stapleId
staplesRouter.delete('/:stapleId', requireAuth, asyncHandler(async (req, res) => {
  const staple = await prisma.stapleItem.findUnique({ where: { id: req.params.stapleId } });
  if (!staple) { res.status(404).json({ error: 'Not found' }); return; }

  const member = await prisma.householdMember.findUnique({
    where: { householdId_clerkUserId: { householdId: staple.householdId, clerkUserId: (req as AuthenticatedRequest).clerkUserId } },
  });
  if (!member) { res.status(403).json({ error: 'Not a member' }); return; }

  await prisma.stapleItem.delete({ where: { id: staple.id } });
  res.status(204).send();
}));
