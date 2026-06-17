import { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import * as SecureStore from '../lib/secureStorage';

export const HAPTIC_CHECKOUT_KEY = 'haptic-checkout';
export const SOUND_CHECKOUT_KEY = 'sound-checkout';

// Returns a stable trigger function — fires haptic + sound when item is checked off.
// Reads user preferences once on mount; subsequent calls are synchronous.
export function useCheckHaptic() {
  const hapticEnabledRef = useRef(true);
  const soundEnabledRef = useRef(true);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(HAPTIC_CHECKOUT_KEY).then(v => {
      hapticEnabledRef.current = v !== '0';
    }).catch(() => {});

    SecureStore.getItemAsync(SOUND_CHECKOUT_KEY).then(v => {
      soundEnabledRef.current = v !== '0';
    }).catch(() => {});

    if (Platform.OS !== 'web') {
      Audio.Sound.createAsync(
        require('../../assets/sounds/check.wav'),
        { shouldPlay: false, volume: 0.6 },
      ).then(({ sound }) => {
        soundRef.current = sound;
      }).catch(() => {});
    }

    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  return (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== 'web') {
      if (hapticEnabledRef.current) {
        Haptics.impactAsync(style).catch(() => {});
      }
      if (soundEnabledRef.current && soundRef.current) {
        soundRef.current.setPositionAsync(0).then(() => {
          soundRef.current?.playAsync().catch(() => {});
        }).catch(() => {});
      }
    }
  };
}
