import { Router } from 'express';
import { createClerkClient } from '@clerk/backend';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { wsBroadcast } from '../lib/wsHub';
import { handleClerkUserDeleted } from '../lib/memberCleanup';

export const accountRouter = Router();

// DELETE /api/account — radera det inloggade Clerk-kontot helt, in-app.
//
// Ordning: städa medlemskapen FÖRST (deterministiskt, vår kontroll) och radera
// sedan själva Clerk-kontot via secret key. user.deleted-webhooken som Clerk
// fyrar efteråt blir en no-op (medlemskapen är redan borta) → ingen race.
// Skulle Clerk-raderingen fela efter städningen kan användaren göra om — då
// finns inga medlemskap kvar att städa och raderingen körs igen.
accountRouter.delete('/', requireAuth, asyncHandler(async (req, res) => {
  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;

  const removed = await handleClerkUserDeleted(clerkUserId);
  for (const r of removed) {
    wsBroadcast(`household:${r.householdId}`, { type: 'member_deleted', data: { id: r.memberId } });
  }

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  await clerk.users.deleteUser(clerkUserId);

  res.status(204).send();
}));
