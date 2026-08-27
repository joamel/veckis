// MÅSTE importeras ALLRA FÖRST i index.ts (före express/http). @sentry/node v8+
// instrumenterar modulerna vid import — körs Sentry.init efter att express redan
// importerats blir captureException en tyst no-op. Laddar även .env här så DSN:en
// finns när init körs (Railway injicerar env → dotenv no-op:ar där).
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../.env') });

import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 0,   // bara fel, ingen perf-tracing (håll free-tier)
});
