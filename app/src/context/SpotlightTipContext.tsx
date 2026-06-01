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
  /** True när välkomstmodalen är klar (sedd tidigare, eller just dismissad).
   *  Tips blockeras tills detta är true — annars börjar de fyra bakom
   *  välkomstskärmen. */
  welcomeReady: boolean;
  markWelcomeReady: () => void;
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

/** Välkomst-gate — använd från _layout för att markera när välkomstmodalen
 *  är avklarad så tips kan börja fyra. */
export function useWelcomeGate() {
  const ctx = useContext(SpotlightTipContext);
  if (!ctx) throw new Error('useWelcomeGate must be used within SpotlightTipProvider');
  return { welcomeReady: ctx.welcomeReady, markWelcomeReady: ctx.markWelcomeReady };
}

/** Sub-set av context:en för tips-callsites — returnerar bara den boolean:en
 *  som behövs som useFocusEffect-dep så callbacken re-skapas när gaten öppnar
 *  och useFocusEffect re-invokerar tipset. */
export function useTipsReady(): boolean {
  const ctx = useContext(SpotlightTipContext);
  if (!ctx) throw new Error('useTipsReady must be used within SpotlightTipProvider');
  return ctx.welcomeReady;
}

export function SpotlightTipProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<SpotlightOptions | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const optsRef = useRef<SpotlightOptions | null>(null);
  const queueRef = useRef<SpotlightOptions[]>([]);
  // Master-flagga: när true fyrar inga tips. null = laddar fortfarande.
  const [skipAll, setSkipAllState] = useState<boolean | null>(null);
  const skipAllRef = useRef<boolean>(false);
  // Välkomst-gate: blockerar alla show()-anrop tills _layout har bekräftat att
  // välkomstmodalen är dismissad (eller var redan sedd). Ref:en speglar
  // state:en så synkrona show()-anrop ser senaste värdet.
  //
  // Buffer: när gaten "markeras klar" vi väntar 2s innan vi flippar
  // welcomeReady — så användaren hinner se hela vyn utan dim-overlay innan
  // första tipset poppar.
  const POST_WELCOME_BUFFER_MS = 2000;
  const [welcomeReady, setWelcomeReady] = useState<boolean>(false);
  const welcomeReadyRef = useRef<boolean>(false);
  const welcomeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markWelcomeReady = useCallback(() => {
    if (welcomeReadyRef.current) return;
    if (welcomeTimerRef.current) return; // redan timed
    welcomeTimerRef.current = setTimeout(() => {
      welcomeReadyRef.current = true;
      setWelcomeReady(true);
      welcomeTimerRef.current = null;
    }, POST_WELCOME_BUFFER_MS);
  }, []);
  useEffect(() => () => {
    if (welcomeTimerRef.current) clearTimeout(welcomeTimerRef.current);
  }, []);

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
    if (!welcomeReadyRef.current) return false; // välkomstmodalen blockerar
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

  const value = useMemo<SpotlightContextValue>(
    () => ({ show, skipAll, setSkipAll, welcomeReady, markWelcomeReady }),
    [show, skipAll, setSkipAll, welcomeReady, markWelcomeReady],
  );

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
