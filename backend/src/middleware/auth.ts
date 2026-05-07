import { verifyToken } from '@clerk/backend';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';

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

  // Dev bypass: accept any token in development mode
  if (process.env.NODE_ENV === 'development') {
    // If token starts with dev_, use it directly; otherwise extract sub from token
    if (token.startsWith('dev_')) {
      (req as AuthenticatedRequest).clerkUserId = token.slice(4);
    } else {
      // For dev testing, extract sub from any bearer token
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        (req as AuthenticatedRequest).clerkUserId = payload.sub || 'dev-user';
      } catch {
        (req as AuthenticatedRequest).clerkUserId = 'dev-user';
      }
    }
    next();
    return;
  }

  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    (req as AuthenticatedRequest).clerkUserId = payload.sub;
    next();
  } catch (err) {
    console.error('Auth error:', err instanceof Error ? err.message : err);
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
