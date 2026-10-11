import { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';
import * as SecureStore from '../lib/secureStorage';

export const HAPTIC_CHECKOUT_KEY = 'haptic-checkout';
export const SOUND_CHECKOUT_KEY = 'sound-checkout';

export function useCheckHaptic() {
  const hapticEnabledRef = useRef(true);
  const soundEnabledRef = useRef(true);
  const checkSoundRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync(HAPTIC_CHECKOUT_KEY).then(v => {
      hapticEnabledRef.current = v !== '0';
    }).catch(() => {});

    SecureStore.getItemAsync(SOUND_CHECKOUT_KEY).then(v => {
      soundEnabledRef.current = v !== '0';
    }).catch(() => {});

    if (Platform.OS as any !== 'web') {
      // Samma beteende som med expo-av: tyst läge på iPhone tystar klicket,
      // och musik som redan spelas fortsätter (blandas, avbryts inte).
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
      try {
        const player = createAudioPlayer(require('../../assets/sounds/check.wav'));
        player.volume = 0.7;
        checkSoundRef.current = player;
      } catch { /* inget ljud — bocken fungerar ändå */ }
    }

    return () => {
      checkSoundRef.current?.remove();
      checkSoundRef.current = null;
    };
  }, []);

  function play(player: AudioPlayer | null) {
    if (!soundEnabledRef.current || Platform.OS as any === 'web' || !player) return;
    player.seekTo(0).then(() => player.play()).catch(() => {});
  }

  const triggerCheck = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS as any === 'web') return;
    if (hapticEnabledRef.current) Haptics.impactAsync(style).catch(() => {});
    play(checkSoundRef.current);
  };

  const triggerDelete = () => {
    if (Platform.OS as any === 'web') return;
    if (hapticEnabledRef.current) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  return { triggerCheck, triggerDelete };
}
