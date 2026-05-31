import { type RefObject, useEffect, useRef } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SpotlightRect { x: number; y: number; width: number; height: number }

export interface SpotlightOptions {
  title: string;
  message?: string;
  /** A pre-measured rect for the spotlight. The provider measures the
   *  `targetRef` (passed by callers) before opening the modal so we never race
   *  the modal's mount against layout — by the time SpotlightTip renders we
   *  already have a valid rect (or `undefined`, in which case the tip just
   *  centers on full dim). */
  targetRef?: RefObject<View | null>;
  targetRect?: SpotlightRect;
  /** Show an animated "swipe" gesture demo above the title. */
  swipeDemo?: 'horizontal' | 'vertical';
  /** Label for the dismiss button. Defaults to "Förstått" or "Nästa tips →". */
  actionLabel?: string;
}

interface Props extends SpotlightOptions {
  visible: boolean;
  onDismiss: () => void;
}

const PAD = 10; // padding around the target inside the highlight ring

export function SpotlightTip({ visible, targetRect, title, message, actionLabel = 'Förstått', swipeDemo, onDismiss }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const swipeAnim = useRef(new Animated.Value(0)).current;
  const screen = Dimensions.get('window');

  // Pulse the ring while a spotlight is shown.
  useEffect(() => {
    if (!targetRect) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); pulse.setValue(0); };
  }, [targetRect, pulse]);

  // Swipe-finger demo: smooth back-and-forth so the user sees the gesture.
  useEffect(() => {
    if (!visible || !swipeDemo) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(swipeAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(swipeAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); swipeAnim.setValue(0); };
  }, [visible, swipeDemo, swipeAnim]);

  if (!visible) return null;

  const callout = computeCalloutTop(targetRect, screen.height);

  // statusBarTranslucent OFF on purpose: Modal coords then start at the app
  // window top (below the status bar) and match measureInWindow's reference,
  // so the spotlight ring lines up correctly with the target.
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      {/* Backdrop: 4 dim rects around the target ("hole"), or full dim. */}
      {targetRect ? (
        <>
          <View style={[s.dim, { top: 0, left: 0, right: 0, height: Math.max(0, targetRect.y - PAD) }]} />
          <View style={[s.dim, { top: targetRect.y + targetRect.height + PAD, left: 0, right: 0, bottom: 0 }]} />
          <View style={[s.dim, { top: Math.max(0, targetRect.y - PAD), left: 0, width: Math.max(0, targetRect.x - PAD), height: targetRect.height + 2 * PAD }]} />
          <View style={[s.dim, { top: Math.max(0, targetRect.y - PAD), left: targetRect.x + targetRect.width + PAD, right: 0, height: targetRect.height + 2 * PAD }]} />
          <Animated.View
            pointerEvents="none"
            style={[
              s.ring,
              {
                top: targetRect.y - PAD,
                left: targetRect.x - PAD,
                width: targetRect.width + 2 * PAD,
                height: targetRect.height + 2 * PAD,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
              },
            ]}
          />
        </>
      ) : (
        <View style={[s.dim, StyleSheet.absoluteFillObject]} />
      )}
      {/* Tap outside the card dismisses (covers full screen, behind the card). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      <View style={[s.card, { top: callout, left: 20, right: 20 }]} pointerEvents="box-none">
        {swipeDemo ? (
          <View style={s.swipeDemoWrap} pointerEvents="none">
            <Animated.View
              style={{
                transform: swipeDemo === 'horizontal'
                  ? [{ translateX: swipeAnim.interpolate({ inputRange: [0, 1], outputRange: [-50, 50] }) }]
                  : [{ translateY: swipeAnim.interpolate({ inputRange: [0, 1], outputRange: [-22, 22] }) }],
              }}
            >
              <Ionicons name="hand-left-outline" size={36} color="#7c3aed" style={swipeDemo === 'horizontal' ? { transform: [{ rotate: '-15deg' }] } : undefined} />
            </Animated.View>
          </View>
        ) : null}
        <Text style={s.title}>{title}</Text>
        {message ? <Text style={s.message}>{message}</Text> : null}
        <Pressable style={s.btn} onPress={onDismiss} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={s.btnText}>{actionLabel}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// Position the callout below the target if there's room, otherwise above,
// otherwise centred on the screen.
function computeCalloutTop(rect: SpotlightRect | undefined, screenH: number): number {
  const cardEstHeight = 220;
  if (!rect) return Math.max(80, (screenH - cardEstHeight) / 2);
  const below = rect.y + rect.height + 24;
  const above = rect.y - cardEstHeight - 24;
  if (below + cardEstHeight < screenH - 40) return below;
  if (above > 40) return above;
  return 40;
}

const s = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  ring: {
    position: 'absolute',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#a78bfa',
    backgroundColor: 'transparent',
  },
  card: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  swipeDemoWrap: { height: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6, textAlign: 'center' },
  message: { fontSize: 14, color: '#374151', marginBottom: 14, textAlign: 'center', lineHeight: 20 },
  btn: { backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
