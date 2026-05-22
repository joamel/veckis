// Production entrypoint for Render.
//
// Runs `prisma migrate deploy` with retries before booting the server.
// Serverless Postgres (Neon free tier) scales the compute to zero when idle, so
// the first connection during a deploy can be dropped while the DB wakes
// (SQLSTATE 57P01). A single attempt makes the whole deploy fail and Render
// keeps the previous version — so we retry until the DB is awake, then boot.
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 10_000;

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    shell: true,
  });
  if (result.status === 0) break;
  if (attempt === MAX_ATTEMPTS) {
    console.error(`migrate deploy failed after ${attempt} attempts — aborting boot`);
    process.exit(1);
  }
  console.log(`migrate deploy attempt ${attempt} failed — waiting ${RETRY_DELAY_MS / 1000}s for DB to wake...`);
  await sleep(RETRY_DELAY_MS);
}

// Boot the server in this same process so Render's signals (SIGTERM on
// redeploy) propagate normally.
await import('../dist/index.js');
