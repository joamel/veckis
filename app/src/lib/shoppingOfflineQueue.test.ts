import { beforeEach, describe, expect, it } from 'vitest';
import { setOfflineStorageForTests, type OfflineStorage } from './offlineStore';
import {
  applyPendingToggles,
  clearPendingToggle,
  enqueueToggle,
  getPendingToggles,
  hydratePendingToggles,
  isNetworkError,
  readListSnapshot,
  replayPendingToggles,
  resetOfflineQueueForTests,
  saveListSnapshot,
} from './shoppingOfflineQueue';

/** Lagring i minnet som beter sig som disken: den överlever "omstarter". */
function minnesDisk(): OfflineStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async read(k) { return data.get(k) ?? null; },
    async write(k, v) { data.set(k, v); },
    async remove(k) { data.delete(k); },
  };
}

/** Samma fel som API-klienten kastar. */
const nätverksfel = () => Object.assign(new Error('Network request failed'), { isNetworkError: true, status: null });
const httpFel = (status: number) => Object.assign(new Error(`HTTP ${status}`), { isNetworkError: false, status });

/** Låt persist()-skrivningarna (void-promises) hinna klart. */
const vänta = () => new Promise(r => setTimeout(r, 0));

let disk: ReturnType<typeof minnesDisk>;

beforeEach(() => {
  disk = minnesDisk();
  setOfflineStorageForTests(disk);
  resetOfflineQueueForTests();
});

describe('bockar utan nät', () => {
  it('senaste bocken per vara vinner', () => {
    enqueueToggle('lista', 'mjölk', true);
    enqueueToggle('lista', 'mjölk', false);
    enqueueToggle('lista', 'bröd', true);
    expect([...getPendingToggles('lista')]).toEqual([['mjölk', false], ['bröd', true]]);
  });

  it('överlever att appen stängs och startas om', async () => {
    enqueueToggle('lista', 'mjölk', true);
    enqueueToggle('lista', 'bröd', true);
    await vänta();

    // "Omstart": minnet är borta, disken finns kvar.
    resetOfflineQueueForTests();
    expect(getPendingToggles('lista').size).toBe(0);

    await hydratePendingToggles();
    expect([...getPendingToggles('lista')]).toEqual([['mjölk', true], ['bröd', true]]);
  });

  it('en bock gjord efter omstarten vinner över den gamla på disken', async () => {
    enqueueToggle('lista', 'mjölk', true);
    await vänta();
    resetOfflineQueueForTests();
    enqueueToggle('lista', 'mjölk', false); // bockad ur innan disken lästs in
    await hydratePendingToggles();
    expect(getPendingToggles('lista').get('mjölk')).toBe(false);
  });

  it('disken töms när kön är tom', async () => {
    enqueueToggle('lista', 'mjölk', true);
    await vänta();
    expect(disk.data.has('pending-toggles')).toBe(true);
    clearPendingToggle('lista', 'mjölk');
    await vänta();
    expect(disk.data.has('pending-toggles')).toBe(false);
  });

  it('en trasig fil på disken ger en tom kö, inte en krasch', async () => {
    disk.data.set('pending-toggles', '{inte json');
    await hydratePendingToggles();
    expect(getPendingToggles('lista').size).toBe(0);
  });
});

describe('väntande bockar ovanpå serverns lista', () => {
  it('skriver över serverns värde för köade varor, och bara dem', () => {
    const server = [
      { id: 'mjölk', isChecked: false },
      { id: 'bröd', isChecked: false },
    ];
    const ut = applyPendingToggles(server, new Map([['mjölk', true]]));
    expect(ut).toEqual([{ id: 'mjölk', isChecked: true }, { id: 'bröd', isChecked: false }]);
    // Oförändrade rader är samma objekt — ingen onödig omrendering.
    expect(ut[1]).toBe(server[1]);
  });
});

describe('när nätet kommer tillbaka', () => {
  it('skickar köade bockar och tömmer kön', async () => {
    enqueueToggle('lista', 'mjölk', true);
    enqueueToggle('lista', 'bröd', false);
    const skickade: Array<[string, boolean]> = [];
    const r = await replayPendingToggles('lista', async (id, c) => { skickade.push([id, c]); return id; });
    expect(skickade).toEqual([['mjölk', true], ['bröd', false]]);
    expect(r.sent).toEqual(['mjölk', 'bröd']);
    expect(getPendingToggles('lista').size).toBe(0);
  });

  it('behåller bocken om nätet fortfarande saknas', async () => {
    enqueueToggle('lista', 'mjölk', true);
    const r = await replayPendingToggles('lista', async () => { throw nätverksfel(); });
    expect(r.kept).toEqual(['mjölk']);
    expect(getPendingToggles('lista').get('mjölk')).toBe(true);
  });

  it('släpper bocken om varan inte finns längre (404), så den inte försöks för evigt', async () => {
    enqueueToggle('lista', 'borttagen', true);
    const r = await replayPendingToggles('lista', async () => { throw httpFel(404); });
    expect(r.dropped).toEqual(['borttagen']);
    expect(getPendingToggles('lista').size).toBe(0);
  });

  it('behåller bocken vid tillfälliga fel: serverfel, utloggad, för många anrop', async () => {
    for (const status of [500, 503, 401, 429]) {
      resetOfflineQueueForTests();
      enqueueToggle('lista', 'mjölk', true);
      const r = await replayPendingToggles('lista', async () => { throw httpFel(status); });
      expect(r.kept, `status ${status}`).toEqual(['mjölk']);
    }
  });

  it('en bock som ändrats medan anropet var på väg ligger kvar till nästa gång', async () => {
    enqueueToggle('lista', 'mjölk', true);
    await replayPendingToggles('lista', async (id) => {
      enqueueToggle('lista', id, false); // bockades ur under anropet
      return id;
    });
    expect(getPendingToggles('lista').get('mjölk')).toBe(false);
  });

  it('lämnar tillbaka serverns svar för varje skickad bock', async () => {
    enqueueToggle('lista', 'mjölk', true);
    const svar: Array<[string, string]> = [];
    await replayPendingToggles('lista', async (id) => `server-${id}`, (id, s) => svar.push([id, s]));
    expect(svar).toEqual([['mjölk', 'server-mjölk']]);
  });
});

describe('listan går att öppna utan nät', () => {
  it('sparar och läser tillbaka senaste versionen', async () => {
    const lista = { id: 'lista', items: [{ id: 'mjölk', isChecked: false }] };
    await saveListSnapshot('lista', lista);
    expect(await readListSnapshot('lista')).toEqual(lista);
  });

  it('ger null när ingen version finns, eller filen är trasig', async () => {
    expect(await readListSnapshot('okänd')).toBeNull();
    disk.data.set('list-trasig', '{inte json');
    expect(await readListSnapshot('trasig')).toBeNull();
  });
});

describe('isNetworkError', () => {
  it('känner igen klientens nätverksfel och fetch-fel, men inte HTTP-fel', () => {
    expect(isNetworkError(nätverksfel())).toBe(true);
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(httpFel(404))).toBe(false);
    expect(isNetworkError(httpFel(500))).toBe(false);
    expect(isNetworkError('sträng')).toBe(false);
  });
});
