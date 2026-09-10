/**
 * Återställer en dump till en tillfällig Docker-Postgres och rapporterar vad
 * som faktiskt kom in. Produktionsdatabasen rörs ALDRIG — den här läser bara en
 * fil från disk.
 *
 *   npm run restore-test --workspace=backend
 *   npm run restore-test --workspace=backend -- backups/handlis-....sql.gz
 *
 * Utan argument används den senaste dumpen i backups/.
 *
 * Poängen: en dump som aldrig återställts är en gissning. Det här kommandot gör
 * skillnaden mellan "vi har en fil" och "vi har en backup".
 *
 * Containern körs på en ledig port, raderas alltid efteråt (även vid fel) och
 * delar inget med din lokala utvecklingsdatabas. Postgres-versionen läses ur
 * dumpens filnamn, så den matchar den som dumpen togs med.
 */

import { spawnSync } from 'node:child_process';
import { createReadStream, readFileSync, readdirSync, existsSync } from 'node:fs';
import { createGunzip, gunzipSync } from 'node:zlib';
import { ÄR_KRYPTERAD, dekryptera, kravFras } from './backup-crypto.mjs';
import { join } from 'node:path';

const STANDARD_MAJOR = 18;
const CONTAINER = `handlis-restore-test-${process.pid}`;

// Dumpfilen bär vilken pg-version den togs med (…-pg18.sql.gz). Återställer vi
// med en äldre psql kan syntax den inte känner igen få hela importen att fela.
const majorFor = fil => Number(fil.match(/-pg(\d+)\.sql\.gz$/)?.[1]) || STANDARD_MAJOR;
const LOSEN = 'restore-test';

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });

function valjDump() {
  const arg = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (arg) {
    if (!existsSync(arg)) {
      console.error(`Hittar inte ${arg}`);
      process.exit(1);
    }
    return arg;
  }
  if (!existsSync('backups')) {
    console.error('Ingen backups/-mapp. Kör `npm run backup --workspace=backend` först.');
    process.exit(1);
  }
  const filer = readdirSync('backups').filter(f => /\.sql\.gz$/.test(f)).sort();
  if (filer.length === 0) {
    console.error('Inga dumpar i backups/. Kör `npm run backup --workspace=backend` först.');
    process.exit(1);
  }
  return join('backups', filer[filer.length - 1]);
}

/**
 * Läser dumpen till ren SQL. Krypterade filer dekrypteras först — samma
 * lösenfras som vid backupen, ur BACKUP_PASSPHRASE.
 */
async function lasDump(fil, fras) {
  if (ÄR_KRYPTERAD(fil)) {
    console.log('Krypterad dump — dekrypterar …');
    return gunzipSync(dekryptera(readFileSync(fil), fras));
  }
  return new Promise((resolve, reject) => {
    const bitar = [];
    createReadStream(fil).pipe(createGunzip())
      .on('data', b => bitar.push(b))
      .on('end', () => resolve(Buffer.concat(bitar)))
      .on('error', reject);
  });
}

function stadaUpp() {
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
}

async function main() {
  if (sh('docker', ['--version']).status !== 0) {
    console.error('Docker behövs för att starta en engångsdatabas. Installera Docker Desktop.');
    process.exit(1);
  }

  const dump = valjDump();
  // Fel lösenfras ska upptäckas innan vi startar något — annars står en
  // container kvar när processen avslutas.
  const fras = ÄR_KRYPTERAD(dump) ? kravFras('läsa den krypterade dumpen') : null;
  const image = `postgres:${majorFor(dump)}`;
  console.log(`Dump: ${dump}`);
  console.log(`Startar engångsdatabas (${image}) …`);

  const start = sh('docker', [
    'run', '-d', '--name', CONTAINER,
    '-e', `POSTGRES_PASSWORD=${LOSEN}`,
    '-p', '0:5432', image,
  ]);
  if (start.status !== 0) {
    console.error('Kunde inte starta containern:');
    console.error(start.stderr);
    process.exit(1);
  }

  // Containern svarar inte direkt — vänta tills Postgres tar emot anslutningar.
  let redo = false;
  for (let i = 0; i < 40; i++) {
    if (sh('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres']).status === 0) { redo = true; break; }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!redo) throw new Error('Databasen startade aldrig inom 20 sekunder.');

  console.log('Återställer …');
  const psql = spawnSync('docker', [
    'exec', '-i', CONTAINER,
    'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '--quiet',
  ], {
    input: await lasDump(dump, fras),
    encoding: 'buffer',
    maxBuffer: 1024 * 1024 * 1024,
  });

  if (psql.status !== 0) {
    console.error('\nÅTERSTÄLLNINGEN MISSLYCKADES — dumpen går inte att lita på:');
    console.error(psql.stderr?.toString().split('\n').slice(0, 15).join('\n'));
    throw new Error('psql avslutade med fel');
  }

  // Radantal per tabell. n_live_tup är en uppskattning, men efter en färsk
  // återställning är den exakt nog för att se om något saknas helt.
  const rapport = sh('docker', [
    'exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-F', '\t', '-c',
    `SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC, relname;`,
  ]);

  const rader = rapport.stdout.trim().split('\n').filter(Boolean);
  if (rader.length === 0) {
    throw new Error('Återställningen gav noll tabeller — dumpen är tom eller trasig.');
  }

  console.log(`\nÅterställt ${rader.length} tabeller:\n`);
  let totalt = 0;
  for (const rad of rader) {
    const [namn, antal] = rad.split('\t');
    totalt += Number(antal);
    console.log(`  ${namn.padEnd(32)} ${String(antal).padStart(8)}`);
  }
  console.log(`\n  ${'TOTALT'.padEnd(32)} ${String(totalt).padStart(8)} rader`);

  if (totalt === 0) {
    console.log('\nNoll rader — det är väntat för en --schema-only-dump, men fel för en full.');
  }
  console.log('\nÅterställningen lyckades. Dumpen går att använda.');
}

main()
  .catch(err => { console.error(`\n${err.message}`); process.exitCode = 1; })
  .finally(stadaUpp);
