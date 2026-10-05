import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from '../lib/secureStorage';
import { setProximityScreenEnabled } from '../../modules/proximity-screen';

/** '0' = av. Saknas nyckeln är funktionen på. */
export const PROXIMITY_SCREEN_KEY = 'proximityScreen';

/**
 * Släcker skärmen i fickan medan `active` är sant — inköpslistan skickar in
 * "jag handlar". Utan det låg en upplåst mobil i fickan och bockade av, eller
 * svepte bort, varor av sig själv. Telefonen låses inte: skärmen tänds direkt
 * när man tar upp den.
 *
 * Bara medan appen är i förgrunden, och av så fort man släpper listan — annars
 * kunde skärmen slockna helt utanför butiken. Inställningen läses om vid fokus,
 * så en ändring i Inställningar gäller när man kommer tillbaka till listan.
 */
export function useProximityScreen(active: boolean): void {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useFocusEffect(useCallback(() => {
    SecureStore.getItemAsync(PROXIMITY_SCREEN_KEY)
      .then(v => setEnabled(v !== '0'))
      .catch(() => setEnabled(true));
  }, []));

  useEffect(() => {
    if (!active || !enabled) return;
    const apply = (state: AppStateStatus) => setProximityScreenEnabled(state === 'active');
    apply(AppState.currentState);
    const sub = AppState.addEventListener('change', apply);
    return () => {
      sub.remove();
      setProximityScreenEnabled(false);
    };
  }, [active, enabled]);
}
