import { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';
import * as SecureStore from '../lib/secureStorage';

export const HAPTIC_CHECKOUT_KEY = 'haptic-checkout';
export const SOUND_CHECKOUT_KEY = 'sound-checkout';

export function useCheckHaptic() {
  const hapticEnabledRef = useRef(true);
  const soundEnabledRef = useRef(true);
  const checkSoundRef = useRef<Audio.Sound | null>(null);
  const deleteSoundRef = useRef<Audio.Sound | null>(null);

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
        { shouldPlay: false, volume: 0.7 },
      ).then(({ sound }) => { checkSoundRef.current = sound; }).catch(() => {});

      Audio.Sound.createAsync(
        require('../../assets/sounds/delete.wav'),
        { shouldPlay: false, volume: 0.55 },
      ).then(({ sound }) => { deleteSoundRef.current = sound; }).catch(() => {});
    }

    return () => {
      checkSoundRef.current?.unloadAsync().catch(() => {});
      deleteSoundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  function play(soundRef: React.MutableRefObject<Audio.Sound | null>) {
    if (!soundEnabledRef.current || Platform.OS === 'web') return;
    soundRef.current?.setPositionAsync(0).then(() => {
      soundRef.current?.playAsync().catch(() => {});
    }).catch(() => {});
  }

  const triggerCheck = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS === 'web') return;
    if (hapticEnabledRef.current) Haptics.impactAsync(style).catch(() => {});
    play(checkSoundRef);
  };

  const triggerDelete = () => {
    if (Platform.OS === 'web') return;
    if (hapticEnabledRef.current) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    play(deleteSoundRef);
  };

  return { triggerCheck, triggerDelete };
}
