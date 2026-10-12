import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import { ConfirmDialog, type ConfirmOptions } from '../components/ConfirmDialog';

type ConfirmFn = (opts: ConfirmOptions) => void;

const ConfirmContext = createContext<ConfirmFn | null>(null);

type HostState = {
  opts: ConfirmOptions | null;
  close: () => void;
  /** Den innersta värden som är monterad — den visar dialogen. */
  top: number | null;
  register: (id: number) => void;
  unregister: (id: number) => void;
};
const HostContext = createContext<HostState | null>(null);

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
  const [hosts, setHosts] = useState<number[]>([]);
  const show = useCallback<ConfirmFn>((o) => setOpts(o), []);
  const close = useCallback(() => setOpts(null), []);
  const register = useCallback((id: number) => setHosts(h => [...h, id]), []);
  const unregister = useCallback((id: number) => setHosts(h => h.filter(x => x !== id)), []);
  const top = hosts.length ? hosts[hosts.length - 1] : null;
  const hostState = useMemo(() => ({ opts, close, top, register, unregister }), [opts, close, top, register, unregister]);
  return (
    <ConfirmContext.Provider value={show}>
      <HostContext.Provider value={hostState}>
        {children}
        <ConfirmDialog visible={!!opts && top === null} options={opts} onClose={close} />
      </HostContext.Provider>
    </ConfirmContext.Provider>
  );
}

let nextHostId = 1;

/**
 * Visar dialogen INNE i en annan modal, på iOS.
 *
 * En <Modal> på iOS presenteras av vy-controllern som äger vyn — för rotens
 * dialog alltså rot-controllern. Visar den redan ett ark vägrar UIKit att visa
 * något mer, tyst. "Slänga utkastet?" syntes därför aldrig över ett ark med
 * text i: arket gick inte att stänga, bara att spara (iOS-testare 2026-10-12).
 * Inne i arkets modal presenteras dialogen av arkets controller, och då syns
 * den. Android har ett fönster per modal och klarar sig utan.
 */
export function ConfirmHost() {
  const ctx = useContext(HostContext);
  const id = useRef(nextHostId++).current;
  const active = Platform.OS === 'ios' && !!ctx;
  useEffect(() => {
    if (!active) return;
    ctx!.register(id);
    return () => ctx!.unregister(id);
    // register/unregister är stabila; värden ska bara registreras en gång.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, id]);
  if (!active || ctx!.top !== id) return null;
  return <ConfirmDialog visible={!!ctx!.opts} options={ctx!.opts} onClose={ctx!.close} />;
}
