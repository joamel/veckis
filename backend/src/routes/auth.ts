import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { createClerkClient } from '@clerk/backend';
import { asyncHandler } from '../lib/asyncHandler';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '630229510172-97lh1jsdohiel0mgg0vec6r09gc77d6d.apps.googleusercontent.com';

export const authRouter = Router();

// Test endpoint — verifiera att app når backend
authRouter.get('/test', (_req, res) => {
  res.json({ ok: true, googleClientId: !!GOOGLE_CLIENT_ID });
});

interface GoogleIdTokenPayload {
  iss: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  aud: string;
  iat: number;
  exp: number;
}

// POST /api/auth/verify-google-idtoken
// Native Google Sign-In → idToken → verify mot Google + create Clerk session
authRouter.post(
  '/verify-google-idtoken',
  asyncHandler(async (req, res) => {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      res.status(400).json({ error: 'Missing or invalid idToken' });
      return;
    }

    if (!GOOGLE_CLIENT_ID) {
      console.error('GOOGLE_CLIENT_ID not configured');
      res.status(500).json({ error: 'Google OAuth not configured' });
      return;
    }

    try {
      // Verify idToken med Google
      const client = new OAuth2Client(GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload() as GoogleIdTokenPayload;
      if (!payload) {
        res.status(401).json({ error: 'Invalid token payload' });
        return;
      }

      const { email, sub: googleId, name } = payload;

      if (!email) {
        res.status(400).json({ error: 'Token missing email claim' });
        return;
      }

      // Get or create Clerk user via email
      const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

      // Hämta existerade user by email
      let clerkUser = null;
      try {
        const users = await clerk.users.getUserList({ emailAddress: [email] });
        if (users.data.length > 0) {
          clerkUser = users.data[0];
        }
      } catch {
        // User doesn't exist, we'll create one
      }

      // Skapa ny user om saknas
      if (!clerkUser) {
        clerkUser = await clerk.users.createUser({
          emailAddress: [email],
          firstName: name?.split(' ')[0],
          lastName: name?.split(' ').slice(1).join(' '),
          externalId: `google_${googleId}`,
        });
      }

      // Skapa session för denna user
      const session = await clerk.sessions.createSession({
        userId: clerkUser.id,
      });

      // Return session token som appen kan använda
      res.json({
        sessionId: session.id,
        createdSessionId: session.id,
        userId: clerkUser.id,
        email: clerkUser.emailAddresses[0]?.emailAddress,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Token verification failed';
      console.error('[auth/verify-google-idtoken]', msg);
      res.status(401).json({ error: msg });
    }
  }),
);
