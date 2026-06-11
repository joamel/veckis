import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // Native: browser events unavailable — needs @react-native-community/netinfo + EAS build.
    // Web/PWA: navigator.onLine + browser events cover the offline-in-the-store scenario.
    if (Platform.OS !== 'web') return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
