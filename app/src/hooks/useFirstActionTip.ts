import { useCallback, useRef } from 'react';
import { useOnceFlag } from './useOnceFlag';
import { useSpotlightTip } from '../context/SpotlightTipContext';
import type { SpotlightOptions } from '../components/SpotlightTip';

/**
 * Hook för "kontextuella action-tips" (#C i onboarding-backloggen).
 *
 * Till skillnad från `useFocusEffect + useOnceFlag` (som fyrar passivt vid
 * mount av en flik) körs det här tipset först när användaren faktiskt
 * trycker en knapp — relevant och precis när det behövs.
 *
 * Returnerar en wrap-funktion: vagga din `onPress` i den. Första gången
 * användaren trycker visas tipset + originalets onPress kallas. Resten av
 * gångerna är det en helt vanlig onPress utan tip-overhead.
 *
 * @example
 * const wrapWithTip = useFirstActionTip('seen-recipe-add-tip');
 * <Pressable onPress={wrapWithTip(handleAdd, { title: '...', message: '...' })}>
 */
export function useFirstActionTip(flagKey: string) {
  const flag = useOnceFlag(flagKey);
  const showTip = useSpotlightTip();
  // Cache:a "shown" lokalt så vi inte triggar två gånger i samma session
  // även innan SecureStore-write:n hunnit landa.
  const localShownRef = useRef(false);

  return useCallback(
    <Args extends unknown[]>(originalHandler: (...args: Args) => void, tipOpts: SpotlightOptions) => {
      return (...args: Args) => {
        if (flag.seen === false && !localShownRef.current) {
          localShownRef.current = true;
          flag.markSeen();
          showTip(tipOpts);
        }
        originalHandler(...args);
      };
    },
    [flag, showTip],
  );
}
