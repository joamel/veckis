/**
 * Kryptering av databasdumpar. AES-256-GCM med nyckel härledd ur en lösenfras
 * via scrypt. Använder bara Nodes inbyggda crypto — inget att installera, och
 * inget som kan sakna rätt version den dag du faktiskt behöver återställa.
 *
 * GCM ger både sekretess och äkthetskontroll: en fil som ändrats på vägen går
 * inte att dekryptera, i stället för att tyst ge skräp.
 *
 * Filformat:
 *   magic   8 byte   "HANDLIS1"
 *   salt   16 byte   slumpas per fil → samma lösenfras ger olika nycklar
 *   iv     12 byte   slumpas per fil
 *   tag    16 byte   GCM-autentiseringstagg
 *   data    resten   krypterad gzip-ström
 *
 * VARNING: tappar du lösenfrasen finns ingen väg tillbaka. Det är hela poängen
 * med kryptering, och samtidigt dess största risk för en backup. Förvara frasen
 * i din lösenordshanterare — inte i repot, inte i samma mapp som dumparna.
 */

import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';

const MAGIC = Buffer.from('HANDLIS1', 'utf8');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN;

// N=2^15 tar ~100 ms — tillräckligt segt för att göra gissningsattacker dyra,
// tillräckligt snabbt för att inte märkas vid en backup. maxmem måste sättas
// explicit: N*r*128 = 32 MB ligger precis över Nodes standardtak.
const nyckel = (fras, salt) =>
  scryptSync(fras, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export const ÄR_KRYPTERAD = fil => fil.endsWith('.enc');

export function kryptera(data, fras) {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', nyckel(fras, salt), iv);
  const kryptat = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), kryptat]);
}

export function dekryptera(fil, fras) {
  if (fil.length < HEADER_LEN || !fil.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Filen ser inte ut som en krypterad Handlis-dump (fel magic).');
  }
  let p = MAGIC.length;
  const salt = fil.subarray(p, (p += SALT_LEN));
  const iv = fil.subarray(p, (p += IV_LEN));
  const tag = fil.subarray(p, (p += TAG_LEN));

  const decipher = createDecipheriv('aes-256-gcm', nyckel(fras, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(fil.subarray(p)), decipher.final()]);
  } catch {
    // GCM skiljer inte på "fel lösenfras" och "manipulerad fil" — båda ger
    // samma fel, och det är korrekt beteende.
    throw new Error('Kunde inte dekryptera: fel lösenfras, eller så är filen skadad.');
  }
}

export function kravFras(syfte) {
  const fras = process.env.BACKUP_PASSPHRASE;
  if (!fras) {
    console.error(`BACKUP_PASSPHRASE saknas — behövs för att ${syfte}.`);
    console.error('');
    console.error('PowerShell:  $env:BACKUP_PASSPHRASE = "din lösenfras"');
    console.error('bash/zsh:    export BACKUP_PASSPHRASE="din lösenfras"');
    process.exit(1);
  }
  if (fras.length < 12) {
    console.error('BACKUP_PASSPHRASE är kortare än 12 tecken — välj en längre.');
    process.exit(1);
  }
  return fras;
}
