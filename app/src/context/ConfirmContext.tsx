import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { ConfirmDialog, type ConfirmOptions } from '../components/ConfirmDialog';

type ConfirmFn = (opts: ConfirmOptions) => void;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Open an app-styled confirmation dialog (replaces native Alert.alert for
 * choice/confirm prompts so they match the rest of the app — rounded corners,
 * vertical button stack, primary/destructive/cancel styling).
 */
export function useConfirm(): ConfirmFn {
  const c = useContext(ConfirmContext);
  if (!c) throw new Error('useConfirm must be used within ConfirmProvider');
  return c;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const show = useCallback<ConfirmFn>((o) => setOpts(o), []);
  return (
    <ConfirmContext.Provider value={show}>
      {children}
      <ConfirmDialog visible={!!opts} options={opts} onClose={() => setOpts(null)} />
    </ConfirmContext.Provider>
  );
}
