import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTablet } from '../hooks/useTablet';
import { components as str } from '../lib/svenska';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';

interface WeekNavProps {
  weekLabel: string;
  isCurrentWeek: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPickDate?: () => void;
  disablePrev?: boolean;
  isPastWeek?: boolean;
}

export function WeekNav({ weekLabel, isCurrentWeek, onPrev, onNext, onToday, onPickDate, disablePrev, isPastWeek }: WeekNavProps) {
  const { fs, sp } = useTablet();
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <View style={[s.container, { paddingHorizontal: sp(12), paddingVertical: sp(10) }]}>
      {/* Rendered first so arrows appear on top of it in touch handling */}
      <Pressable style={s.labelBtn} onPress={onPickDate ?? onToday}>
        <Text style={[s.label, { fontSize: fs(14) }, isCurrentWeek && s.labelCurrent, isPastWeek && s.labelPast]}>{weekLabel}</Text>
      </Pressable>
      <Pressable style={[s.arrow, { padding: sp(8) }]} onPress={disablePrev ? undefined : onPrev} accessibilityRole="button" accessibilityLabel={str.weekNav.prevWeek} disabled={disablePrev}>
        <Ionicons name="chevron-back" size={fs(18)} color={disablePrev ? c.border : c.primary} />
      </Pressable>
      <View style={{ flex: 1 }} />
      {!isCurrentWeek && (
        <Pressable style={[s.todayBtn, { paddingHorizontal: sp(12), paddingVertical: sp(6) }]} onPress={onToday}>
          <Ionicons name="today-outline" size={fs(13)} color={c.primary} />
          <Text style={[s.todayBtnText, { fontSize: fs(12) }]}>{str.weekNav.today}</Text>
        </Pressable>
      )}
      <Pressable style={[s.arrow, { padding: sp(8) }]} onPress={onNext} accessibilityRole="button" accessibilityLabel={str.weekNav.nextWeek}>
        <Ionicons name="chevron-forward" size={fs(18)} color={c.primary} />
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.borderLight,
  },
  arrow: {},
  labelBtn: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingVertical: 4 },
  label: { fontWeight: '600', color: c.primary },
  labelCurrent: { color: c.primary },
  labelPast: { color: c.textFaint },
  todayBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.primaryTint, borderRadius: 999, marginRight: 12 },
  todayBtnText: { fontWeight: '600', color: c.primary },
});
