import { useEffect, useMemo, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '../context/ThemeContext';

// Dra nedåt (i handtaget) för att stänga en bottom-sheet, i stället för att
// bara kunna trycka utanför. RN:s <Modal> renderas i ett eget nativt fönster
// UTANFÖR appens GestureHandlerRootView, så gesten registreras aldrig om vi
// inte bäddar in en egen härinne (samma fälla som redan dokumenterats i
// menu.tsx:s bulk-överförings-sheet).
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

export function DraggableBottomSheet({
  visible,
  onRequestClose,
  onOverlayPress,
  children,
  liftOffset = 0,
  sheetStyle,
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
  children: ReactNode;
  /** Px som skjuter sheeten uppåt, ihoplagt med ett pågående drag.
   *
   *  Detta är ENDA sättet att hålla ett textfält synligt ovanför tangentbordet
   *  här. KeyboardAvoidingView fanns tidigare som alternativ men togs bort:
   *  behavior "height" krympte arket och lämnade ett tomrum när tangentbordet
   *  stängdes, och "padding" hjälpte inte. Använd useSheetLift, som mäter det
   *  fokuserade fältet och lyfter precis så mycket att det syns. */
  liftOffset?: number;
  /** Skärmens egen `s.sheet`-stil (bakgrund, rundade hörn, padding). */
  sheetStyle?: StyleProp<ViewStyle>;
}) {
  const { colors: c } = useTheme();
  const translateY = useSharedValue(0);

  // Nollställ dragläget varje gång sheeten öppnas på nytt (annars kan den
  // dyka upp halvvägs nedskjuten om den stängdes via drag förra gången).
  useEffect(() => {
    if (visible) translateY.value = 0;
  }, [visible, translateY]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate(e => {
          translateY.value = Math.max(0, e.translationY);
        })
        .onEnd(e => {
          if (translateY.value > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
            translateY.value = withTiming(600, { duration: 180 }, finished => {
              if (finished) runOnJS(onRequestClose)();
            });
          } else {
            translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
          }
        }),
    [onRequestClose, translateY],
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value - liftOffset }],
  }), [liftOffset]);

  const content = (
    <>
      <Pressable style={styles.overlayTap} onPress={onOverlayPress ?? onRequestClose} />
      {/* Vit bakgrund som default — den ligger FÖRST i arrayen, så en anropare
          som skickar egen backgroundColor i sheetStyle vinner fortfarande. Utan
          defaulten fick varje sheet komma ihåg den själv, och två (mall- och
          notismodalen) hade råkat sätta beige i stället. */}
      <Animated.View style={[{ backgroundColor: c.surface }, sheetStyle, sheetAnimStyle]}>
        <GestureDetector gesture={pan}>
          <View style={[styles.handleHitArea]}>
            <View style={[styles.handle, { backgroundColor: c.border }]} />
          </View>
        </GestureDetector>
        {children}
      </Animated.View>
    </>
  );

  return (
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={onRequestClose}>
      <GestureHandlerRootView style={styles.fill}>
        <View pointerEvents="none" style={styles.overlayDim} />
        {content}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fillAbsolute: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  overlayTap: { flex: 1 },
  // Handtaget har en generös osynlig träffyta (inte bara den smala synliga
  // stapeln) så draget är lätt att träffa med tummen.
  handleHitArea: { alignItems: 'center', paddingVertical: 8, marginBottom: 4, paddingTop: 20 },
  handle: { width: 40, height: 4, borderRadius: 2 },
});
