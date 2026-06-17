// Module-level queue som överlever navigering inom sessionen men inte app-omstart.
// Key = listId → Map<itemId, checked>. Senaste värde per item vinner (idempotent).
const queue = new Map<string, Map<string, boolean>>();

export function enqueueToggle(listId: string, itemId: string, checked: boolean) {
  if (!queue.has(listId)) queue.set(listId, new Map());
  queue.get(listId)!.set(itemId, checked);
}

export function getPendingToggles(listId: string): ReadonlyMap<string, boolean> {
  return queue.get(listId) ?? new Map();
}

export function clearPendingToggle(listId: string, itemId: string) {
  queue.get(listId)?.delete(itemId);
}

export function isNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const m = e.message.toLowerCase();
  // fetch failures (no connectivity) throw TypeError; also catch common messages
  return e instanceof TypeError || m.includes('network request failed') || m.includes('failed to fetch') || m.includes('fetch failed');
}
