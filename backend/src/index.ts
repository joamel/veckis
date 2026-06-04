import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { parseAllowlist, makeOriginCheck } from './lib/corsAllowlist';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from '@clerk/backend';
import { householdRouter } from './routes/household';
import { shoppingRouter } from './routes/shopping';
import { storesRouter } from './routes/stores';
import { choresRouter } from './routes/chores';
import { scheduleRouter } from './routes/schedule';
import { recipesRouter } from './routes/recipes';
import { menusRouter } from './routes/menus';
import { staplesRouter } from './routes/staples';
import { adminRouter } from './routes/admin';
import { pushRouter } from './routes/push';
import { prisma } from './db';
import { asyncHandler } from './lib/asyncHandler';
import { wsSubscribe, wsUnsubscribe } from './lib/wsHub';
import { startNotificationScheduler } from './lib/notificationScheduler';

const app = express();
app.disable('etag');
// Render (and most PaaS) front the app with a proxy that sets X-Forwarded-For.
// Trust the first hop so express-rate-limit can read the real client IP instead
// of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every /api request.
app.set('trust proxy', 1);
const PORT = process.env.PORT ?? 3000;
const isDev = process.env.NODE_ENV !== 'production';

app.use(helmet());

// CORS — komma-separerad whitelist via CORS_ORIGIN, t.ex.
//   "https://veckis-web.onrender.com,http://localhost:3000".
// "*" tillåter alla origins (för utveckling). Native appar (Expo iOS/Android)
// skickar ingen Origin-header och släpps alltid igenom. Förlåtande matchning
// (lowercase + strip trailing slash) + log av blockade origins så typsnaiva
// fel i env-värdet inte blir silent fail i prod.
const corsAllowlist = parseAllowlist(process.env.CORS_ORIGIN);
app.use(cors({
  origin: makeOriginCheck(corsAllowlist),
  credentials: false,
}));
if (!corsAllowlist.includes('*')) {
  console.log(`[CORS] Whitelist active: ${JSON.stringify(corsAllowlist)}`);
}
app.use(express.json());
app.use(morgan(isDev ? 'dev' : 'combined'));
if (!isDev) {
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
}

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
app.use('/api/recipes', recipesRouter);
app.use('/api/menus', menusRouter);
app.use('/api/staples', staplesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/push', pushRouter);

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

// Time-based push notifications (activity reminders, overdue chores).
startNotificationScheduler();

// Backfilla subCategory på befintliga items (idempotent, körs i bakgrunden).
import('./jobs/backfillSubCategory').then(m => {
  m.backfillSubCategory()
    .then(r => { if (r.items > 0) console.log(`[subCategory backfill] uppdaterade ${r.items} items (${r.customMigrated} migrerade från customCategory)`); })
    .catch(e => console.error('[subCategory backfill] fel:', e));
});

// WebSocket server for real-time shopping list updates
const wss = new WebSocketServer({ noServer: true });

// Server-side heartbeat — terminate stale connections every 30s
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    const annotated = ws as WebSocket & { isAlive?: boolean };
    if (annotated.isAlive === false) { ws.terminate(); return; }
    annotated.isAlive = false;
    ws.ping();
  });
}, 30_000);

wss.on('close', () => clearInterval(heartbeatInterval));

server.on('upgrade', async (req, socket, head) => {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    const shoppingMatch = url.pathname.match(/^\/ws\/shopping\/([^/]+)$/);
    const householdMatch = url.pathname.match(/^\/ws\/household\/([^/]+)$/);
    if (!shoppingMatch && !householdMatch) { socket.destroy(); return; }

    const token = url.searchParams.get('token');
    if (!token) { socket.destroy(); return; }

    let clerkUserId: string;
    if (isDev) {
      if (token.startsWith('dev_')) {
        clerkUserId = token.slice(4);
      } else {
        try {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          clerkUserId = payload.sub || 'dev-user';
        } catch {
          clerkUserId = 'dev-user';
        }
      }
    } else {
      const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      clerkUserId = payload.sub;
    }

    let channelKey: string;
    if (shoppingMatch) {
      const listId = shoppingMatch[1];
      const list = await prisma.shoppingList.findUnique({ where: { id: listId } });
      if (!list) { socket.destroy(); return; }
      const member = await prisma.householdMember.findUnique({
        where: { householdId_clerkUserId: { householdId: list.householdId, clerkUserId } },
      });
      if (!member) { socket.destroy(); return; }
      channelKey = listId; // backwards-compat: shopping broadcasts already use bare listId
    } else {
      const householdId = householdMatch![1];
      const member = await prisma.householdMember.findUnique({
        where: { householdId_clerkUserId: { householdId, clerkUserId } },
      });
      if (!member) { socket.destroy(); return; }
      channelKey = `household:${householdId}`;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const annotated = ws as WebSocket & { isAlive?: boolean };
      annotated.isAlive = true;
      ws.on('pong', () => { annotated.isAlive = true; });

      wsSubscribe(channelKey, ws);
      ws.on('close', () => wsUnsubscribe(channelKey, ws));
    });
  } catch {
    socket.destroy();
  }
});

async function shutdown() {
  clearInterval(heartbeatInterval);
  wss.close();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
