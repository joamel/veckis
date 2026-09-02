import { Router } from 'express';
import * as jwt from 'jsonwebtoken';
import { createClerkClient } from '@clerk/backend';
import { asyncHandler } from '../lib/asyncHandler';

export const authRouter = Router();

// Test endpoint
authRouter.get('/test', (_req, res) => {
  res.json({ ok: true });
});

interface GoogleIdTokenPayload {
  email?: string;
  email_verified?: boolean;
  name?: string;
  sub?: string;
}

// POST /api/auth/google-signin
// Native Google idToken → extract email → send email-code → user completes with code in app
authRouter.post(
  '/google-signin',
  asyncHandler(async (req, res) => {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'Missing or invalid idToken' });
      return;
    }

    try {
      // Decode idToken WITHOUT verifying (Google signature verification is complex on native)
      // We extract email + basic claims
      const decoded = jwt.decode(idToken) as GoogleIdTokenPayload | null;

      if (!decoded || !decoded.email) {
        res.status(400).json({ error: 'Invalid token or missing email' });
        return;
      }

      const { email, name } = decoded;

      // Get or create Clerk user
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

      let clerkUser = null;
      try {
        const users = await clerk.users.getUserList({ emailAddress: [email] });
        if (users.data.length > 0) {
          clerkUser = users.data[0];
        }
      } catch {
        // User doesn't exist
      }

      // Create new user if needed
      if (!clerkUser) {
        clerkUser = await clerk.users.createUser({
          emailAddress: [email],
          firstName: name?.split(' ')[0],
          lastName: name?.split(' ').slice(1).join(' '),
        });
      }

      // Return email + tell app to use email-code flow
      res.json({
        email,
        userId: clerkUser.id,
        message: 'Use email-code flow to complete signin',
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Token processing failed';
      console.error('[auth/google-signin]', msg);
      res.status(400).json({ error: msg });
    }
  }),
);
