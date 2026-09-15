import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from '../lib/secureStorage';

export type ReceptVy = 'bild' | 'kompakt';

interface DesignContextValue {
  /** Inställningen "Ny design (beta)". */
  nyDesign: boolean;
  setNyDesign: (on: boolean) => void;
  /** Receptlistans visning i den nya designen. */
  receptVy: ReceptVy;
  setReceptVy: (v: ReceptVy) => void;
}

const DesignCtx = createContext<DesignContextValue | null>(null);
const NYCKEL_NY_DESIGN = 'nyDesignBeta';
const NYCKEL_RECEPT_VY = 'receptVy';

// Samma lagring som temavalet (ThemeContext): per enhet, inte per konto —
// betan är något man testar på just den här telefonen.
export function DesignProvider({ children }: { children: ReactNode }) {
  const [nyDesign, setNyDesignState] = useState(false);
  const [receptVy, setReceptVyState] = useState<ReceptVy>('bild');

  useEffect(() => {
    SecureStore.getItemAsync(NYCKEL_NY_DESIGN).then(v => { if (v === '1') setNyDesignState(true); }).catch(() => {});
    SecureStore.getItemAsync(NYCKEL_RECEPT_VY).then(v => { if (v === 'bild' || v === 'kompakt') setReceptVyState(v); }).catch(() => {});
  }, []);

  const value = useMemo<DesignContextValue>(() => ({
    nyDesign,
    setNyDesign: (on: boolean) => {
      setNyDesignState(on);
      SecureStore.setItemAsync(NYCKEL_NY_DESIGN, on ? '1' : '0').catch(() => {});
    },
    receptVy,
    setReceptVy: (v: ReceptVy) => {
      setReceptVyState(v);
      SecureStore.setItemAsync(NYCKEL_RECEPT_VY, v).catch(() => {});
    },
  }), [nyDesign, receptVy]);

  return <DesignCtx.Provider value={value}>{children}</DesignCtx.Provider>;
}

export function useDesign(): DesignContextValue {
  const ctx = useContext(DesignCtx);
  if (!ctx) throw new Error('useDesign must be used within DesignProvider');
  return ctx;
}
