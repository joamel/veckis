import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
import type { ThemeMode } from '../context/ThemeContext';
import { common as str } from '../lib/svenska';

const OPTIONS: { key: ThemeMode; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'system', icon: 'phone-portrait-outline' },
  { key: 'light', icon: 'sunny-outline' },
  { key: 'dark', icon: 'moon-outline' },
];

/** Kompakt ljust/mörkt/system-växlare — samma `ThemeContext` som Inställningar,
 *  men utan etiketter så den ryms på inloggnings-/registreringsskärmen. */
export function ThemeModeToggle() {
  const { colors: c, mode, setMode } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.row}>
      {OPTIONS.map(opt => {
        const active = mode === opt.key;
        return (
          <Pressable
            key={opt.key}
            style={[s.opt, active && s.optActive]}
            onPress={() => setMode(opt.key)}
            accessibilityLabel={str.appearance[opt.key]}
            accessibilityRole="button"
          >
            <Ionicons name={opt.icon} size={16} color={active ? c.primary : c.textMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  row: { flexDirection: 'row', alignSelf: 'center', gap: 6, marginBottom: 12 },
  opt: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: c.borderLight, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
  optActive: { borderColor: c.primary, backgroundColor: c.primaryTint },
});
