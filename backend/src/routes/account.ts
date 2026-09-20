import { Router } from 'express';
import { createClerkClient } from '@clerk/backend';
import { requireAuth, ärAppAdmin, AuthenticatedRequest } from '../middleware/auth';
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

  // Appadmin kan inte radera sig själv härifrån.
  //
  // Raderingen tar Clerk-kontot, och därmed det id som står i
  // ADMIN_CLERK_USER_IDS. Variabeln pekar då på en användare som inte finns,
  // och det går inte att laga inifrån appen — man måste in i Railway med ett
  // nytt id. Ett feltryck i kontovyn skulle alltså låsa ut ägaren ur sin egen
  // drift, permanent tills någon redigerar miljövariabler.
  //
  // Spärren är avsiktligt inte en bekräftelsedialog till: den ska kräva ett
  // medvetet steg på ett ANNAT ställe (ta bort sig ur variabeln först), inte
  // bara ett tryck till i samma flöde.
  if (ärAppAdmin(clerkUserId)) {
    res.status(409).json({
      error: 'Du är appadmin och kan inte radera kontot härifrån. Ta först bort ditt id ur ADMIN_CLERK_USER_IDS.',
    });
    return;
  }

  const removed = await handleClerkUserDeleted(clerkUserId);
  for (const r of removed) {
    wsBroadcast(`household:${r.householdId}`, { type: 'member_deleted', data: { id: r.memberId } });
  }
  console.log(`[ACCOUNT DELETE] clerkUserId=${clerkUserId} städade ${removed.length} medlemskap, raderar Clerk-kontot…`);

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  await clerk.users.deleteUser(clerkUserId);
  console.log(`[ACCOUNT DELETE] Clerk-kontot ${clerkUserId} raderat.`);

  res.status(204).send();
}));
