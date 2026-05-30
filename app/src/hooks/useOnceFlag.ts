import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

/**
 * Persisted "have we shown this tip yet?" flag. Returns `seen: null` while the
 * value is being loaded so callers can avoid flashing the tip before we know.
 * Use one key per onboarding moment (e.g. "seen-forgiving-tip"); future tips
 * follow the same pattern.
 */
export function useOnceFlag(key: string): { seen: boolean | null; markSeen: () => void } {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(key)
      .then(v => setSeen(v === '1'))
      .catch(() => setSeen(false));
  }, [key]);

  const markSeen = useCallback(() => {
    setSeen(true);
    SecureStore.setItemAsync(key, '1').catch(() => { /* best-effort */ });
  }, [key]);

  return { seen, markSeen };
}
