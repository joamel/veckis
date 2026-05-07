import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface WeekNavProps {
  weekLabel: string;
  isCurrentWeek: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function WeekNav({ weekLabel, isCurrentWeek, onPrev, onNext, onToday }: WeekNavProps) {
  return (
    <View style={s.container}>
      {/* Rendered first so arrows appear on top of it in touch handling */}
      <Pressable style={s.labelBtn} onPress={onToday}>
        <Text style={[s.label, isCurrentWeek && s.labelCurrent]}>{weekLabel}</Text>
      </Pressable>
      <Pressable style={s.arrow} onPress={onPrev}>
        <Ionicons name="chevron-back" size={18} color="#4f46e5" />
      </Pressable>
      <View style={{ flex: 1 }} />
      {!isCurrentWeek && (
        <Pressable style={s.todayBtn} onPress={onToday}>
          <Text style={s.todayBtnText}>Idag</Text>
        </Pressable>
      )}
      <Pressable style={s.arrow} onPress={onNext}>
        <Ionicons name="chevron-forward" size={18} color="#4f46e5" />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  arrow: { padding: 8 },
  labelBtn: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingVertical: 4 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  labelCurrent: { color: '#4f46e5' },
  todayBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#4f46e5', borderRadius: 6, marginRight: 4 },
  todayBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
});
