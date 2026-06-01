import { type RefObject, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Rect { x: number; y: number; width: number; height: number }

export interface SpotlightOptions {
  title: string;
  message?: string;
  /** When given, the dim creates a "hole" around the target and a pulsing ring
   *  highlights it. Without a target, the tip appears centered on a full dim. */
  targetRef?: RefObject<View | null>;
  /** Pre-measured window-rect for the target. Takes precedence over targetRef
   *  — use when measureInWindow is unreliable (e.g. virtualised FlatList
   *  wrappers that report 0×0 on Android until items render). */
  targetRect?: { x: number; y: number; width: number; height: number };
  /** When set, an animated finger gesture renders over the target rect to
   *  visualise the swipe direction. No-op without a target. */
  swipeDemo?: 'horizontal' | 'vertical';
  /** Label for the dismiss button. Defaults to "Förstått". */
  actionLabel?: string;
}

interface Props extends SpotlightOptions {
  visible: boolean;
  onDismiss: () => void;
}

const PAD = 10; // padding around the target inside the highlight ring

export function SpotlightTip({ visible, targetRef, targetRect, title, message, actionLabel = 'Förstått', swipeDemo, onDismiss }: Props) {
  const [measuredRect, setMeasuredRect] = useState<Rect | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const swipeAnim = useRef(new Animated.Value(0)).current;
  const screen = Dimensions.get('window');
  // Pre-measured rect from caller wins over our own measurement.
  const rect = targetRect ?? measuredRect;

  // Measure the target after layout has settled. The target may not be laid
  // out yet when the tip useEffect fires (especially inside headers that mount
  // alongside the screen) — retry a few times before giving up. Falls back to
  // no-target mode if the ref never resolves to non-zero dimensions.
  useEffect(() => {
    if (!visible) { setMeasuredRect(null); return; }
    if (targetRect) return; // caller already supplied the rect
    if (!targetRef?.current) { setMeasuredRect(null); return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const attempt = (n: number) => {
      if (cancelled) return;
      targetRef.current?.measureInWindow((x, y, width, height) => {
        if (cancelled) return;
        const offscreen = y + height < 0 || y > screen.height || x + width < 0 || x > screen.width;
        if (width > 0 && height > 0 && !offscreen) {
          setMeasuredRect({ x, y, width, height });
          return;
        }
        if (n < 6) {
          timer = setTimeout(() => attempt(n + 1), 100);
        } else {
          setMeasuredRect(null);
        }
      });
    };
    timer = setTimeout(() => attempt(0), 100);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [visible, targetRef, targetRect, screen.height, screen.width]);

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
  // useNativeDriver:false on purpose — native-driver animations inside a
  // Modal can silently stop being committed on Android in some RN versions.
  useEffect(() => {
    if (!visible || !swipeDemo || !rect) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(swipeAnim, { toValue: 1, duration: 1100, useNativeDriver: false }),
        Animated.delay(150),
        Animated.timing(swipeAnim, { toValue: 0, duration: 1100, useNativeDriver: false }),
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
          {/* Static border around the hole — alltid synlig så användaren ser
              gränsen mellan dim och target tydligt även när pulsen är på sin
              låga punkt (#3 från backloggen). */}
          <View
            pointerEvents="none"
            style={[
              s.ring,
              {
                top: rect.y - PAD,
                left: rect.x - PAD,
                width: rect.width + 2 * PAD,
                height: rect.height + 2 * PAD,
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              s.ring,
              {
                top: rect.y - PAD,
                left: rect.x - PAD,
                width: rect.width + 2 * PAD,
                height: rect.height + 2 * PAD,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.7] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
              },
            ]}
          />
        </>
      ) : (
        <View style={[s.dim, StyleSheet.absoluteFillObject]} />
      )}
      {/* Tap outside the card dismisses (covers full screen, behind the card). */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      <View style={[s.card, { top: callout, left: 20, right: 20, maxHeight: screen.height * 0.7 }]} pointerEvents="box-none">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 4 }}
        >
          <Text style={s.title}>{title}</Text>
          {message ? <Text style={s.message}>{message}</Text> : null}
        </ScrollView>
        <Pressable style={s.btn} onPress={onDismiss} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={s.btnText}>{actionLabel}</Text>
        </Pressable>
      </View>
      {/* Swipe-finger demo: rendered LAST so it's guaranteed on top regardless
          of Android elevation quirks. Outside the rect-fragment so a re-mount
          when rect changes doesn't tear it down. */}
      {rect && swipeDemo ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: rect.y + rect.height / 2 - 28,
            left: rect.x + rect.width / 2 - 28,
            width: 56,
            height: 56,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            elevation: 30,
            transform: [
              { translateX: swipeAnim.interpolate({ inputRange: [0, 1], outputRange: [-swipeAmpX, swipeAmpX] }) },
              { translateY: swipeAnim.interpolate({ inputRange: [0, 1], outputRange: [-swipeAmpY, swipeAmpY] }) },
            ],
          }}
        >
          <View style={s.fingerHalo} />
          <Ionicons
            name="hand-left-outline"
            size={40}
            color="#fff"
            style={[s.fingerIcon, swipeDemo === 'horizontal' ? { transform: [{ rotate: '-15deg' }] } : null]}
          />
        </Animated.View>
      ) : null}
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
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.82)' },
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
    top: 0,
    left: 0,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7c3aed',
    opacity: 0.95,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  fingerIcon: {
    // Sits on top of the halo (zIndex on the icon for iOS where the halo
    // would otherwise overdraw the icon because both are absolute siblings).
    zIndex: 1,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6, textAlign: 'center' },
  message: { fontSize: 14, color: '#374151', marginBottom: 14, textAlign: 'center', lineHeight: 20 },
  btn: { backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
