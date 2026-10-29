import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from './Pressable';
import { useOnceFlag } from '../hooks/useOnceFlag';
import { INSTAGRAM_URL } from '../lib/storeLinks';
import { instagramPromo as str } from '../lib/svenska';

// Varumärkets lime med skogsgrön text — samma i ljust och mörkt läge, som
// stämpeln på Instagram. Den förra blågrå rutan såg ut som ett systemmeddelande.
const LIME = '#cde66b';
const SKOG = '#1d3b2e';

/**
 * Tips om Instagram-kontot där det är till nytta: överst i en tom vecka
 * ("ingen idé för veckan?"). Stängs med krysset och kommer då aldrig tillbaka.
 */
export function InstagramHint() {
  const { seen, markSeen } = useOnceFlag('dismissed-instagram-menu-hint');
  if (!INSTAGRAM_URL || seen !== false) return null;
  const url = INSTAGRAM_URL;
  return (
    <Pressable style={s.card} onPress={() => { void Linking.openURL(url).catch(() => {}); }} accessibilityRole="link">
      <Ionicons name="logo-instagram" size={24} color={SKOG} />
      <View style={{ flex: 1 }}>
        <Text style={s.text}>{str.menuHint}</Text>
        <Text style={s.link}>{str.follow} →</Text>
      </View>
      <Pressable onPress={markSeen} hitSlop={12} accessibilityLabel={str.close}>
        <Ionicons name="close" size={18} color={SKOG} />
      </Pressable>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginHorizontal: 16, marginTop: 8, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: LIME },
  text: { fontSize: 14, lineHeight: 20, color: SKOG, fontWeight: '600' },
  link: { fontSize: 14, fontWeight: '800', color: SKOG, marginTop: 6 },
});
