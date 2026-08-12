import { ReactNode, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHousehold } from '../context/HouseholdContext';
import { useTablet } from '../hooks/useTablet';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';

interface ScreenHeaderProps {
  title: string;
  actionIcon?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  actionNode?: ReactNode;
  /** When set, renders a back arrow before the title (for pushed screens
   *  that reuse a tab layout, e.g. the recipe picker). */
  onBack?: () => void;
}

export function ScreenHeader({ title, actionIcon, actionLabel, onActionPress, actionNode, onBack }: ScreenHeaderProps) {
  const { householdName } = useHousehold();
  const { fs, sp } = useTablet();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <View style={s.header}>
      <View style={[s.headerTop, { paddingHorizontal: sp(20), paddingTop: sp(20), paddingBottom: sp(10) }]}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={10} style={{ marginRight: sp(10), alignSelf: 'center' }} accessibilityRole="button">
            <Ionicons name="arrow-back" size={fs(26)} color={c.text} />
          </Pressable>
        )}
        <View style={s.headerTitleSection}>
          <Text style={[s.title, { fontSize: fs(28) }]}>{title}</Text>
          {householdName && (
            <View style={s.subtitleRow}>
              <Ionicons name="home-outline" size={fs(13)} color={c.textMuted} />
              <Text style={[s.subtitle, { fontSize: fs(13), marginTop: 0 }]}>{householdName}</Text>
            </View>
          )}
        </View>
        {actionNode ? actionNode : (actionIcon && actionLabel && onActionPress && (
          <Pressable
            style={[s.actionBtn, { paddingHorizontal: sp(12), paddingVertical: sp(7) }]}
            onPress={onActionPress}
          >
            <Ionicons name={actionIcon as any} size={fs(16)} color={c.primary} />
            <Text style={[s.actionBtnText, { fontSize: fs(13) }]}>{actionLabel}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  header: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle, paddingBottom: 10 },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  headerTitleSection: { flex: 1 },
  title: { fontWeight: '700', color: c.text },
  subtitle: { color: c.textMuted, marginTop: 2 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.primaryTint, borderRadius: 20 },
  actionBtnText: { fontWeight: '600', color: c.primary },
});
