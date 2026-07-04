// Animerad intro ovanpå native-splashen: overlayn matchar splashens bakgrund
// och ikon exakt, så övergången native-splash → JS-overlay är osynlig. Ikonen
// "andas" (skala upp → ner) medan overlayn tonar bort och avslöjar appen.
// Ren JS/Reanimated — ingen native-modul, OTA-säker. Total tid < 1 s och
// pointerEvents="none" så den aldrig blockerar interaktion.
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
export function AnimatedSplash() {
  const [gone, setGone] = useState(false);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withDelay(150, withSequence(
      withTiming(1.12, { duration: 320, easing: Easing.out(Easing.cubic) }),
      withTiming(0.9, { duration: 240, easing: Easing.in(Easing.cubic) }),
    ));
    opacity.value = withDelay(430, withTiming(0, { duration: 300 }, finished => {
      if (finished) runOnJS(setGone)(true);
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (gone) return null;
  return (
    <Animated.View style={[s.overlay, overlayStyle]} pointerEvents="none">
      <Animated.Image
        source={require('../../assets/splash-icon.png')}
        style={[s.icon, iconStyle]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FAF7F0', // samma som app.json splash.backgroundColor + loggans platta
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  icon: { width: 220, height: 220 },
});
