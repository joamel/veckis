import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from '../lib/secureStorage';

export type ReceptVy = 'bild' | 'kompakt';

interface DesignContextValue {
  /** Alltid true — se DesignProvider. Kvar tills de gamla stilgrenarna är
   *  bortstädade, så inga anrop behöver skrivas om i samma veva. */
  nyDesign: boolean;
  /** Receptlistans visning. */
  receptVy: ReceptVy;
  setReceptVy: (v: ReceptVy) => void;
}

const DesignCtx = createContext<DesignContextValue | null>(null);
const NYCKEL_RECEPT_VY = 'receptVy';

// Nya designen är inte längre en beta som kan stängas av — den ÄR appens
// utseende. Den sparade inställningen läses med flit INTE längre: enheter som
// hade togglat av hade ett '0' liggande och skulle annars ha slagit tillbaka
// till den gamla designen. Flaggan finns kvar i kontexten så länge de gamla
// stilgrenarna gör det; de städas bort när sista vyn är omgjord.
export function DesignProvider({ children }: { children: ReactNode }) {
  const nyDesign = true;
  const [receptVy, setReceptVyState] = useState<ReceptVy>('bild');

  useEffect(() => {
    SecureStore.getItemAsync(NYCKEL_RECEPT_VY).then(v => { if (v === 'bild' || v === 'kompakt') setReceptVyState(v); }).catch(() => {});
  }, []);

  const value = useMemo<DesignContextValue>(() => ({
    nyDesign,
    receptVy,
    setReceptVy: (v: ReceptVy) => {
      setReceptVyState(v);
      SecureStore.setItemAsync(NYCKEL_RECEPT_VY, v).catch(() => {});
    },
  }), [receptVy]);

  return <DesignCtx.Provider value={value}>{children}</DesignCtx.Provider>;
}

export function useDesign(): DesignContextValue {
  const ctx = useContext(DesignCtx);
  if (!ctx) throw new Error('useDesign must be used within DesignProvider');
  return ctx;
}
