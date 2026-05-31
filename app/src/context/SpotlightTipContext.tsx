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
  // Ref shadows state so concurrent callers see the latest value synchronously
  // (state updates are async, so two near-simultaneous show() calls would both
  // see opts === null without this and both return true).
  const optsRef = useRef<SpotlightOptions | null>(null);

  const show = useCallback<ShowTipFn>((o) => {
    if (optsRef.current !== null) return false;
    optsRef.current = o;
    setOpts(o);
    return true;
  }, []);
  const dismiss = useCallback(() => {
    optsRef.current = null;
    setOpts(null);
  }, []);

  return (
    <SpotlightTipContext.Provider value={show}>
      {children}
      <SpotlightTip
        visible={!!opts}
        title={opts?.title ?? ''}
        message={opts?.message}
        targetRef={opts?.targetRef}
        actionLabel={opts?.actionLabel}
        onDismiss={dismiss}
      />
    </SpotlightTipContext.Provider>
  );
}
