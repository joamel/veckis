import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import * as SecureStore from '../lib/secureStorage';
import { paletteFor, type Palette, type ThemeScheme } from '../lib/theme';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  /** Aktiv palett (efter system-upplösning). */
  colors: Palette;
  /** Faktiskt aktivt schema. */
  scheme: ThemeScheme;
  /** Användarens val: följ systemet, eller tvinga ljust/mörkt. */
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
}

const ThemeCtx = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'themeMode';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [osScheme, setOsScheme] = useState<ThemeScheme>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );

  // Ladda sparat val en gång.
  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then(v => { if (v === 'light' || v === 'dark' || v === 'system') setModeState(v); })
      .catch(() => {});
  }, []);

  // Följ OS-temat (används när mode === 'system').
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setOsScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, []);

  function setMode(m: ThemeMode) {
    setModeState(m);
    SecureStore.setItemAsync(STORAGE_KEY, m).catch(() => {});
  }

  const scheme: ThemeScheme = mode === 'system' ? osScheme : mode;
  const value = useMemo<ThemeContextValue>(
    () => ({ colors: paletteFor(scheme), scheme, mode, setMode }),
    [scheme, mode],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
