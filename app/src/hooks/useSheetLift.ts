import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Platform, useWindowDimensions } from 'react-native';
import type { TextInput } from 'react-native';
import { skapaLyftberäknare } from '../lib/lyftberakning';

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
  // Extra px att visa UNDER det fokuserade fältet — t.ex. enhets-chipsraden som
  // ligger under mängd/enhet-inputen och annars hamnar bakom tangentbordet.
  const revealBelowRef = useRef(0);
  const [sheetLift, setSheetLift] = useState(0);
  // Spegel av det RENDERADE lyftet. setSheetLift(prev => …) duger inte för
  // uträkningen nedan: prev är Reacts senaste värde, medan measureInWindow
  // kan ha läst en y som ännu inte flyttats av det värdet.
  const liftRef = useRef(0);
  useEffect(() => { liftRef.current = sheetLift; }, [sheetLift]);
  // Låser fältets naturliga (olyfta) botten per fokus, så att de fyra
  // mätningarna nedan inte kan addera lyftet flera gånger. Se lyftberakning.ts.
  const beräknareRef = useRef(skapaLyftberäknare());

  const revealFocused = useCallback(() => {
    if (Platform.OS as any === 'web' || kbHeightRef.current === 0) return;
    const ref = focusedInputRef.current;
    if (!ref) return;
    // OBS: Keyboard.metrics() ger höjd 0 på huvudfönstret under edge-to-edge
    // (samma skäl som keyboardDidShow.height=0 där) → använd det cachade värdet
    // från keyboardDidShow, som fungerar i modalernas egna fönster.
    const measure = () => {
      // Tangentbordet kan ha stängts medan mätningen väntade (race mot
      // keyboardDidHide som nollställer lyftet) → mät inte då.
      if (kbHeightRef.current === 0) return;
      ref.measureInWindow((_x, y, _w, h) => {
        // measureInWindow är async → dubbelkolla att tangentbordet är kvar, och
        // hoppa över uppenbart felaktiga (0,0)-mätningar (fält ännu ej utlagt →
        // annars räknas det som "synligt" och lyfts inte, t.ex. enhet-fältet).
        if (kbHeightRef.current === 0 || (y === 0 && h === 0)) return;
        setSheetLift(beräknareRef.current.beräkna(
          { y, h, renderatLyft: liftRef.current },
          { windowHeight, kbHöjd: kbHeightRef.current, revealBelow: revealBelowRef.current },
        ));
      });
    };
    // Mät två gånger: 260ms låter Modal-slide + tangentbord animera klart; 520ms
    // fångar fält som layoutas om sent (flex-fält i en rad, t.ex. enhet) där
    // första mätningen annars ger ett övergångsvärde och fältet inte lyfts.
    setTimeout(measure, 260);
    setTimeout(measure, 520);
  }, [windowHeight]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => { kbHeightRef.current = e.endCoordinates?.height ?? 0; revealFocused(); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { kbHeightRef.current = 0; beräknareRef.current.nollställ(); setSheetLift(0); });
    return () => { show.remove(); hide.remove(); };
  }, [revealFocused]);

  // Nollställ när appen lämnas.
  //
  // Lyftet nollställdes bara av keyboardDidHide, och den avfyras inte
  // tillförlitligt när appen bakgrundas med tangentbordet uppe. Värdet låg då
  // kvar, och när man kom tillbaka stod modalen lyft fast tangentbordet var
  // borta. Nästa fokus mäter om från noll, så ingenting går förlorat.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      kbHeightRef.current = 0;
      focusedInputRef.current = null;
      beräknareRef.current.nollställ();
      setSheetLift(0);
    });
    return () => sub.remove();
  }, []);

  // revealBelow: extra px att hålla synliga under fältet (t.ex. enhets-chipsen).
  const onFocusInput = useCallback(
    (ref: React.RefObject<TextInput | null>, revealBelow = 0) => () => {
      focusedInputRef.current = ref.current;
      revealBelowRef.current = revealBelow;
      beräknareRef.current.nollställ();
      revealFocused();
    },
    [revealFocused],
  );

  return { sheetLift, onFocusInput };
}
