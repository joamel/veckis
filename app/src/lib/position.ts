/**
 * Ungefärlig position, för att visa de matbutiker som ligger närmast.
 *
 * Bara GROV position: närmaste butik kräver ingen GPS, och appen ber därför
 * bara om ungefärlig plats (ACCESS_FINE_LOCATION är blockerad i app.json).
 *
 * På webben: webbläsarens geolocation. I appen: expo-location — men den är en
 * native-modul som kom med först efter bygge 15. Den laddas därför först när
 * den behövs, i en try: i en äldre binär saknas modulen, och då blir svaret
 * 'unavailable' så att skärmen erbjuder postnummer i stället för att krascha.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type PositionResult =
  | { status: 'ok'; lat: number; lon: number }
  /** canAskAgain: false = användaren har sagt nej för gott; bara
   *  telefonens inställningar kan ändra det. */
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'unavailable' };

/** En position från de senaste tio minuterna duger — butikerna flyttar inte. */
const MAX_ÅLDER_MS = 10 * 60 * 1000;

export async function getApproxPosition(): Promise<PositionResult> {
  if (Platform.OS === 'web') return webbPosition();

  // Fråga FÖRST om native-modulen finns, och ladda expo-location bara då.
  // Att ladda paketet och fånga felet var skört: det drar med sig flera filer
  // som alla försöker nå sin native-del, och i bygge 15 — där modulen saknas —
  // gav "Nära mig" en grå skärm i stället för postnummerfältet.
  if (!requireOptionalNativeModule('ExpoLocation')) return { status: 'unavailable' };
  let Location: typeof import('expo-location');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Location = require('expo-location');
  } catch {
    return { status: 'unavailable' };
  }
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { status: 'denied', canAskAgain: perm.canAskAgain };
    const senast = await Location.getLastKnownPositionAsync({ maxAge: MAX_ÅLDER_MS }).catch(() => null);
    const p = senast ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    return { status: 'ok', lat: p.coords.latitude, lon: p.coords.longitude };
  } catch {
    return { status: 'unavailable' };
  }
}

function webbPosition(): Promise<PositionResult> {
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  if (!geo) return Promise.resolve({ status: 'unavailable' });
  return new Promise(resolve => {
    geo.getCurrentPosition(
      p => resolve({ status: 'ok', lat: p.coords.latitude, lon: p.coords.longitude }),
      // Kod 1 = användaren sa nej. Allt annat (timeout, ingen signal) är
      // att positionen inte gick att få just nu.
      err => resolve(err.code === 1 ? { status: 'denied', canAskAgain: false } : { status: 'unavailable' }),
      { enableHighAccuracy: false, maximumAge: MAX_ÅLDER_MS, timeout: 15000 },
    );
  });
}
