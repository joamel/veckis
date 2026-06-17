import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { deliverPush } from '../lib/sendPush';

export const pushRouter = Router();

const DEFAULT_PREFS = {
  activityReminder: true,
  choreOverdue: true,
  listCleared: true,
  newMember: true,
  shopperClaimed: true,
  choreCompleted: true,
  reminderMinutes: 30,
};

// POST /api/push/register — register/refresh this device's Expo push token
pushRouter.post('/register', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    token: z.string().min(1).max(255),
    platform: z.string().max(20).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  // Re-point the token to the current user if it moved devices/accounts.
  const saved = await prisma.pushToken.upsert({
    where: { token: body.data.token },
    create: { token: body.data.token, platform: body.data.platform, clerkUserId },
    update: { clerkUserId, platform: body.data.platform },
  });
  res.status(201).json({ id: saved.id });
}));

// POST /api/push/unregister — remove a token (e.g. on logout / toggle off)
pushRouter.post('/unregister', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ token: z.string().min(1) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  await prisma.pushToken.deleteMany({
    where: { token: body.data.token, clerkUserId: (req as AuthenticatedRequest).clerkUserId },
  });
  res.status(204).send();
}));

// POST /api/push/test — send a test push to the caller's own devices.
// Returns how many tokens were targeted + any Expo errors, for in-app diagnostics.
pushRouter.post('/test', requireAuth, asyncHandler(async (req, res) => {
  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  const result = await deliverPush([clerkUserId], {
    title: 'Testnotis från Veckis',
    body: 'Push fungerar! 🎉',
    data: { type: 'test' },
  });
  res.json(result);
}));

// GET /api/push/preferences — current user's preferences (defaults if unset)
pushRouter.get('/preferences', requireAuth, asyncHandler(async (req, res) => {
  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  const pref = await prisma.notificationPreference.findUnique({ where: { clerkUserId } });
  res.json(pref ?? { clerkUserId, ...DEFAULT_PREFS });
}));

// PATCH /api/push/preferences — update one or more preference flags
pushRouter.patch('/preferences', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    activityReminder: z.boolean().optional(),
    choreOverdue: z.boolean().optional(),
    listCleared: z.boolean().optional(),
    newMember: z.boolean().optional(),
    shopperClaimed: z.boolean().optional(),
    choreCompleted: z.boolean().optional(),
    reminderMinutes: z.number().int().min(0).max(1440).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }

  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  const pref = await prisma.notificationPreference.upsert({
    where: { clerkUserId },
    create: { clerkUserId, ...DEFAULT_PREFS, ...body.data },
    update: body.data,
  });
  res.json(pref);
}));
