import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

// Varorna som faller ned i korgen. Emoji i stället för ritade former: de syns
// i båda teman och kräver inga bildfiler.
const ITEMS = ['🥕', '🍋', '🥖'];
const FALL_MS = 700;
const GAP_MS = 380;

/**
 * Laddning med Handlis-korgen: varor faller ned i korgen i en mjuk loop, och
 * texten under säger vad som händer. Används där en import tar några sekunder
 * — en snurra i en limegrön knapp syntes knappt.
 */
export function HandlisLoader({ text }: { text: string }) {
  const { colors: c, ny } = useTheme();
  const falls = useRef(ITEMS.map(() => new Animated.Value(0))).current;
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const one = (v: Animated.Value) => Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: FALL_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      // Korgen gungar till när varan landar.
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]);
    const loop = Animated.loop(Animated.stagger(GAP_MS, falls.map(one)));
    loop.start();
    return () => loop.stop();
  }, [falls, bounce]);

  const ink = ny.padYta;
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={text}>
      <View style={styles.stage}>
        {falls.map((v, i) => (
          <Animated.Text
            key={ITEMS[i]}
            style={[styles.item, {
              left: 34 + i * 18,
              opacity: v.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
              transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-70, 36] }) }, { rotate: v.interpolate({ inputRange: [0, 1], outputRange: [i % 2 ? '-25deg' : '20deg', '0deg'] }) }],
            }]}
          >
            {ITEMS[i]}
          </Animated.Text>
        ))}
        <Animated.View style={[styles.basket, { transform: [{ translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }] }]}>
          <View style={[styles.handle, { borderColor: ink }]} />
          <View style={[styles.body, { backgroundColor: ink }]}>
            <View style={[styles.stripe, { backgroundColor: ny.lime }]} />
            <View style={[styles.stripe, { backgroundColor: ny.lime, opacity: 0.6 }]} />
          </View>
        </Animated.View>
      </View>
      <Text style={[styles.text, { color: c.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 32, minHeight: 240 },
  stage: { width: 130, height: 130, alignItems: 'center', justifyContent: 'flex-end' },
  item: { position: 'absolute', top: 40, fontSize: 26 },
  basket: { alignItems: 'center' },
  handle: { width: 74, height: 40, borderWidth: 6, borderBottomWidth: 0, borderTopLeftRadius: 37, borderTopRightRadius: 37, marginBottom: -4 },
  body: { width: 104, height: 54, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  stripe: { height: 4, borderRadius: 2 },
  text: { marginTop: 20, fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
