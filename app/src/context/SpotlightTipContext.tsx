import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { SpotlightTip, type SpotlightOptions, type SpotlightRect } from '../components/SpotlightTip';

/** Returns true (the tip was accepted — either shown now or queued). Pre-
 *  measurement of `targetRef` happens BEFORE the modal opens, so the ring is
 *  guaranteed to line up when the tip becomes visible. */
type ShowTipFn = (opts: SpotlightOptions) => boolean;

const SpotlightTipContext = createContext<ShowTipFn | null>(null);

export function useSpotlightTip(): ShowTipFn {
  const ctx = useContext(SpotlightTipContext);
  if (!ctx) throw new Error('useSpotlightTip must be used within SpotlightTipProvider');
  return ctx;
}

type ResolvedOpts = Omit<SpotlightOptions, 'targetRef'> & { targetRect?: SpotlightRect };

export function SpotlightTipProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ResolvedOpts | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const optsRef = useRef<ResolvedOpts | null>(null);
  const queueRef = useRef<ResolvedOpts[]>([]);
  const inFlightTitles = useRef<Set<string>>(new Set());

  const enqueueOrShow = useCallback((finalOpts: ResolvedOpts) => {
    if (optsRef.current === null) {
      optsRef.current = finalOpts;
      setOpts(finalOpts);
    } else {
      queueRef.current.push(finalOpts);
      setHasNext(true);
    }
  }, []);

  const show = useCallback<ShowTipFn>((o) => {
    // Dedup by title against the currently-shown tip, the queue, and any
    // in-flight measure() that hasn't resolved yet.
    if (optsRef.current?.title === o.title) return true;
    if (queueRef.current.some(q => q.title === o.title)) return true;
    if (inFlightTitles.current.has(o.title)) return true;

    const { targetRef, ...rest } = o;
    if (targetRef?.current) {
      inFlightTitles.current.add(o.title);
      targetRef.current.measureInWindow((x, y, width, height) => {
        inFlightTitles.current.delete(o.title);
        // measure failed → no rect, tip still shows (centered). Don't lose it.
        const targetRect = width > 0 && height > 0 ? { x, y, width, height } : undefined;
        enqueueOrShow({ ...rest, targetRect });
      });
    } else {
      enqueueOrShow(rest);
    }
    return true;
  }, [enqueueOrShow]);

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
        targetRect={opts?.targetRect}
        swipeDemo={opts?.swipeDemo}
        actionLabel={opts?.actionLabel ?? (hasNext ? 'Nästa tips →' : 'Förstått')}
        onDismiss={dismiss}
      />
    </SpotlightTipContext.Provider>
  );
}
