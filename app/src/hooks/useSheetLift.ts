import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';
import type { TextInput } from 'react-native';

/**
 * Scroll-into-view-lyft för bottom-sheet-modaler med tangentbord.
 *
 * I stället för att lyfta hela sheeten med tangentbordshöjden (då flyger höga
 * modaler upp förbi skärmtoppen) mäter vi det fokuserade fältet och lyfter BARA
 * så mycket att fältet syns ovanför tangentbordet. Lyftet räknas om både när
 * tangentbordet visas OCH när man byter fält medan det redan är uppe. Nollställs
 * rent vid keyboardDidHide. På web görs inget lyft (browsern resizar viewporten).
 *
 * Användning:
 *   const { sheetLift, onFocusInput } = useSheetLift();
 *   <View style={{ paddingBottom: sheetLift }}>...sheet...</View>
 *   <TextInput ref={nameRef} onFocus={onFocusInput(nameRef)} />
 */
export function useSheetLift() {
  const { height: windowHeight } = useWindowDimensions();
  const focusedInputRef = useRef<TextInput | null>(null);
  const kbHeightRef = useRef(0);
  const [sheetLift, setSheetLift] = useState(0);

  const revealFocused = useCallback(() => {
    if (Platform.OS === 'web' || kbHeightRef.current === 0) return;
    const ref = focusedInputRef.current;
    if (!ref) return;
    const kbH = Math.min(kbHeightRef.current, windowHeight * 0.5);
    // measureInWindow ger positionen MED nuvarande lyft applicerat → naturlig
    // botten = y + prev + h. Räkna mål-lyftet absolut (idempotent), klampat.
    // 260ms delay: låt Modal-slide-in + autoFocus-tangentbordet animera klart
    // först, annars mäts fältet för lågt (mitt i sliden) → över-lyft.
    setTimeout(() => ref.measureInWindow((_x, y, _w, h) => {
      setSheetLift(prev => Math.max(0, Math.min((y + prev + h + 20) - (windowHeight - kbH), windowHeight * 0.5)));
    }), 260);
  }, [windowHeight]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => { kbHeightRef.current = e.endCoordinates?.height ?? 0; revealFocused(); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { kbHeightRef.current = 0; setSheetLift(0); });
    return () => { show.remove(); hide.remove(); };
  }, [revealFocused]);

  const onFocusInput = useCallback(
    (ref: React.RefObject<TextInput | null>) => () => { focusedInputRef.current = ref.current; revealFocused(); },
    [revealFocused],
  );

  return { sheetLift, onFocusInput };
}
