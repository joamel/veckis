import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as SecureStore from './secureStorage';

// Antal avslutade "Jag handlar"-turer innan vi ber om betyg. Efter tredje
// turen har man haft nytta av listan på riktigt — tidigare vore att be om
// betyg för något man inte hunnit testa.
const TRIPS_BEFORE_ASKING = 3;
const TRIPS_KEY = 'review-shop-trips';
const ASKED_KEY = 'review-asked';

/**
 * Räknar en avslutad handlingstur och ber om betyg i butiken när det är dags.
 * Frågas en gång per installation; iOS/Android begränsar dessutom själva hur
 * ofta dialogen syns och visar den kanske inte alls.
 *
 * expo-store-review kom med 2.3.0. En OTA till 2.2.0 saknar native-modulen,
 * och paketets import kastar då direkt — därför kollas modulen först och
 * paketet laddas lat.
 */
export async function recordShoppingTripAndMaybeAskForReview(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!requireOptionalNativeModule('ExpoStoreReview')) return;
  try {
    if ((await SecureStore.getItemAsync(ASKED_KEY)) === '1') return;
    const trips = Number((await SecureStore.getItemAsync(TRIPS_KEY)) ?? '0') + 1;
    await SecureStore.setItemAsync(TRIPS_KEY, String(trips));
    if (trips < TRIPS_BEFORE_ASKING) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const StoreReview: typeof import('expo-store-review') = require('expo-store-review');
    if (!(await StoreReview.hasAction())) return;
    await SecureStore.setItemAsync(ASKED_KEY, '1');
    await StoreReview.requestReview();
  } catch {
    // Betygsfrågan får aldrig störa handlingen.
  }
}
