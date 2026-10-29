import { useEffect, useRef } from 'react';
import { Animated, Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from './Pressable';
import { useOnceFlag } from '../hooks/useOnceFlag';
import { INSTAGRAM_URL } from '../lib/storeLinks';
import { instagramPromo as str } from '../lib/svenska';

// Varumärkets lime med skogsgrön text — samma i ljust och mörkt läge, som
// stämpeln på Instagram.
const LIME = '#cde66b';
const SKOG = '#1d3b2e';

/**
 * Tips om Instagram-kontot i en tom vecka: en liten flik som glider in från
 * högerkanten ovanpå veckan, i stället för en ruta som trycker ned allt.
 * Krysset stänger den för gott. Läggs i skärmens yttersta vy (absolut).
 */
export function InstagramHint({ top = '40%' }: { top?: `${number}%` | number }) {
  const { seen, markSeen } = useOnceFlag('dismissed-instagram-menu-hint');
  const x = useRef(new Animated.Value(320)).current;
  const synlig = !!INSTAGRAM_URL && seen === false;

  useEffect(() => {
    if (!synlig) return;
    // Lite efter att veckan visats, så den märks som något eget.
    const t = setTimeout(() => Animated.spring(x, { toValue: 0, useNativeDriver: true, friction: 8, tension: 50 }).start(), 900);
    return () => clearTimeout(t);
  }, [synlig, x]);

  if (!synlig) return null;
  const url = INSTAGRAM_URL as string;
  const stang = () => Animated.timing(x, { toValue: 320, duration: 220, useNativeDriver: true }).start(markSeen);
  return (
    <Animated.View style={[s.flik, { top, transform: [{ translateX: x }] }]}>
      <Pressable style={s.inner} onPress={() => { void Linking.openURL(url).catch(() => {}); }} accessibilityRole="link" accessibilityLabel={str.menuHint}>
        <Ionicons name="logo-instagram" size={22} color={SKOG} />
        <View>
          {/* Explicit bredd ur teckenantalet: Android mäter annars för smalt
              och kapar sista bokstaven (se android-text-clipping). */}
          <Text style={[s.title, { width: str.menuHintTitle.length * 8 + 8 }]} numberOfLines={1}>{str.menuHintTitle}</Text>
          <Text style={[s.title, { width: str.menuHintWhere.length * 8 + 8 }]} numberOfLines={1}>{str.menuHintWhere}</Text>
        </View>
      </Pressable>
      <Pressable onPress={stang} hitSlop={12} accessibilityLabel={str.close} style={s.close}>
        <Ionicons name="close" size={16} color={SKOG} />
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // Dockad mot högerkanten: rundad bara till vänster, som en flik.
  flik: {
    position: 'absolute', right: 0, flexDirection: 'row', alignItems: 'center',
    backgroundColor: LIME, borderTopLeftRadius: 20, borderBottomLeftRadius: 20, paddingLeft: 12, paddingVertical: 7, paddingRight: 6,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 8, zIndex: 50,
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Tjockare text i en mindre ruta.
  title: { fontSize: 13, lineHeight: 16, color: SKOG, fontWeight: '800' },
  close: { marginLeft: 6, padding: 2 },
});
