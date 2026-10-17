import { getShareExtensionKey } from 'expo-share-intent';

// En delning till Handlis öppnar appen via en djuplänk (handlis://dataUrl=…).
// Utan det här försökte routern visa den som en sida och landade i "finns
// inte". Själva innehållet hämtas av ShareIntentProvider, och
// useSharedRecipeRouting fyller i receptet.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return '/(tabs)/recipes';
    return path;
  } catch {
    return '/';
  }
}
