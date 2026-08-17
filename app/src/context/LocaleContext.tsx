import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from '../lib/secureStorage';
import { getLocale, setLocale as setModuleLocale, type Locale } from '../lib/svenska';

export type { Locale };

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const LocaleCtx = createContext<LocaleContextValue | null>(null);
const STORAGE_KEY = 'locale';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getLocale());

  // Ladda sparat språkval en gång.
  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then(v => {
        if (v === 'sv' || v === 'en') {
          setModuleLocale(v);
          setLocaleState(v);
        }
      })
      .catch(() => {});
  }, []);

  function setLocale(l: Locale) {
    setModuleLocale(l);       // proxy-facaden pekar nu om
    setLocaleState(l);        // triggar omrendering + key-remount i _layout
    SecureStore.setItemAsync(STORAGE_KEY, l).catch(() => {});
  }

  return <LocaleCtx.Provider value={{ locale, setLocale }}>{children}</LocaleCtx.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleCtx);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
