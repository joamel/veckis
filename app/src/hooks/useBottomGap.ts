import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bottomGapFor } from '../lib/bottomGap';

/**
 * Avstånd till skärmens underkant för något som ligger fast där, med
 * systemets navigeringsrad inräknad. Se `lib/bottomGap.ts` för varför.
 *
 * Flikskärmarna klarade sig utan den här eftersom flikraden redan lägger på
 * `insets.bottom` — felet fanns bara i vyer som pushas ovanpå: butiken,
 * butikslistan, kontot, inställningarna.
 */
export function useBottomGap(bas = 20): number {
  const insets = useSafeAreaInsets();
  return bottomGapFor(bas, insets.bottom);
}
