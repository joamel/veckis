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
    // 260ms delay: låt Modal-slide-in + tangentbordet animera klart först, annars
    // mäts fältet för lågt (mitt i sliden) → över-lyft.
    setTimeout(() => {
      // Tangentbordet kan ha stängts medan mätningen väntade (race mot
      // keyboardDidHide som nollställer lyftet) → mät inte då, annars sätts ett
      // "fast" lyft tillbaka och sheeten svävar med luft under.
      if (kbHeightRef.current === 0) return;
      // Läs tangentbordets AKTUELLA höjd (Keyboard.metrics) i stället för det
      // cachade keyboardDidShow-värdet. Byter man fält och tangentbordstypen
      // ändras (sifferblock → qwerty i mängd-modalen) växer tangentbordet, men
      // cachen ligger kvar på den lägre höjden → fältet räknas som synligt och
      // hamnar bakom det högre qwerty. metrics() speglar den settlade höjden.
      const kbH = Keyboard.metrics()?.height ?? kbHeightRef.current;
      // measureInWindow ger positionen MED nuvarande lyft applicerat → naturlig
      // botten = y + prev + h. Räkna mål-lyftet absolut (idempotent), klampat.
      ref.measureInWindow((_x, y, _w, h) => {
        // measureInWindow är async (native bridge) → tangentbordet kan ha stängts
        // MEDAN mätningen pågick. Kolla igen, annars sätts ett fast lyft tillbaka
        // efter keyboardDidHide nollställt → sheeten svävar med luft under.
        if (kbHeightRef.current === 0) return;
        setSheetLift(prev => Math.max(0, Math.min((y + prev + h + 20) - (windowHeight - kbH), windowHeight * 0.6)));
      });
    }, 260);
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
