import { Router } from 'express';
import { Webhook } from 'svix';
import { asyncHandler } from '../lib/asyncHandler';
import { wsBroadcast } from '../lib/wsHub';
import { handleClerkUserDeleted } from '../lib/memberCleanup';

export const clerkWebhookRouter = Router();

// POST /api/webhooks/clerk — tar emot Clerk-webhooks (Svix-signerade).
// Monteras med express.raw() (se index.ts) eftersom Svix-verifieringen kräver
// den RÅA body:n, inte den JSON-parsade.
//
// Kräver env CLERK_WEBHOOK_SECRET (Signing Secret från Clerk Dashboard →
// Webhooks). Konfigurera endpointen där och prenumerera på `user.deleted`.
clerkWebhookRouter.post('/', asyncHandler(async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[CLERK WEBHOOK] CLERK_WEBHOOK_SECRET saknas — kan inte verifiera. Sätt den i miljön.');
    res.status(500).send('webhook not configured');
    return;
  }

  const payload = (req.body as Buffer).toString('utf8');
  const headers = {
    'svix-id': req.header('svix-id') ?? '',
    'svix-timestamp': req.header('svix-timestamp') ?? '',
    'svix-signature': req.header('svix-signature') ?? '',
  };

  let evt: { type: string; data: { id?: string } };
  try {
    evt = new Webhook(secret).verify(payload, headers) as typeof evt;
  } catch {
    res.status(400).send('invalid signature');
    return;
  }

  if (evt.type === 'user.deleted' && evt.data.id) {
    const removed = await handleClerkUserDeleted(evt.data.id);
    for (const r of removed) {
      wsBroadcast(`household:${r.householdId}`, { type: 'member_deleted', data: { id: r.memberId } });
    }
    console.log(`[CLERK WEBHOOK] user.deleted ${evt.data.id} → rensade ${removed.length} medlemskap`);
  }

  res.status(200).send('ok'); // Clerk förväntar 2xx
}));
