import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTablet } from '../hooks/useTablet';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  /** Label for the optional call-to-action button (e.g. "Ny lista"). */
  actionLabel?: string;
  /** Tapped when the CTA button is pressed. Required for the button to show. */
  onAction?: () => void;
}

/**
 * Shared empty-state placeholder: greyed icon, title, optional subtitle and an
 * optional primary CTA button. Keeps the "inget här än"-screens consistent
 * across tabs and gives new users an obvious next step. Scales with useTablet.
 */
export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  const { fs, sp } = useTablet();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.container}>
      <Ionicons name={icon} size={fs(56)} color={c.border} />
      <Text style={[s.title, { fontSize: fs(18) }]}>{title}</Text>
      {subtitle ? <Text style={[s.subtitle, { fontSize: fs(14) }]}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          style={[s.btn, { paddingVertical: sp(10), paddingHorizontal: sp(18), borderRadius: sp(10), marginTop: sp(18) }]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Ionicons name="add" size={fs(18)} color="#fff" />
          <Text style={[s.btnText, { fontSize: fs(15) }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  title: { fontWeight: '600', color: c.textSecondary, marginTop: 16, textAlign: 'center' },
  subtitle: { color: c.textFaint, marginTop: 6, textAlign: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.primary },
  btnText: { color: '#fff', fontWeight: '700' },
});
