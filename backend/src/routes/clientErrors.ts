import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { requireAuth } from '../middleware/auth';

export const clientErrorsRouter = Router();

interface StoredError {
  id: number;
  name: string;
  message: string;
  stack?: string | null;
  platform?: string;
  appVersion?: string;
  context?: Record<string, unknown>;
  at?: string;
  receivedAt: string;
}

const MAX_STORED = 200;
let nextId = 1;
const errorRing: StoredError[] = [];

function storeError(e: Omit<StoredError, 'id' | 'receivedAt'>) {
  if (errorRing.length >= MAX_STORED) errorRing.shift();
  errorRing.push({ ...e, id: nextId++, receivedAt: new Date().toISOString() });
}

const reportSchema = z.object({
  name: z.string().max(200).optional(),
  message: z.string().max(4000),
  stack: z.string().max(8000).nullable().optional(),
  context: z.record(z.unknown()).optional(),
  platform: z.string().max(40).optional(),
  appVersion: z.string().max(40).optional(),
  at: z.string().max(40).optional(),
});

// POST /api/client-errors — oautentiserad felrapportering från klienten.
// Loggar + lagrar i memory-ring (max 200). Svarar alltid 204.
clientErrorsRouter.post('/', asyncHandler(async (req, res) => {
  const body = reportSchema.safeParse(req.body);
  if (body.success) {
    const e = body.data;
    const entry = {
      name: e.name ?? 'Error',
      message: e.message,
      stack: e.stack,
      platform: e.platform,
      appVersion: e.appVersion,
      context: e.context,
      at: e.at,
    };
    console.error('[CLIENT ERROR]', JSON.stringify(entry));
    storeError(entry);
  } else {
    console.warn('[CLIENT ERROR] ogiltig payload mottagen');
  }
  res.status(204).send();
}));

// GET /api/client-errors — returnerar de senaste lagrade felen (nyast först).
// Kräver auth men ingen specifik admin-roll.
clientErrorsRouter.get('/', requireAuth, asyncHandler(async (_req, res) => {
  res.json([...errorRing].reverse().slice(0, 100));
}));
