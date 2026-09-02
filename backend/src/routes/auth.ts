import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';

export const authRouter = Router();

// Test endpoint - verify prod is deployed
authRouter.get('/test', (_req, res) => {
  res.json({ ok: true, version: '2' });
});
