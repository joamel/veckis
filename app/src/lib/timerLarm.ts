/**
 * Larmet när en laga-timer slår om medan appen är öppen: vibration i ett
 * tydligt mönster och tre pling. Notisen larmar när appen är stängd; inne i
 * appen syntes förut bara en siffra som slog om till "Klart!" — lätt att missa
 * med händerna i degen.
 *
 * Ljudet följer telefonens tysta läge (playsInSilentMode: false i
 * useCheckHaptic, som sätter ljudläget för hela appen).
 */
import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

let spelare: AudioPlayer | null = null;

function plinga(gånger: number) {
  try {
    spelare ??= createAudioPlayer(require('../../assets/sounds/check.wav'));
    spelare.volume = 1;
    for (let i = 0; i < gånger; i++) {
      setTimeout(() => {
        try {
          if (spelare && spelare.currentTime > 0) void spelare.seekTo(0).catch(() => {});
          spelare?.play();
        } catch { /* ljudet är en bonus */ }
      }, i * 450);
    }
  } catch { /* inget ljud — vibrationen räcker */ }
}

export function larmaTimer(): void {
  if ((Platform.OS as string) === 'web') return;
  // Android tar mönstret; iOS vibrerar en gång per anrop, så där kompletteras
  // med haptik.
  Vibration.vibrate([0, 500, 250, 500, 250, 500]);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  plinga(3);
}

/** En timer som gick ut för mer än så länge sedan larmar inte — då öppnades
 *  appen långt efteråt, och notisen har redan sagt till. */
export const LARM_FÖNSTER_MS = 60_000;
