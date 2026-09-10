/**
 * Dumpar produktionsdatabasen till en gzippad fil. Railway Hobby har INGA
 * automatiska backuper — det här är hela skyddsnätet.
 *
 *   npm run backup --workspace=backend
 *
 * Läser anslutningen från BACKUP_DATABASE_URL, annars DATABASE_URL. Använd
 * Railways publika TCP-proxy-URL (Postgres-tjänsten → Connect → Public Network),
 * inte den privata `.railway.internal`-adressen som bara går att nå inifrån.
 *
 * Kör `pg_dump` direkt om binären finns, annars via Docker (postgres:17). Läser
 * bara — inget skrivs till databasen.
 *
 * Flaggor:
 *   --out <mapp>   var dumpen hamnar (default ./backups)
 *   --keep <antal> hur många dumpar som sparas (default 14, äldre raderas)
 *   --schema-only  bara strukturen, ingen användardata. Bra som första test:
 *                  verifierar anslutning, Docker-väg och gzip utan att någon
 *                  persondata lämnar Railway.
 *   --encrypt      AES-256-GCM med lösenfras ur BACKUP_PASSPHRASE. Filen får
 *                  ändelsen .enc. Använd när dumpen ska lämna din maskin —
 *                  molnsynk, USB, extern lagring. Tappad lösenfras = förlorad
 *                  backup, så förvara den i lösenordshanteraren.
 */

import { spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync, rmSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { kryptera, kravFras } from './backup-crypto.mjs';

const args = process.argv.slice(2);
const flag = (namn, fallback) => {
  const i = args.indexOf(namn);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const url = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Saknar BACKUP_DATABASE_URL/DATABASE_URL.');
  console.error('Hämta DATABASE_PUBLIC_URL i Railway → Postgres → Variables.');
  console.error('');
  console.error('PowerShell:  $env:BACKUP_DATABASE_URL = "postgresql://..."');
  console.error('bash/zsh:    export BACKUP_DATABASE_URL="postgresql://..."');
  console.error('');
  console.error('I PowerShell fungerar INTE prefix-formen VAR=value kommando — det är bash-syntax.');
  process.exit(1);
}

if (url.includes('.railway.internal')) {
  console.error('Den här URL:en är Railways PRIVATA adress och går bara att nå inifrån');
  console.error('Railway-nätverket. Använd den publika TCP-proxy-URL:en i stället.');
  process.exit(1);
}

const utMapp = flag('--out', 'backups');
const behall = Number(flag('--keep', '14'));
const schemaOnly = args.includes('--schema-only');
const encrypt = args.includes('--encrypt');
// Kräv frasen INNAN dumpen tas — annars har vi läst ut hela databasen i onödan.
const fras = encrypt ? kravFras('kryptera dumpen') : null;

mkdirSync(utMapp, { recursive: true });
const stampel = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

const harPgDump = spawnSync('pg_dump', ['--version'], { stdio: 'ignore' }).status === 0;
if (!harPgDump && spawnSync('docker', ['--version'], { stdio: 'ignore' }).status !== 0) {
  console.error('Varken pg_dump eller docker hittades. Installera PostgreSQL-klienten');
  console.error('eller Docker Desktop.');
  process.exit(1);
}

// Dumpen tas alltid som ren SQL på stdout och gzippas här, så resultatet blir
// identiskt oavsett om pg_dump körs lokalt eller i en container.
const dumpArgs = ['--no-owner', '--no-privileges', ...(schemaOnly ? ['--schema-only'] : []), url];

function kör(major) {
  const cmd = harPgDump
    ? ['pg_dump', dumpArgs]
    : ['docker', ['run', '--rm', '-i', `postgres:${major}`, 'pg_dump', ...dumpArgs]];
  return spawnSync(cmd[0], cmd[1], { maxBuffer: 1024 * 1024 * 1024, encoding: 'buffer' });
}

console.log(schemaOnly ? 'Läge: --schema-only (ingen användardata)' : 'Läge: fullständig dump (innehåller all användardata)');

// pg_dump vägrar läsa från en server som är nyare än den själv. I stället för
// att hårdkoda en version (som går sönder varje gång Railway uppgraderar) kör
// vi på en gissning och läser ut serverns faktiska version ur felmeddelandet
// vid krock — sedan ett omtag med rätt avbild.
let major = Number(process.env.PG_MAJOR || flag('--pg-major', '')) || 18;
if (!harPgDump) console.log(`Kör pg_dump via Docker (postgres:${major}).`);

let proc = kör(major);

if (proc.status !== 0 && !harPgDump) {
  const fel = proc.stderr?.toString() || '';
  const träff = fel.match(/server version:s*(d+)/);
  if (träff && Number(träff[1]) !== major) {
    major = Number(träff[1]);
    console.log(`Servern kör Postgres ${major} — gör om med postgres:${major}.`);
    proc = kör(major);
  }
}

if (proc.status !== 0) {
  console.error('pg_dump misslyckades:');
  console.error(proc.stderr?.toString() || '(ingen felutskrift)');
  process.exit(1);
}

// Versionen bakas in i filnamnet så restore-test vet vilken avbild som behövs
// för att läsa tillbaka dumpen.
const suffix = schemaOnly ? '-schema' : '';
const målfil = join(utMapp, `handlis-${stampel}${suffix}-pg${major}.sql.gz${encrypt ? '.enc' : ''}`);
console.log(`Skriver ${målfil} …`);

if (encrypt) {
  // Gzip först, kryptera sedan: komprimering på krypterad data ger ingenting.
  writeFileSync(målfil, kryptera(gzipSync(proc.stdout), fras));
} else {
  await pipeline(Readable.from(proc.stdout), createGzip(), createWriteStream(målfil));
}

const storlek = statSync(målfil).size;
if (storlek < 1024) {
  console.error(`Dumpen blev bara ${storlek} B — det är misstänkt litet. Behåller den inte.`);
  rmSync(målfil);
  process.exit(1);
}
console.log(`Klart: ${(storlek / 1024 / 1024).toFixed(2)} MB${encrypt ? ' (krypterad)' : ''}`);

// Rotera bort gamla dumpar så mappen inte växer i all evighet.
const gamla = readdirSync(utMapp)
  .filter(f => /^handlis-.*\.sql\.gz$/.test(f))
  .sort()
  .slice(0, -behall);
for (const f of gamla) {
  unlinkSync(join(utMapp, f));
  console.log(`Raderade gammal dump: ${f}`);
}
