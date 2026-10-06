import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useConfirm } from '../context/ConfirmContext';
import { useDiscardDraft } from '../hooks/useDiscardDraft';
import {
  Modal,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Pressable } from './Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useNy } from '../context/ThemeContext';
import { SheetHandle, SheetHeader } from './SheetHeader';
import { shouldDismissSheet } from '../lib/sheetDismiss';

// Dra nedåt (i handtaget) för att stänga en bottom-sheet, i stället för att
// bara kunna trycka utanför. RN:s <Modal> renderas i ett eget nativt fönster
// UTANFÖR appens GestureHandlerRootView, så gesten registreras aldrig om vi
// inte bäddar in en egen härinne (samma fälla som redan dokumenterats i
// menu.tsx:s bulk-överförings-sheet).
//
// Greppytan är HELA det mörka huvudet (handtag + rubrikrad), inte bara
// handtaget — testare missade den lilla remsan och fick försöka flera gånger.
// Svep inne i kroppen rör fortfarande bara innehållet. När släppet stänger
// avgörs i shouldDismissSheet (lib/sheetDismiss.ts) — förlåtande åt båda håll.

export function DraggableBottomSheet({
  visible,
  onRequestClose,
  onOverlayPress,
  children,
  liftOffset = 0,
  sheetStyle,
  bodyStyle,
  title,
  subtitle,
  headerLeft,
  headerRight,
  isDirty = false,
  onDragClose,
}: {
  visible: boolean;
  /** Hårdvaru-back, dra-i-handtaget och (om `onOverlayPress` inte satts) tryck
   *  utanför — den "normala" vägen ut. */
  onRequestClose: () => void;
  /** Sätt bara om tryck UTANFÖR ska göra något ANNAT än `onRequestClose` (t.ex.
   *  en flerstegs-sheet där back/drag stegar tillbaka ETT steg men tryck
   *  utanför avbryter hela flödet direkt). Annars faller den tillbaka på
   *  `onRequestClose`. */
  onOverlayPress?: () => void;
  /** Sätt om ett drag nedåt ska stänga HELA arket när `onRequestClose` bara
   *  stegar tillbaka (t.ex. kategoribläddraren: back går från underkategori
   *  till kategorier, men den som sveper ned vill bort). Annars används
   *  `onRequestClose`. */
  onDragClose?: () => void;
  children: ReactNode;
  /** Px som skjuter sheeten uppåt, ihoplagt med ett pågående drag.
   *
   *  Detta är ENDA sättet att hålla ett textfält synligt ovanför tangentbordet
   *  här. KeyboardAvoidingView fanns tidigare som alternativ men togs bort:
   *  behavior "height" krympte arket och lämnade ett tomrum när tangentbordet
   *  stängdes, och "padding" hjälpte inte. Använd useSheetLift, som mäter det
   *  fokuserade fältet och lyfter precis så mycket att det syns. */
  liftOffset?: number;
  /** Arkets yttre ram — bara maxHeight och liknande. Bakgrund, rundning och
   *  padding sköts här, så att alla ark ser likadana ut. */
  sheetStyle?: StyleProp<ViewStyle>;
  /** Den ljusa kroppen under huvudet. Default: 24 px sidomarginal, 20 ovanför,
   *  säkerhetszonen + 24 under. Skriv över för rader som ska gå kant i kant. */
  bodyStyle?: StyleProp<ViewStyle>;
  /** Rubrik i arkets mörka huvud. Utan rubrik blir huvudet bara handtaget. */
  title?: string;
  subtitle?: string;
  /** T.ex. en tillbakapil före rubriken. Ikonfärg: SHEET_HEADER_ICON. */
  headerLeft?: ReactNode;
  /** T.ex. en stängknapp efter rubriken. */
  headerRight?: ReactNode;
  /** Arket har osparade ändringar. Då frågar ALLA stängningsvägar — drag,
   *  tryck utanför och bakåtknapp — "Vill du slänga utkastet?" innan de
   *  stänger. Ett ark är lokalt tillstånd utan navigering, så frågan är
   *  pålitlig här (till skillnad från helskärmsvyer, som får utkast i stället).
   *  Påverkar inte `onOverlayPress`: flerstegs-ark som satt den styr själva. */
  isDirty?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const translateY = useSharedValue(0);

  // Refs i stället för deps: useDiscardDraft returnerar en ny funktion varje
  // render, och drag-gesten nedan får inte byggas om vid varje render — det
  // har tidigare gjort draget instabilt mitt i en rörelse.
  const ny = useNy();
  const confirm = useConfirm();
  const tryClose = useDiscardDraft(confirm);
  const guardRef = useRef({ isDirty, onRequestClose, onDragClose, tryClose });
  guardRef.current = { isDirty, onRequestClose, onDragClose, tryClose };
  const guardedClose = useCallback((fromDrag = false) => {
    const g = guardRef.current;
    const close = (fromDrag && g.onDragClose) || g.onRequestClose;
    if (g.isDirty) g.tryClose(true, close);
    else close();
  }, []);

  // Nollställ dragläget varje gång sheeten öppnas på nytt (annars kan den
  // dyka upp halvvägs nedskjuten om den stängdes via drag förra gången).
  useEffect(() => {
    if (visible) translateY.value = 0;
  }, [visible, translateY]);

  // Ett drag nedåt animerar arket ut ur bild och ber sedan föräldern stänga.
  // Men alla föräldrar stänger inte: en flerstegs-sheet (t.ex. bulk-överföringen
  // i veckomenyn) tolkar drag som "ett steg tillbaka" och låter visible förbli
  // true. Då låg arket kvar UTANFÖR bild medan modalens grå overlay täckte
  // skärmen — ingenting gick att trycka på förrän man svepte bakåt.
  //
  // Räknaren gör att effekten nedan körs EFTER att förälderns svar renderats,
  // så den ser det faktiska visible-värdet. Är arket fortfarande öppet fjädrar
  // det tillbaka.
  const [dragCloseTick, setDragCloseTick] = useState(0);
  // Samma mekanism täcker isDirty: väljer användaren "Fortsätt redigera" i
  // frågan förblir visible true, och arket fjädrar tillbaka medan dialogen syns.
  const closeFromDrag = useCallback(() => {
    guardedClose(true);
    setDragCloseTick(t => t + 1);
  }, [guardedClose]);
  useEffect(() => {
    if (dragCloseTick > 0 && visible) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
    }
    // visible avsiktligt utanför deps: effekten ska bara reagera på ett avslutat
    // drag, inte på varje öppning (det sköter effekten ovan).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragCloseTick]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Aktiveras först vid en tydlig rörelse nedåt, så att tryck på
        // knapparna i rubrikraden (tillbaka, stäng) går igenom som vanligt.
        .activeOffsetY(8)
        .failOffsetX([-24, 24])
        .onUpdate(e => {
          translateY.value = Math.max(0, e.translationY);
        })
        .onEnd(e => {
          if (shouldDismissSheet(translateY.value, e.velocityY)) {
            // Hela vägen ut (inte en fast sträcka — ett högt ark syntes förr
            // kvar och åkte sedan ut en gång till med modalens egen animation).
            translateY.value = withTiming(windowHeight, { duration: 200 }, finished => {
              if (finished) runOnJS(closeFromDrag)();
            });
          } else {
            translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
          }
        }),
    [closeFromDrag, translateY, windowHeight],
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value - liftOffset }],
  }), [liftOffset]);

  // Skuggan tonar i takt med draget. Annars låg den kvar när arket dragits ut
  // och gled sedan ned för sig med modalens slide — det såg ut som att arket
  // stängdes två gånger.
  const dimAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, windowHeight * 0.6], [1, 0], Extrapolation.CLAMP),
  }), [windowHeight]);

  const content = (
    <>
      <Pressable style={styles.overlayTap} onPress={onOverlayPress ?? (() => guardedClose())} />
      {/* Alla ark har samma anatomi: mörkgrönt huvud (handtag + rubrik) och
          ljusgrön kropp. Samma huvud används av ConfirmDialog. */}
      <Animated.View style={[styles.sheet, { backgroundColor: ny.kort }, sheetStyle, sheetAnimStyle]}>
        <GestureDetector gesture={pan}>
          <View collapsable={false}>
            <SheetHeader
              title={title}
              subtitle={subtitle}
              left={headerLeft}
              right={headerRight}
              handle={<SheetHandle />}
            />
          </View>
        </GestureDetector>
        <View style={[styles.body, { paddingBottom: insets.bottom + 24 }, bodyStyle]}>
          {children}
        </View>
      </Animated.View>
    </>
  );

  return (
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={() => guardedClose()}>
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View pointerEvents="none" style={[styles.overlayDim, dimAnimStyle]} />
        {content}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  overlayTap: { flex: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  body: { paddingHorizontal: 24, paddingTop: 20, flexShrink: 1 },
});
