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

/**
 * Global ägarspärr för /api/admin/*.
 *
 * Skiljer sig från requireAdmin ovan, som är HUSHÅLLS-scopad: den svarar på
 * "är du admin i det här hushållet". Admin-endpointerna rör global data —
 * ingredienspoolen, klientfel, kategori-rapporter — och där finns inget
 * hushåll att vara admin i. Fram till 2026-09-20 skyddades de bara av
 * requireAuth, alltså av att man var inloggad över huvud taget.
 *
 * Ägarna anges som Clerk-användar-id i ADMIN_CLERK_USER_IDS, kommaseparerat.
 *
 * Saknas variabeln nekas ALLA. Det är avsiktligt: ett bommat miljövariabel-
 * namn ska stänga dörren, inte öppna den för hela internet. Loggraden säger
 * vad som behöver sättas.
 */
/** Konfigurerade appadmins. Tom lista = ingen är admin (fail closed). */
export function appAdmins(): string[] {
  return (process.env.ADMIN_CLERK_USER_IDS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** True om användaren är appadmin. Används både av spärren nedan och av
 *  kontoraderingen, som vägrar radera bort den sista ägaren. */
export function ärAppAdmin(clerkUserId: string): boolean {
  return appAdmins().includes(clerkUserId);
}

export function requireAppAdmin(req: Request, res: Response, next: NextFunction): void {
  const tillåtna = appAdmins();

  if (tillåtna.length === 0) {
    console.warn('ADMIN_CLERK_USER_IDS är inte satt — alla /api/admin-anrop nekas.');
    res.status(403).json({ error: 'Admin är inte konfigurerat' });
    return;
  }

  const { clerkUserId } = req as AuthenticatedRequest;
  if (!tillåtna.includes(clerkUserId)) {
    res.status(403).json({ error: 'Endast ägare' });
    return;
  }

  next();
}
