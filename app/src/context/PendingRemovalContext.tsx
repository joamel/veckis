import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react';

interface Ctx {
  pendingMenuItemRemovals: Set<string>;
  markPending: (menuItemId: string, onCancel?: () => void) => void;
  clearPending: (menuItemId: string) => void;
  /** Trigger cancel-callbacks for every still-pending removal and clear the set. */
  cancelAllPending: () => void;
  /** Current size — convenient for "N recept tas bort om 5s" toast. */
  pendingCount: number;
}

const PendingRemovalContext = createContext<Ctx | null>(null);

/**
 * Tracks menuItemIds that have been optimistically removed from the menu but where
 * the backend cleanup hasn't run yet (we wait 5s to allow undo). Shopping-list
 * screens filter items whose menuItemId is in this set so ingredients disappear
 * immediately rather than 5s later.
 */
export function PendingRemovalProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const cancellersRef = useRef<Map<string, () => void>>(new Map());

  const markPending = useCallback((id: string, onCancel?: () => void) => {
    if (onCancel) cancellersRef.current.set(id, onCancel);
    setPending(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const clearPending = useCallback((id: string) => {
    cancellersRef.current.delete(id);
    setPending(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const cancelAllPending = useCallback(() => {
    const cbs = [...cancellersRef.current.values()];
    cancellersRef.current.clear();
    setPending(new Set());
    for (const cb of cbs) {
      try { cb(); } catch { /* ignore */ }
    }
  }, []);

  return (
    <PendingRemovalContext.Provider value={{
      pendingMenuItemRemovals: pending,
      markPending,
      clearPending,
      cancelAllPending,
      pendingCount: pending.size,
    }}>
      {children}
    </PendingRemovalContext.Provider>
  );
}

export function usePendingRemoval(): Ctx {
  const ctx = useContext(PendingRemovalContext);
  if (!ctx) throw new Error('usePendingRemoval must be used within PendingRemovalProvider');
  return ctx;
}
