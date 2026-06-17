import { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DatePickerModalProps {
  value: string | null;
  onChange: (date: string | null) => void;
  onClose: () => void;
  title?: string;
  visible: boolean;
  /** Show a "Rensa" button that clears the date. Default false. */
  clearable?: boolean;
  /** Dates before this (YYYY-MM-DD) are shown greyed out and unselectable. */
  minimumDate?: string;
  /** Dates after this (YYYY-MM-DD) are shown greyed out and unselectable. */
  maximumDate?: string;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function DatePickerModal({ value, onChange, onClose, title, visible, clearable = false, minimumDate, maximumDate }: DatePickerModalProps) {
  const initial = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const weeks = useMemo(() => {
    const monthStart = new Date(viewYear, viewMonth, 1);
    const monthEnd = new Date(viewYear, viewMonth + 1, 0);
    const startDate = new Date(monthStart);
    startDate.setDate(startDate.getDate() - (monthStart.getDay() === 0 ? 6 : monthStart.getDay() - 1));
    const days: Date[] = [];
    const current = new Date(startDate);
    while (current <= monthEnd) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
    while (days.length % 7 !== 0) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));
    return result;
  }, [viewYear, viewMonth]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const monthName = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' }).format(new Date(viewYear, viewMonth));
  const todayStr = toDateStr(new Date());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />
      <View style={s.container}>
        {title && <Text style={s.title}>{title}</Text>}
        <View style={s.header}>
          <Pressable onPress={prevMonth} style={s.arrow}><Ionicons name="chevron-back" size={20} color="#374151" /></Pressable>
          <Text style={s.monthLabel}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</Text>
          <Pressable onPress={nextMonth} style={s.arrow}><Ionicons name="chevron-forward" size={20} color="#374151" /></Pressable>
        </View>
        <View style={s.weekDays}>
          <Text style={s.weekNumHeader}> </Text>
          {['Mån','Tis','Ons','Tor','Fre','Lör','Sön'].map(d => <Text key={d} style={s.weekDay}>{d}</Text>)}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={s.week}>
            <Text style={s.weekNum}>{isoWeek(week[0])}</Text>
            {week.map(day => {
              const ds = toDateStr(day);
              const isCurrentMonth = day.getMonth() === viewMonth;
              const isSelected = ds === value;
              const isToday = ds === todayStr;
              const isDisabled = (!!minimumDate && ds < minimumDate) || (!!maximumDate && ds > maximumDate);
              return (
                <Pressable
                  key={ds}
                  style={[s.day, isDisabled && s.dayDisabled, !isCurrentMonth && !isDisabled && s.dayOther, isToday && !isSelected && !isDisabled && s.dayToday, isSelected && s.daySelected]}
                  onPress={isDisabled ? undefined : () => { onChange(ds); onClose(); }}
                >
                  <Text style={[s.dayNum, (isDisabled || (!isCurrentMonth && !isDisabled)) && s.dayNumOther, isSelected && !isDisabled && s.dayNumSelected]}>
                    {day.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View style={s.footer}>
          {clearable && value && (
            <Pressable style={s.clearBtn} onPress={() => { onChange(null); onClose(); }}>
              <Text style={s.clearBtnText}>Rensa</Text>
            </Pressable>
          )}
          <Pressable style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnText}>Avbryt</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  container: { position: 'absolute', top: '15%', left: 20, right: 20, backgroundColor: '#fff', borderRadius: 16, padding: 16, elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  title: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  arrow: { padding: 6 },
  monthLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  weekDays: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#9ca3af', paddingVertical: 4 },
  weekNumHeader: { width: 24, textAlign: 'center', fontSize: 11 },
  weekNum: { width: 24, textAlign: 'center', alignSelf: 'center', fontSize: 11, fontWeight: '600', color: '#7c3aed' },
  week: { flexDirection: 'row', marginBottom: 2 },
  day: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, margin: 2 },
  dayOther: { opacity: 0.3 },
  dayDisabled: { opacity: 0.2 },
  dayToday: { backgroundColor: '#eef2ff' },
  daySelected: { backgroundColor: '#4f46e5' },
  dayNum: { fontSize: 14, fontWeight: '600', color: '#111827' },
  dayNumOther: { color: '#9ca3af' },
  dayNumSelected: { color: '#fff' },
  footer: { flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'flex-end' },
  clearBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fff7f7' },
  clearBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },
  closeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f3f4f6' },
  closeBtnText: { color: '#374151', fontWeight: '600', fontSize: 14 },
});
