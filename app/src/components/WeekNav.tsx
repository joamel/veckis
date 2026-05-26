import type { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTablet } from '../hooks/useTablet';

interface WeekNavProps {
  weekLabel: string;
  /** Optional custom label, rendered centered. Overrides weekLabel when provided. */
  labelNode?: ReactNode;
  /** Optional short tag pinned to the left (e.g. week number), in purple. */
  weekBadge?: string;
  isCurrentWeek: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPickDate?: () => void;
}

export function WeekNav({ weekLabel, labelNode, weekBadge, isCurrentWeek, onPrev, onNext, onToday, onPickDate }: WeekNavProps) {
  const { fs, sp } = useTablet();
  return (
    <View style={[s.container, { paddingHorizontal: sp(12), paddingVertical: sp(10) }]}>
      {/* Rendered first so arrows appear on top of it in touch handling */}
      <Pressable style={s.labelBtn} onPress={onPickDate ?? onToday}>
        {labelNode ?? (
          <Text style={[s.label, { fontSize: fs(14) }, isCurrentWeek && s.labelCurrent]}>{weekLabel}</Text>
        )}
      </Pressable>
      <Pressable style={[s.arrow, { padding: sp(8) }]} onPress={onPrev}>
        <Ionicons name="chevron-back" size={fs(18)} color="#4f46e5" />
      </Pressable>
      {weekBadge ? <Text style={[s.weekBadge, { fontSize: fs(14) }]}>{weekBadge}</Text> : null}
      <View style={{ flex: 1 }} />
      {!isCurrentWeek && (
        <Pressable style={[s.todayBtn, { paddingHorizontal: sp(12), paddingVertical: sp(6) }]} onPress={onToday}>
          <Text style={[s.todayBtnText, { fontSize: fs(12) }]}>Idag</Text>
        </Pressable>
      )}
      <Pressable style={[s.arrow, { padding: sp(8) }]} onPress={onNext}>
        <Ionicons name="chevron-forward" size={fs(18)} color="#4f46e5" />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  arrow: {},
  labelBtn: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingVertical: 4 },
  label: { fontWeight: '600', color: '#374151' },
  labelCurrent: { color: '#4f46e5' },
  weekBadge: { color: '#7c3aed', fontWeight: '700', marginLeft: 4 },
  todayBtn: { backgroundColor: '#4f46e5', borderRadius: 6, marginRight: 16 },
  todayBtnText: { fontWeight: '600', color: '#fff' },
});
