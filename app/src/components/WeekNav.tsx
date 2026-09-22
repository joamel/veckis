import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTablet } from '../hooks/useTablet';
import { components as str } from '../lib/svenska';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
import { nyFont, type NyPalett } from '../lib/nyDesign';

interface WeekNavProps {
  weekLabel: string;
  isCurrentWeek: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPickDate?: () => void;
  disablePrev?: boolean;
  isPastWeek?: boolean;
  /** Ny design (beta): ljus text i det gröna sidhuvudet. */
  variant?: 'ny';
}

export function WeekNav({ weekLabel, isCurrentWeek, onPrev, onNext, onToday, onPickDate, disablePrev, isPastWeek, variant }: WeekNavProps) {
  const arNy = variant === 'ny';
  const { fs, sp } = useTablet();
  const { colors: c, ny } = useTheme();
  const s = useMemo(() => makeStyles(c, ny), [c, ny]);

  return (
    <View style={[s.container, arNy && s.nyContainer, { paddingHorizontal: sp(arNy ? 4 : 12), paddingVertical: sp(arNy ? 7 : 10) }]}>
      {/* Rendered first so arrows appear on top of it in touch handling */}
      <Pressable style={s.labelBtn} onPress={onPickDate ?? onToday}>
        <Text style={[s.label, { fontSize: fs(14) }, isCurrentWeek && s.labelCurrent, isPastWeek && s.labelPast, arNy && s.nyLabel, arNy && isPastWeek && s.nyLabelPast]}>{weekLabel}</Text>
      </Pressable>
      <Pressable style={[s.arrow, { padding: sp(8) }]} onPress={disablePrev ? undefined : onPrev} accessibilityRole="button" accessibilityLabel={str.weekNav.prevWeek} disabled={disablePrev}>
        <Ionicons name="chevron-back" size={fs(18)} color={disablePrev ? (arNy ? ny.glas : c.border) : (arNy ? ny.ikonLjus : c.primary)} />
      </Pressable>
      <View style={{ flex: 1 }} />
      {!isCurrentWeek && (
        <Pressable style={[s.todayBtn, arNy && s.nyTodayBtn, { paddingHorizontal: sp(12), paddingVertical: sp(6) }]} onPress={onToday}>
          <Ionicons name="today-outline" size={fs(13)} color={arNy ? ny.skog : c.primary} />
          <Text style={[s.todayBtnText, arNy && s.nyTodayText, { fontSize: fs(12) }]}>{str.weekNav.today}</Text>
        </Pressable>
      )}
      <Pressable style={[s.arrow, { padding: sp(8) }]} onPress={onNext} accessibilityRole="button" accessibilityLabel={str.weekNav.nextWeek}>
        <Ionicons name="chevron-forward" size={fs(18)} color={arNy ? ny.ikonLjus : c.primary} />
      </Pressable>
    </View>
  );
}

const makeStyles = (c: Palette, ny: NyPalett) => StyleSheet.create({
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
  // Ny design (beta)
  nyContainer: { backgroundColor: ny.glasSvag, borderBottomWidth: 0, borderRadius: 14 },
  nyLabel: { fontFamily: nyFont.fet, fontWeight: 'normal', fontSize: 16, color: ny.rubrikLjus },
  nyLabelPast: { color: ny.underrubrik },
  nyTodayBtn: { backgroundColor: ny.lime },
  nyTodayText: { color: ny.skog },
});
