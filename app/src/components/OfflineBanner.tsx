import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsOnline } from '../hooks/useIsOnline';
import { components as str } from '../lib/svenska';

export function OfflineBanner() {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const online = useIsOnline();
  if (online) return null;
  return (
    <View style={s.banner}>
      <Ionicons name="cloud-offline-outline" size={15} color="#fff" />
      <Text style={s.text}>{str.offlineBanner.text}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: c.textSecondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 9998,
  },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '500' },
});
