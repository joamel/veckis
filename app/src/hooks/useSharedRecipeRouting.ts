import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { sharedRecipeDraft } from '../lib/sharedRecipe';

/**
 * Tar emot det som delats till Handlis från en annan app och öppnar
 * receptfliken med det ifyllt: en länk i "Hämta från länk", en text i
 * "Klistra in". Delningen nollställs direkt, så den inte öppnas igen när
 * appen kommer tillbaka från bakgrunden.
 */
export function useSharedRecipeRouting() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (!hasShareIntent) return;
    const draft = sharedRecipeDraft(shareIntent);
    resetShareIntent();
    if (!draft) return;
    router.push({
      pathname: '/(tabs)/recipes',
      params: draft.mode === 'url' ? { sharedUrl: draft.url } : { sharedText: draft.text },
    } as never);
  }, [hasShareIntent, shareIntent, resetShareIntent, router]);
}
