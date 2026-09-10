// Produktionsentrypoint (Railway).
//
// Kör `prisma migrate deploy` innan servern startar, men ger inte upp om det
// misslyckas: databasen kan vara onåbar några sekunder vid en samtidig omstart
// av båda tjänsterna. Ett `exit(1)` där hade lagt hela backenden nere tills
// någon deployade om för hand. Nu bootar servern ändå så att /healthz svarar,
// och migrationen körs om i bakgrunden tills den lyckas — DB-beroende rutter
// felar under tiden, men tjänsten reser sig själv.
//
// Retryn skrevs ursprungligen för Neons autosuspend på gratisnivån. Neon är
// avvecklat och Railway Hobby suspenderar inte, så det scenariot är borta —
// men självläkningen är billig och skyddar fortfarande mot startordning och
// tillfälliga nätverksfel.

import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BOOT_ATTEMPTS = 3;          // snabba försök vid boot
const BOOT_RETRY_MS = 5_000;
const BACKGROUND_RETRY_MS = 60_000; // därefter tålmodig bakgrundsretry

function migrateDeploy() {
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    shell: true,
  });
  return result.status === 0;
}

let migrated = false;
for (let attempt = 1; attempt <= BOOT_ATTEMPTS; attempt++) {
  if (migrateDeploy()) { migrated = true; break; }
  if (attempt < BOOT_ATTEMPTS) {
    console.log(`migrate deploy attempt ${attempt} failed — waiting ${BOOT_RETRY_MS / 1000}s for DB to wake...`);
    await sleep(BOOT_RETRY_MS);
  }
}

if (!migrated) {
  // Boota ändå — servern serverar /healthz och icke-DB-ytor, och migrationen
  // körs om i bakgrunden tills DB:n är nåbar. (Är DB:n redan migrerad är detta
  // en no-op; är den ny appliceras migrationen så snart DB:n svarar.)
  console.error('migrate deploy failed at boot — starting server anyway; retrying migration in background');
  (async () => {
    while (!migrated) {
      await sleep(BACKGROUND_RETRY_MS);
      if (migrateDeploy()) {
        migrated = true;
        console.log('migrate deploy succeeded in background — DB is up to date');
      } else {
        console.log(`background migrate deploy still failing — retrying in ${BACKGROUND_RETRY_MS / 1000}s`);
      }
    }
  })();
}

// Servern startas i samma process så Railways SIGTERM vid omdeploy
// propagerar normalt.
await import('../dist/index.js');
