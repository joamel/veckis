import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { SpotlightTip, type SpotlightOptions } from '../components/SpotlightTip';

/** Returns true when the tip is shown; false if another tip is already up (so
 *  callers can skip `markSeen` and retry on a future render / session). */
type ShowTipFn = (opts: SpotlightOptions) => boolean;

const SpotlightTipContext = createContext<ShowTipFn | null>(null);

/**
 * Open an onboarding tip — full-screen dim + optional spotlight ring around a
 * referenced UI element. Use for "first time you see this feature" hints; pair
 * with `useOnceFlag('seen-…')` so each fires at most once per device.
 *
 * Returns `true` if the tip opened, `false` if another tip was already visible
 * (the caller should NOT mark the flag as seen in that case — try again later).
 */
export function useSpotlightTip(): ShowTipFn {
  const ctx = useContext(SpotlightTipContext);
  if (!ctx) throw new Error('useSpotlightTip must be used within SpotlightTipProvider');
  return ctx;
}

export function SpotlightTipProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<SpotlightOptions | null>(null);
  const [hasNext, setHasNext] = useState(false);
  // Refs shadow state so concurrent callers see the latest value synchronously
  // (state updates are async). Multiple tip useEffects can fire same render —
  // we queue them in order so the user gets a "Nästa tips →"-button to chain.
  const optsRef = useRef<SpotlightOptions | null>(null);
  const queueRef = useRef<SpotlightOptions[]>([]);

  const show = useCallback<ShowTipFn>((o) => {
    // Dedup by title so a re-running effect doesn't enqueue the same tip twice.
    if (optsRef.current?.title === o.title) return true;
    if (queueRef.current.some(q => q.title === o.title)) return true;
    if (optsRef.current === null) {
      optsRef.current = o;
      setOpts(o);
    } else {
      queueRef.current.push(o);
      setHasNext(true);
    }
    return true;
  }, []);

  const dismiss = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    optsRef.current = next;
    setOpts(next);
    setHasNext(queueRef.current.length > 0);
  }, []);

  return (
    <SpotlightTipContext.Provider value={show}>
      {children}
      <SpotlightTip
        visible={!!opts}
        title={opts?.title ?? ''}
        message={opts?.message}
        targetRef={opts?.targetRef}
        // If more tips are queued, the dismiss button advances; show that with
        // a "→" so the user knows tapping moves on rather than closing.
        actionLabel={opts?.actionLabel ?? (hasNext ? 'Nästa tips →' : 'Förstått')}
        onDismiss={dismiss}
      />
    </SpotlightTipContext.Provider>
  );
}
