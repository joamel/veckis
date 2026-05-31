import { type RefObject, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

interface Rect { x: number; y: number; width: number; height: number }

export interface SpotlightOptions {
  title: string;
  message?: string;
  /** When given, the dim creates a "hole" around the target and a pulsing ring
   *  highlights it. Without a target, the tip appears centered on a full dim. */
  targetRef?: RefObject<View | null>;
  /** Label for the dismiss button. Defaults to "Förstått". */
  actionLabel?: string;
}

interface Props extends SpotlightOptions {
  visible: boolean;
  onDismiss: () => void;
}

const PAD = 10; // padding around the target inside the highlight ring

export function SpotlightTip({ visible, targetRef, title, message, actionLabel = 'Förstått', onDismiss }: Props) {
  const [rect, setRect] = useState<Rect | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const screen = Dimensions.get('window');

  // Measure the target after layout has settled. Falls back gracefully to
  // no-target mode if the ref hasn't mounted or the element is off-screen.
  useEffect(() => {
    if (!visible) { setRect(null); return; }
    if (!targetRef?.current) { setRect(null); return; }
    const id = setTimeout(() => {
      targetRef.current?.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) { setRect(null); return; }
        // If clearly off-screen, skip the spotlight cutout.
        if (y + height < 0 || y > screen.height || x + width < 0 || x > screen.width) {
          setRect(null); return;
        }
        setRect({ x, y, width, height });
      });
    }, 80);
    return () => clearTimeout(id);
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

  if (!visible) return null;

  const callout = computeCalloutTop(rect, screen.height);

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
  title: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6, textAlign: 'center' },
  message: { fontSize: 14, color: '#374151', marginBottom: 14, textAlign: 'center', lineHeight: 20 },
  btn: { backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
