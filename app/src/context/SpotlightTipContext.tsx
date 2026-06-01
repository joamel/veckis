import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { SpotlightTip, type SpotlightOptions } from '../components/SpotlightTip';
import { SKIP_ALL_FLAG } from '../lib/onboardingTips';

/** Returns true when the tip is shown; false if another tip is already up (so
 *  callers can skip `markSeen` and retry on a future render / session). */
type ShowTipFn = (opts: SpotlightOptions) => boolean;

interface SpotlightContextValue {
  show: ShowTipFn;
  /** null while the flag is still loading from SecureStore. */
  skipAll: boolean | null;
  setSkipAll: (v: boolean) => Promise<void>;
}

const SpotlightTipContext = createContext<SpotlightContextValue | null>(null);

/**
 * Open an onboarding tip — full-screen dim + optional spotlight ring around a
 * referenced UI element. Use for "first time you see this feature" hints; pair
 * with `useOnceFlag('seen-…')` so each fires at most once per device.
 */
export function useSpotlightTip(): ShowTipFn {
  const ctx = useContext(SpotlightTipContext);
  if (!ctx) throw new Error('useSpotlightTip must be used within SpotlightTipProvider');
  return ctx.show;
}

/** Master-toggle för hela onboarding-systemet. När `skipAll` är true fyrar
 *  inga tips (välkomstskärmen + inställningar styr detta). */
export function useOnboardingMaster() {
  const ctx = useContext(SpotlightTipContext);
  if (!ctx) throw new Error('useOnboardingMaster must be used within SpotlightTipProvider');
  return { skipAll: ctx.skipAll, setSkipAll: ctx.setSkipAll };
}

export function SpotlightTipProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<SpotlightOptions | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const optsRef = useRef<SpotlightOptions | null>(null);
  const queueRef = useRef<SpotlightOptions[]>([]);
  // Master-flagga: när true fyrar inga tips. null = laddar fortfarande.
  const [skipAll, setSkipAllState] = useState<boolean | null>(null);
  const skipAllRef = useRef<boolean>(false);

  useEffect(() => {
    SecureStore.getItemAsync(SKIP_ALL_FLAG).then(v => {
      const flag = v === '1';
      skipAllRef.current = flag;
      setSkipAllState(flag);
    }).catch(() => { setSkipAllState(false); });
  }, []);

  const setSkipAll = useCallback(async (v: boolean) => {
    skipAllRef.current = v;
    setSkipAllState(v);
    if (v) await SecureStore.setItemAsync(SKIP_ALL_FLAG, '1').catch(() => {});
    else await SecureStore.deleteItemAsync(SKIP_ALL_FLAG).catch(() => {});
  }, []);

  const show = useCallback<ShowTipFn>((o) => {
    if (skipAllRef.current) return false; // master kill-switch
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

  const value = useMemo<SpotlightContextValue>(() => ({ show, skipAll, setSkipAll }), [show, skipAll, setSkipAll]);

  return (
    <SpotlightTipContext.Provider value={value}>
      {children}
      <SpotlightTip
        visible={!!opts}
        title={opts?.title ?? ''}
        message={opts?.message}
        targetRef={opts?.targetRef}
        targetRect={opts?.targetRect}
        swipeDemo={opts?.swipeDemo}
        actionLabel={opts?.actionLabel ?? (hasNext ? 'Nästa tips →' : 'Förstått')}
        onDismiss={dismiss}
      />
    </SpotlightTipContext.Provider>
  );
}
