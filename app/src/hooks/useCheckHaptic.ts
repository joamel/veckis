import { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import * as SecureStore from '../lib/secureStorage';

export const HAPTIC_CHECKOUT_KEY = 'haptic-checkout';

// Returns a stable trigger function — fires Light impact when item is checked off.
// Reads the user preference once on mount; subsequent calls are synchronous.
export function useCheckHaptic() {
  const enabledRef = useRef(true);
  useEffect(() => {
    SecureStore.getItemAsync(HAPTIC_CHECKOUT_KEY).then(v => {
      enabledRef.current = v !== '0';
    }).catch(() => {});
  }, []);

  return (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (!enabledRef.current || Platform.OS === 'web') return;
    Haptics.impactAsync(style).catch(() => {});
  };
}
