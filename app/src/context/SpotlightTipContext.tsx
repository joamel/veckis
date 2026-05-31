import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { SpotlightTip, type SpotlightOptions } from '../components/SpotlightTip';

type ShowTipFn = (opts: SpotlightOptions) => void;

const SpotlightTipContext = createContext<ShowTipFn | null>(null);

/**
 * Open an onboarding tip — full-screen dim + optional spotlight ring around a
 * referenced UI element. Use for "first time you see this feature" hints; pair
 * with `useOnceFlag('seen-…')` so each fires at most once per device.
 */
export function useSpotlightTip(): ShowTipFn {
  const ctx = useContext(SpotlightTipContext);
  if (!ctx) throw new Error('useSpotlightTip must be used within SpotlightTipProvider');
  return ctx;
}

export function SpotlightTipProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<SpotlightOptions | null>(null);
  const show = useCallback<ShowTipFn>((o) => setOpts(o), []);
  return (
    <SpotlightTipContext.Provider value={show}>
      {children}
      <SpotlightTip
        visible={!!opts}
        title={opts?.title ?? ''}
        message={opts?.message}
        targetRef={opts?.targetRef}
        actionLabel={opts?.actionLabel}
        onDismiss={() => setOpts(null)}
      />
    </SpotlightTipContext.Provider>
  );
}
