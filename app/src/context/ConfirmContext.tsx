import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import { ConfirmDialog, type ConfirmOptions } from '../components/ConfirmDialog';

type ConfirmFn = (opts: ConfirmOptions) => void;

const ConfirmContext = createContext<ConfirmFn | null>(null);

type HostState = {
  opts: ConfirmOptions | null;
  close: () => void;
  /** Den innersta öppna värden — den visar dialogen. */
  top: number | null;
  open: (id: number) => void;
  /** Värdens modal har börjat stängas. Roten väntar tills closed. */
  closing: (id: number) => void;
  closed: (id: number) => void;
};
const HostContext = createContext<HostState | null>(null);

/** Reserv om en stängande modals onDismiss uteblir. Längre än slide-animationen. */
const CLOSING_FALLBACK_MS = 800;

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
  const [closingHosts, setClosingHosts] = useState<number[]>([]);
  const show = useCallback<ConfirmFn>((o) => setOpts(o), []);
  const close = useCallback(() => setOpts(null), []);
  const open = useCallback((id: number) => {
    setHosts(h => [...h.filter(x => x !== id), id]);
    setClosingHosts(c => c.filter(x => x !== id));
  }, []);
  const closed = useCallback((id: number) => setClosingHosts(c => c.filter(x => x !== id)), []);
  const closing = useCallback((id: number) => {
    setHosts(h => h.filter(x => x !== id));
    setClosingHosts(c => [...c.filter(x => x !== id), id]);
    setTimeout(() => closed(id), CLOSING_FALLBACK_MS);
  }, [closed]);
  const top = hosts.length ? hosts[hosts.length - 1] : null;
  const hostState = useMemo(() => ({ opts, close, top, open, closing, closed }), [opts, close, top, open, closing, closed]);
  return (
    <ConfirmContext.Provider value={show}>
      <HostContext.Provider value={hostState}>
        {children}
        <ConfirmDialog visible={!!opts && top === null && closingHosts.length === 0} options={opts} onClose={close} />
      </HostContext.Provider>
    </ConfirmContext.Provider>
  );
}

let nextHostId = 1;

/**
 * Låter en modal visa bekräftelser INNE i sig, på iOS.
 *
 * En <Modal> på iOS presenteras av vy-controllern som äger vyn — för rotens
 * dialog alltså rot-controllern. Visar den redan ett ark vägrar UIKit att visa
 * något mer, tyst, och RN tror ändå att dialogen syns. "Slänga utkastet?"
 * syntes därför aldrig över ett ark med text i: arket gick inte att stänga,
 * bara att spara (iOS-testare 2026-10-12). Samma sak när en dialog öppnas
 * medan arket animeras ut. Därför:
 *   - medan modalen är öppen visas dialogen härinne (arkets controller visar den)
 *   - när den stängs väntar rotens dialog på onDismiss innan den visas.
 * Android har ett fönster per modal och klarar sig utan.
 *
 *   const host = useConfirmHost(visible);
 *   <Modal visible={visible} onDismiss={host.onDismiss}>… {host.dialog}</Modal>
 */
export function useConfirmHost(visible: boolean): { dialog: ReactNode; onDismiss: () => void } {
  const ctx = useContext(HostContext);
  const id = useRef(nextHostId++).current;
  const active = Platform.OS === 'ios' && !!ctx;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (visible) { ctx!.open(id); wasOpen.current = true; }
    else if (wasOpen.current) { ctx!.closing(id); wasOpen.current = false; }
    // open/closing är stabila.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, visible, id]);
  // Avmonteras arket medan det är öppet räknas det som stängt.
  useEffect(() => () => {
    if (active && wasOpen.current) ctx!.closing(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onDismiss = useCallback(() => { if (active) ctx!.closed(id); }, [active, ctx, id]);
  const dialog = active && visible && ctx!.top === id
    ? <ConfirmDialog visible={!!ctx!.opts} options={ctx!.opts} onClose={ctx!.close} />
    : null;
  return { dialog, onDismiss };
}
