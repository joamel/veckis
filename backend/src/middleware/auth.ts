import { createClerkClient } from '@clerk/backend';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? 'sk_test_placeholder' });

export interface AuthenticatedRequest extends Request {
  clerkUserId: string;
  householdId?: string;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  // Dev bypass: Authorization: Bearer dev_<userId> — only in explicit development mode
  if (process.env.NODE_ENV === 'development' && token.startsWith('dev_')) {
    (req as AuthenticatedRequest).clerkUserId = token.slice(4);
    next();
    return;
  }

  try {
    const payload = await clerk.verifyToken(token);
    (req as AuthenticatedRequest).clerkUserId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export async function requireHouseholdMember(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const householdId = req.params.householdId ?? req.body?.householdId;

  if (!householdId) {
    res.status(400).json({ error: 'Missing householdId' });
    return;
  }

  try {
    const member = await prisma.householdMember.findUnique({
      where: {
        householdId_clerkUserId: { householdId, clerkUserId: authReq.clerkUserId },
      },
    });

    if (!member) {
      res.status(403).json({ error: 'Not a member of this household' });
      return;
    }

    authReq.householdId = householdId;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const householdId = req.params.householdId ?? req.body?.householdId;

  if (!householdId) {
    res.status(400).json({ error: 'Missing householdId' });
    return;
  }

  try {
    const member = await prisma.householdMember.findUnique({
      where: {
        householdId_clerkUserId: { householdId, clerkUserId: authReq.clerkUserId },
      },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    authReq.householdId = householdId;
    next();
  } catch (err) {
    next(err);
  }
}
