/**
 * Liten nyckel-värde-lagring som överlever att appen stängs — för det
 * inköpslistan måste klara utan nät: senaste versionen av listan, och bockar
 * som ännu inte nått servern.
 *
 * I appen: en fil per nyckel i appens dokumentkatalog via expo-file-system,
 * som är ett direkt beroende av expo och därför redan finns i den byggda
 * appen (ingen ny native-modul, går som OTA). SecureStore dög inte — den tar
 * bara runt 2 kB per värde på Android, och en lista är större än så.
 * På webben: localStorage.
 *
 * Allt är best effort. Går lagringen inte att läsa eller skriva fungerar
 * appen som förut, bara utan det offline-minnet.
 */
import { Platform } from 'react-native';

export interface OfflineStorage {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const webStorage: OfflineStorage = {
  async read(key) {
    try { return globalThis.localStorage?.getItem(`handlis-offline:${key}`) ?? null; } catch { return null; }
  },
  async write(key, value) {
    try { globalThis.localStorage?.setItem(`handlis-offline:${key}`, value); } catch { /* full/avstängd */ }
  },
  async remove(key) {
    try { globalThis.localStorage?.removeItem(`handlis-offline:${key}`); } catch { /* ignorera */ }
  },
};

/** Filnamn som tål alla nycklar (listId är cuid, men var försiktig ändå). */
function filnamn(key: string): string {
  return `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
}

function nativeStorage(): OfflineStorage {
  // require, inte import: på webben ska modulen aldrig laddas.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File, Directory, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const katalog = () => {
    const d = new Directory(Paths.document, 'offline');
    if (!d.exists) d.create({ intermediates: true });
    return d;
  };
  return {
    async read(key) {
      try {
        const f = new File(katalog(), filnamn(key));
        return f.exists ? await f.text() : null;
      } catch { return null; }
    },
    async write(key, value) {
      try {
        const f = new File(katalog(), filnamn(key));
        if (!f.exists) f.create();
        f.write(value);
      } catch { /* best effort */ }
    },
    async remove(key) {
      try {
        const f = new File(katalog(), filnamn(key));
        if (f.exists) f.delete();
      } catch { /* best effort */ }
    },
  };
}

let storage: OfflineStorage | null = null;

export function getOfflineStorage(): OfflineStorage {
  if (!storage) storage = Platform.OS === 'web' ? webStorage : nativeStorage();
  return storage;
}

/** För tester: byt lagringen mot en i minnet. */
export function setOfflineStorageForTests(s: OfflineStorage | null): void {
  storage = s;
}
