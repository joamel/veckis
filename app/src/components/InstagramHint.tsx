import { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from './Pressable';
import { useTheme } from '../context/ThemeContext';
import { useOnceFlag } from '../hooks/useOnceFlag';
import { INSTAGRAM_URL } from '../lib/storeLinks';
import { instagramPromo as str } from '../lib/svenska';
import type { Palette } from '../lib/theme';

/**
 * Tips om Instagram-kontot där det är till nytta: under veckomenyns tomläge
 * ("ingen idé för veckan?"). Stängs med krysset och kommer då aldrig tillbaka.
 * Reklam när den hjälper, inte när den stör.
 */
export function InstagramHint() {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { seen, markSeen } = useOnceFlag('dismissed-instagram-menu-hint');
  if (!INSTAGRAM_URL || seen !== false) return null;
  const url = INSTAGRAM_URL;
  return (
    <View style={s.card}>
      <Ionicons name="logo-instagram" size={22} color={c.primary} />
      <View style={{ flex: 1 }}>
        <Text style={s.text}>{str.menuHint}</Text>
        <Pressable onPress={() => { void Linking.openURL(url).catch(() => {}); }} accessibilityRole="link" hitSlop={8}>
          <Text style={s.link}>{str.follow}</Text>
        </Pressable>
      </View>
      <Pressable onPress={markSeen} hitSlop={10} accessibilityLabel={str.close}>
        <Ionicons name="close" size={18} color={c.textFaint} />
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginHorizontal: 16, marginTop: 4, marginBottom: 12, padding: 14, borderRadius: 14, backgroundColor: c.primaryTint, borderWidth: 1, borderColor: c.borderLight },
  text: { fontSize: 14, lineHeight: 20, color: c.text },
  link: { fontSize: 14, fontWeight: '700', color: c.primary, marginTop: 6 },
});
