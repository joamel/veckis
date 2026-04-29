import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { householdRouter } from './routes/household';
import { shoppingRouter } from './routes/shopping';
import { storesRouter } from './routes/stores';
import { choresRouter } from './routes/chores';
import { scheduleRouter } from './routes/schedule';
import { prisma } from './db';
import { asyncHandler } from './lib/asyncHandler';

const app = express();
const PORT = process.env.PORT ?? 3000;
const isDev = process.env.NODE_ENV !== 'production';

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json());
app.use(morgan(isDev ? 'dev' : 'combined'));
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  }),
);

app.get(
  '/health',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  }),
);

app.use('/api/households', householdRouter);
app.use('/api/shopping', shoppingRouter);
app.use('/api/stores', storesRouter);
app.use('/api/chores', choresRouter);
app.use('/api/schedule', scheduleRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`Veckis backend running on port ${PORT}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
