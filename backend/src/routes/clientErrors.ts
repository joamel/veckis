import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';

export const clientErrorsRouter = Router();

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
// Loggar strukturerat till Render-loggarna så prod-fel blir synliga. Svarar
// alltid 204 — felrapportering ska aldrig fela för klienten.
clientErrorsRouter.post('/', asyncHandler(async (req, res) => {
  const body = reportSchema.safeParse(req.body);
  if (body.success) {
    const e = body.data;
    console.error('[CLIENT ERROR]', JSON.stringify({
      name: e.name ?? 'Error',
      message: e.message,
      platform: e.platform,
      appVersion: e.appVersion,
      context: e.context,
      at: e.at,
      stack: e.stack,
    }));
  } else {
    console.warn('[CLIENT ERROR] ogiltig payload mottagen');
  }
  res.status(204).send();
}));
