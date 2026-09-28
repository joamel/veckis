import { Router } from 'express';
import { createClerkClient } from '@clerk/backend';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { isReviewAccount } from '../lib/reviewAccount';
import { reviewTicketLimiter } from '../lib/rateLimits';

export const authRouter = Router();

// Test endpoint - verify prod is deployed
authRouter.get('/test', (_req, res) => {
  res.json({ ok: true, version: '2' });
});

const reviewTicketSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

/**
 * POST /api/auth/review-ticket — engångsbiljett för Play-granskarens konto.
 * Se lib/reviewAccount.ts för varför den finns och när den ska tas bort.
 *
 * Öppen (ingen inloggning — det är ju den som saknas), men:
 *   - avstängd tills REVIEW_ACCOUNT_EMAIL är satt, och då bara för den adressen
 *   - lösenordet kontrolleras mot Clerk innan något utfärdas
 *   - biljetten gäller i 60 sekunder och bara för inloggning
 *   - rate limit per IP, och varje utfärdad biljett loggas
 *
 * Alla avslag svarar likadant (404), så vägen inte avslöjar vilken adress den
 * gäller eller om lösenordet var fel.
 */
authRouter.post('/review-ticket', reviewTicketLimiter, asyncHandler(async (req, res) => {
  const body = reviewTicketSchema.safeParse(req.body);
  const nej = () => { res.status(404).json({ error: 'Not found' }); };
  if (!body.success || !isReviewAccount(body.data.email, process.env.REVIEW_ACCOUNT_EMAIL)) return nej();

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const { data: users } = await clerk.users.getUserList({ emailAddress: [body.data.email.trim().toLowerCase()] });
  const user = users[0];
  if (!user) return nej();

  try {
    const { verified } = await clerk.users.verifyPassword({ userId: user.id, password: body.data.password });
    if (!verified) return nej();
  } catch {
    // Clerk svarar med ett fel, inte verified: false, vid fel lösenord.
    return nej();
  }

  const token = await clerk.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 60 });
  console.warn(`[REVIEW-TICKET] Biljett utfärdad för granskningskontot (${user.id}). Ta bort REVIEW_ACCOUNT_EMAIL när granskningen är klar.`);
  res.json({ ticket: token.token });
}));
