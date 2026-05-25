// Lightweight in-app signal so the shopping-list overview can refresh when a
// list changes from elsewhere (e.g. the deferred "clear list" completing inside
// the list detail). The overview otherwise only reloads on tab focus, which
// misses the 5s-deferred clear.
type Listener = () => void;

const listeners = new Set<Listener>();

export function onShoppingChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitShoppingChanged(): void {
  listeners.forEach(l => l());
}
