/**
 * Larmet när en laga-timer slår om medan appen är öppen: pling och
 * vibration, om och om igen tills man reagerar — som en äggklocka. Förut
 * spelades avbockningsljudet "tre gånger" med samma spelare, men en spelare
 * som redan spelar startar inte om, så det blev ett enda kort pling.
 *
 * Tystnar när man trycker på klockan, stoppar timern eller öppnar laga-läget
 * (stoppaLarm), och av sig själv efter en minut. Notisen larmar när appen är
 * stängd. Ljudet följer telefonens tysta läge (ljudläget sätts i
 * useCheckHaptic); vibrationen kommer ändå.
 */
import { AppState, Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

const INTERVALL_MS = 3000;
const MAX_LÄNGD_MS = 60_000;

/** En timer som gick ut för mer än så länge sedan larmar inte — då öppnades
 *  appen långt efteråt, och notisen har redan sagt till. */
export const LARM_FÖNSTER_MS = 60_000;

let spelare: AudioPlayer | null = null;
let upprepning: ReturnType<typeof setInterval> | null = null;
let tidsgräns: ReturnType<typeof setTimeout> | null = null;

async function pip() {
  try {
    // Avbockningsljudet: ett eget pipljud provades (2026-10-26) men var
    // inte lika trevligt.
    spelare ??= createAudioPlayer(require('../../assets/sounds/check.wav'));
    spelare.volume = 1;
    // Spola tillbaka FÖRST och vänta in det: en spelare som står i slutet av
    // ljudet spelar annars ingenting.
    await spelare.seekTo(0);
    spelare.play();
  } catch { /* inget ljud — vibrationen räcker */ }
}

function ring() {
  // Android tar mönstret; iOS vibrerar en gång per anrop, så där kompletteras
  // med haptik.
  Vibration.vibrate([0, 400, 200, 400]);
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  void pip();
}

export function larmaTimer(): void {
  if ((Platform.OS as string) === 'web') return;
  if (upprepning) return; // ringer redan
  ring();
  upprepning = setInterval(ring, INTERVALL_MS);
  tidsgräns = setTimeout(stoppaLarm, MAX_LÄNGD_MS);
}

export function stoppaLarm(): void {
  if (!upprepning) return;
  clearInterval(upprepning);
  upprepning = null;
  if (tidsgräns) { clearTimeout(tidsgräns); tidsgräns = null; }
  Vibration.cancel();
  try { spelare?.pause(); } catch { /* redan tyst */ }
}

// Läggs appen undan tystnar den — notisen tar över därifrån.
AppState.addEventListener('change', s => { if (s !== 'active') stoppaLarm(); });

