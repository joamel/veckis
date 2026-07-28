// Production entrypoint for Render.
//
// Runs `prisma migrate deploy` before booting the server, but is SELF-HEALING:
// Neon (free tier) autosuspends/scales to zero and can be briefly unreachable
// (SQLSTATE 57P01) or fully suspended when the monthly compute allowance is
// spent (P1001). Tidigare gjorde ett misslyckat migrate `exit(1)` → hela
// backend låg nere tills en manuell omdeploy. Nu bootar servern ändå så att
// /healthz svarar (Render håller instansen vid liv), och migrationen körs om
// i bakgrunden tills den lyckas. DB-beroende rutter felar tills dess, men
// tjänsten reser sig själv när Neon är tillbaka — ingen handpåläggning.
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BOOT_ATTEMPTS = 3;          // snabba försök vid boot (täcker vanlig Neon-väckning)
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
  // en no-op när den vaknar; är den ny appliceras migrationen så snart Neon är uppe.)
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

// Boot the server in this same process so Render's signals (SIGTERM on
// redeploy) propagate normally.
await import('../dist/index.js');
