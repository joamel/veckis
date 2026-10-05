import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Släcker skärmen när närhetssensorn är täckt (i fickan) och tänder den igen
// när den blir fri — samma mekanism som under ett telefonsamtal. Telefonen
// låses inte, och en släckt skärm tar inte emot tryck.
//
// iOS: UIDevice.isProximityMonitoringEnabled.
// Android: PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK.
//
// Valfri: byggen från före modulen (och webben) saknar den, och då blir allt
// här no-op. Därför kan JS-sidan gå ut som OTA före nästa native-bygge.

interface ProximityScreenNative {
  isAvailable(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
}

const native = Platform.OS === 'web'
  ? null
  : requireOptionalNativeModule<ProximityScreenNative>('ProximityScreen');

/** Finns modulen OCH har enheten en närhetssensor? */
export async function isProximityScreenAvailable(): Promise<boolean> {
  if (!native) return false;
  try { return await native.isAvailable(); } catch { return false; }
}

export function setProximityScreenEnabled(enabled: boolean): void {
  native?.setEnabled(enabled).catch(() => { /* best-effort */ });
}

/** Diagnos för inställningarnas sidfot: finns modulen alls (= nytt nog
 *  native-bygge) och svarar enheten att sensorn stöds? */
export async function proximityScreenStatus(): Promise<'saknas' | 'stöds ej' | 'ok'> {
  if (!native) return 'saknas';
  return (await isProximityScreenAvailable()) ? 'ok' : 'stöds ej';
}
