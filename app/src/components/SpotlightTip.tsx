import { type RefObject, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Rect { x: number; y: number; width: number; height: number }

export interface SpotlightOptions {
  title: string;
  message?: string;
  /** When given, the dim creates a "hole" around the target and a pulsing ring
   *  highlights it. Without a target, the tip appears centered on a full dim. */
  targetRef?: RefObject<View | null>;
  /** When set, an animated finger gesture renders over the target rect to
   *  visualise the swipe direction. No-op without targetRef. */
  swipeDemo?: 'horizontal' | 'vertical';
  /** Label for the dismiss button. Defaults to "Förstått". */
  actionLabel?: string;
}

interface Props extends SpotlightOptions {
  visible: boolean;
  onDismiss: () => void;
}

const PAD = 10; // padding around the target inside the highlight ring

export function SpotlightTip({ visible, targetRef, title, message, actionLabel = 'Förstått', swipeDemo, onDismiss }: Props) {
  const [rect, setRect] = useState<Rect | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const swipeAnim = useRef(new Animated.Value(0)).current;
  const screen = Dimensions.get('window');

  // Measure the target after layout has settled. The target may not be laid
  // out yet when the tip useEffect fires (especially inside headers that mount
  // alongside the screen) — retry a few times before giving up. Falls back to
  // no-target mode if the ref never resolves to non-zero dimensions.
  useEffect(() => {
    if (!visible) { setRect(null); return; }
    if (!targetRef?.current) { setRect(null); return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const attempt = (n: number) => {
      if (cancelled) return;
      targetRef.current?.measureInWindow((x, y, width, height) => {
        if (cancelled) return;
        const offscreen = y + height < 0 || y > screen.height || x + width < 0 || x > screen.width;
        if (width > 0 && height > 0 && !offscreen) {
          setRect({ x, y, width, height });
          return;
        }
        if (n < 6) {
          timer = setTimeout(() => attempt(n + 1), 100);
        } else {
          setRect(null);
        }
      });
    };
    timer = setTimeout(() => attempt(0), 100);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [visible, targetRef, screen.height, screen.width]);

  // Pulse the ring while a spotlight is shown.
  useEffect(() => {
    if (!rect) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); pulse.setValue(0); };
  }, [rect, pulse]);

  // Swipe-finger demo: travel across the rect to demonstrate the gesture.
  useEffect(() => {
    if (!visible || !swipeDemo || !rect) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(swipeAnim, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.delay(150),
        Animated.timing(swipeAnim, { toValue: 0, duration: 1100, useNativeDriver: true }),
        Animated.delay(150),
      ]),
    );
    loop.start();
    return () => { loop.stop(); swipeAnim.setValue(0); };
  }, [visible, swipeDemo, rect, swipeAnim]);

  if (!visible) return null;

  const callout = computeCalloutTop(rect, screen.height);

  // Swipe finger sweeps ±35% of the target dimension, centered on the rect.
  const swipeAmpX = rect && swipeDemo === 'horizontal' ? rect.width * 0.35 : 0;
  const swipeAmpY = rect && swipeDemo === 'vertical' ? rect.height * 0.35 : 0;

  // statusBarTranslucent OFF on purpose: Modal coords then start at the app
  // window top (below the status bar) and match measureInWindow's reference,
  // so the spotlight ring lines up correctly with the target.
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      {/* Backdrop: 4 dim rects around the target ("hole"), or full dim. */}
      {rect ? (
        <>
          <View style={[s.dim, { top: 0, left: 0, right: 0, height: Math.max(0, rect.y - PAD) }]} />
          <View style={[s.dim, { top: rect.y + rect.height + PAD, left: 0, right: 0, bottom: 0 }]} />
          <View style={[s.dim, { top: Math.max(0, rect.y - PAD), left: 0, width: Math.max(0, rect.x - PAD), height: rect.height + 2 * PAD }]} />
          <View style={[s.dim, { top: Math.max(0, rect.y - PAD), left: rect.x + rect.width + PAD, right: 0, height: rect.height + 2 * PAD }]} />
          <Animated.View
            pointerEvents="none"
            style={[
              s.ring,
              {
                top: rect.y - PAD,
                left: rect.x - PAD,
                width: rect.width + 2 * PAD,
                height: rect.height + 2 * PAD,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
              },
            ]}
          />
          {swipeDemo ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: rect.y + rect.height / 2 - 22,
                left: rect.x + rect.width / 2 - 22,
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [
                  { translateX: swipeAnim.interpolate({ inputRange: [0, 1], outputRange: [-swipeAmpX, swipeAmpX] }) },
                  { translateY: swipeAnim.interpolate({ inputRange: [0, 1], outputRange: [-swipeAmpY, swipeAmpY] }) },
                ],
              }}
            >
              <View style={s.fingerHalo} />
              <Ionicons
                name="hand-left-outline"
                size={36}
                color="#fff"
                style={swipeDemo === 'horizontal' ? { transform: [{ rotate: '-15deg' }] } : undefined}
              />
            </Animated.View>
          ) : null}
        </>
      ) : (
        <View style={[s.dim, StyleSheet.absoluteFillObject]} />
      )}
      {/* Tap outside the card dismisses (covers full screen, behind the card). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      <View style={[s.card, { top: callout, left: 20, right: 20 }]} pointerEvents="box-none">
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
function computeCalloutTop(rect: Rect | null, screenH: number): number {
  const cardEstHeight = 200;
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
  fingerHalo: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(167, 139, 250, 0.75)',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6, textAlign: 'center' },
  message: { fontSize: 14, color: '#374151', marginBottom: 14, textAlign: 'center', lineHeight: 20 },
  btn: { backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
