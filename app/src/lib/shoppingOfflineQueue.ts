/**
 * Inköpslistan utan täckning.
 *
 * Två saker ska överleva att nätet försvinner mitt i butiken — och att Android
 * stänger appen i fickan medan det är borta:
 *
 *  1. Bockar som inte nått servern. Kön är per lista (Map<itemId, checked>),
 *     senaste värdet per vara vinner, och den sparas till disk vid varje
 *     ändring. Förut låg den bara i minnet, så en app som stängdes tappade
 *     bockarna tyst.
 *  2. Senaste versionen av listan, så den går att öppna utan nät. Förut
 *     misslyckades laddningen och listan var tom, med ett felmeddelande som
 *     kom tillbaka vid varje nytt försök.
 *
 * Logiken är ren och testad (shoppingOfflineQueue.test.ts); skärmen anropar
 * bara funktionerna här.
 */
import { getOfflineStorage } from './offlineStore';

const QUEUE_KEY = 'pending-toggles';
const listKey = (listId: string) => `list-${listId}`;

/** En köad bock: värdet och när den gjordes (för att lära butikens ordning —
 *  tiden då nätet kom tillbaka säger ingenting om vägen genom butiken). */
type Pending = { checked: boolean; at: string; bulk?: boolean };

/** listId → (itemId → köad bock) */
const queue = new Map<string, Map<string, Pending>>();
let hydrated: Promise<void> | null = null;

/**
 * Läser in kön från disk. Anropas innan listan laddas. Idempotent — körs bara
 * en gång per session. Det som redan köats i minnet vinner över disken, eftersom
 * det är nyare.
 */
export function hydratePendingToggles(): Promise<void> {
  if (!hydrated) {
    hydrated = (async () => {
      const raw = await getOfflineStorage().read(QUEUE_KEY);
      if (!raw) return;
      try {
        const obj = JSON.parse(raw) as Record<string, Record<string, Pending | boolean>>;
        for (const [listId, items] of Object.entries(obj)) {
          const m = queue.get(listId) ?? new Map<string, Pending>();
          for (const [itemId, v] of Object.entries(items)) {
            if (m.has(itemId)) continue;
            // Äldre format sparade bara true/false, utan tidpunkt.
            m.set(itemId, typeof v === 'boolean'
              ? { checked: v, at: new Date().toISOString() }
              : { checked: v.checked === true, at: String(v.at), ...(v.bulk ? { bulk: true } : {}) });
          }
          if (m.size > 0) queue.set(listId, m);
        }
      } catch { /* trasig fil — börja om */ }
    })();
  }
  return hydrated;
}

function persist(): void {
  const obj: Record<string, Record<string, Pending>> = {};
  for (const [listId, items] of queue) {
    if (items.size > 0) obj[listId] = Object.fromEntries(items);
  }
  const storage = getOfflineStorage();
  void (Object.keys(obj).length > 0 ? storage.write(QUEUE_KEY, JSON.stringify(obj)) : storage.remove(QUEUE_KEY));
}

export function enqueueToggle(
  listId: string, itemId: string, checked: boolean,
  at: string = new Date().toISOString(), bulk = false,
): void {
  if (!queue.has(listId)) queue.set(listId, new Map());
  queue.get(listId)!.set(itemId, { checked, at, ...(bulk ? { bulk: true } : {}) });
  persist();
}

/** Köade bockar som itemId → bockad. */
export function getPendingToggles(listId: string): ReadonlyMap<string, boolean> {
  const m = queue.get(listId);
  return new Map(m ? [...m].map(([id, p]) => [id, p.checked]) : []);
}

export function clearPendingToggle(listId: string, itemId: string): void {
  const m = queue.get(listId);
  if (!m?.delete(itemId)) return;
  if (m.size === 0) queue.delete(listId);
  persist();
}

/** Lägger väntande bockar ovanpå serverns version, så de inte skrivs över. */
export function applyPendingToggles<T extends { id: string; isChecked: boolean }>(
  items: T[],
  pending: ReadonlyMap<string, boolean>,
): T[] {
  if (pending.size === 0) return items;
  return items.map(i => {
    const q = pending.get(i.id);
    return q !== undefined && q !== i.isChecked ? { ...i, isChecked: q } : i;
  });
}

/**
 * Nätverksfel = försök igen senare. Klienten kastar ApiError med
 * isNetworkError; fetch kastar TypeError. Meddelandena är en reserv för fel
 * som kommer någon annanstans ifrån.
 */
export function isNetworkError(e: unknown): boolean {
  if (typeof e === 'object' && e !== null && (e as { isNetworkError?: unknown }).isNetworkError === true) return true;
  if (!(e instanceof Error)) return false;
  const m = e.message.toLowerCase();
  return e instanceof TypeError || m.includes('network request failed') || m.includes('failed to fetch') || m.includes('fetch failed');
}

/**
 * Ett fel som inte blir bättre av att försöka igen: varan finns inte längre
 * (404), eller begäran är ogiltig. Då släpps bocken — annars skulle den ligga
 * kvar och försökas för evigt. Utloggning (401), timeout (408), för många
 * anrop (429) och serverfel (5xx) är tillfälliga och behålls.
 */
function ärBestående(e: unknown): boolean {
  if (isNetworkError(e)) return false;
  const status = typeof e === 'object' && e !== null ? (e as { status?: unknown }).status : undefined;
  if (typeof status !== 'number') return false;
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}

export type ReplayResult = { sent: string[]; kept: string[]; dropped: string[] };

/**
 * Skickar köade bockar till servern. En i taget, i den ordning de köades.
 * Lyckade tas bort ur kön och rapporteras via onSent, så skärmen kan ta in
 * serverns version av varan.
 */
export async function replayPendingToggles<R>(
  listId: string,
  send: (itemId: string, checked: boolean, opts: { at: string; bulk?: boolean }) => Promise<R>,
  onSent?: (itemId: string, result: R) => void,
): Promise<ReplayResult> {
  const result: ReplayResult = { sent: [], kept: [], dropped: [] };
  for (const [itemId, { checked, at, bulk }] of [...(queue.get(listId) ?? new Map<string, Pending>())]) {
    try {
      const svar = await send(itemId, checked, bulk ? { at, bulk } : { at });
      // Bockades varan om medan anropet var på väg är det nya värdet kvar.
      if (getPendingToggles(listId).get(itemId) === checked) clearPendingToggle(listId, itemId);
      result.sent.push(itemId);
      onSent?.(itemId, svar);
    } catch (e) {
      if (ärBestående(e)) {
        clearPendingToggle(listId, itemId);
        result.dropped.push(itemId);
      } else {
        result.kept.push(itemId);
      }
    }
  }
  return result;
}

/** Sparar senaste versionen av listan, så den går att öppna utan nät. */
export async function saveListSnapshot(listId: string, data: unknown): Promise<void> {
  try {
    await getOfflineStorage().write(listKey(listId), JSON.stringify(data));
  } catch { /* best effort */ }
}

export async function readListSnapshot<T>(listId: string): Promise<T | null> {
  const raw = await getOfflineStorage().read(listKey(listId));
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

/** För tester: nollställ minnet (men inte disken). */
export function resetOfflineQueueForTests(): void {
  queue.clear();
  hydrated = null;
}
