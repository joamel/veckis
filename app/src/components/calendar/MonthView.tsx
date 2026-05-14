import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ScheduleEntry, WeekDay, Chore, ChoreCompletion } from '@veckis/shared';
import { getISOWeek } from '../../lib/week';

interface MonthViewProps {
  date: Date;
  onMonthChange: (date: Date) => void;
  entries: (ScheduleEntry & { createdBy: string; isShared: boolean })[];
  chores: (Chore & { completions: ChoreCompletion[] })[];
  userId?: string;
  onSelectDay: (day: Date) => void;
  onEditEntry: (entry: ScheduleEntry) => void;
  onEditChore: (chore: Chore & { completions: ChoreCompletion[] }) => void;
  onToday?: () => void;
  selectedDate?: Date;
  filterMemberIds?: string[];
}

function choreVisibleOnDay(
  chore: Chore & { completions: ChoreCompletion[] },
  dayOfWeek: WeekDay,
  date: Date
): boolean {
  if (chore.frequency === 'once') return false;
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if ((chore as any).startDate && dateStr < (chore as any).startDate) return false;
  if ((chore as any).endDate && dateStr > (chore as any).endDate) return false;
  if (chore.frequency === 'daily') return true;
  if (!chore.days.includes(dayOfWeek)) return false;
  if (chore.frequency === 'weekly') return true;
  if (chore.frequency === 'biweekly') {
    const { weekNumber } = getISOWeek(date);
    return weekNumber % 2 === 0;
  }
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstWeekday = firstOfMonth.getDay();
  const targetWeekday = date.getDay();
  let offset = targetWeekday - firstWeekday;
  if (offset < 0) offset += 7;
  return 1 + offset === date.getDate();
}

export function MonthView({
  date,
  onMonthChange,
  entries,
  chores,
  userId,
  onSelectDay,
  onToday,
  selectedDate,
  filterMemberIds = [],
}: MonthViewProps) {
  const year = date.getFullYear();
  const month = date.getMonth();

  const weeks = useMemo(() => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const startDate = new Date(monthStart);
    startDate.setDate(startDate.getDate() - (monthStart.getDay() === 0 ? 6 : monthStart.getDay() - 1));

    const days: Date[] = [];
    const current = new Date(startDate);
    while (current <= monthEnd) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    while (days.length % 7 !== 0) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [year, month]);

  const hasContentOnDay = (day: Date): boolean => {
    const dayOfWeek: WeekDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day.getDay()] as WeekDay;
    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const hasEntries = entries.some(e =>
      e.day === dayOfWeek &&
      (e.isShared || e.createdBy === userId) &&
      !e.exceptions?.includes(dateStr) &&
      (!(e as any).startDate || dateStr >= (e as any).startDate) &&
      (!(e as any).endDate || dateStr <= (e as any).endDate) &&
      (filterMemberIds.length === 0 || (e.assignedTo != null && filterMemberIds.includes(e.assignedTo)))
    );
    const hasChores = chores.some(c =>
      choreVisibleOnDay(c, dayOfWeek, day) &&
      (filterMemberIds.length === 0 || (c.assignedTo != null && filterMemberIds.includes(c.assignedTo)))
    );
    return hasEntries || hasChores;
  };

  const monthName = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' }).format(date);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => onMonthChange(new Date(year, month - 1))}>
          <Ionicons name="chevron-back" size={24} color="#374151" />
        </Pressable>
        <Text style={s.monthLabel}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</Text>
        {onToday ? (
          <Pressable onPress={onToday} style={s.todayBtn}>
            <Text style={s.todayBtnText}>Idag</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => onMonthChange(new Date(year, month + 1))}>
          <Ionicons name="chevron-forward" size={24} color="#374151" />
        </Pressable>
      </View>

      <View style={s.weekDayHeaders}>
        {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map(day => (
          <Text key={day} style={s.weekDayHeader}>{day}</Text>
        ))}
      </View>

      <ScrollView contentContainerStyle={s.grid}>
        {weeks.map((week, weekIdx) => (
          <View key={weekIdx} style={s.week}>
            {week.map(day => {
              const isCurrentMonth = day.getMonth() === month;
              const isToday = day.toDateString() === new Date().toDateString();
              const isSelected = selectedDate ? day.toDateString() === selectedDate.toDateString() : false;
              const hasContent = hasContentOnDay(day);

              return (
                <Pressable
                  key={day.toISOString()}
                  style={[
                    s.day,
                    !isCurrentMonth && s.dayOtherMonth,
                    isToday && !isSelected && s.dayToday,
                    hasContent && !isSelected && s.dayHasContent,
                    isSelected && s.daySelected,
                  ]}
                  onPress={() => onSelectDay(day)}
                >
                  <Text style={[
                    s.dayNumber,
                    !isCurrentMonth && s.dayNumberOther,
                    isSelected && s.dayNumberSelected,
                  ]}>
                    {day.getDate()}
                  </Text>
                  <View style={s.eventDots}>
                    <View style={[s.dot, isSelected ? s.dotSelected : s.dotEntry, { opacity: isToday ? 1 : 0 }]} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  monthLabel: { fontSize: 18, fontWeight: '700', color: '#111827', flex: 1, textAlign: 'center' },
  todayBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#4f46e5', borderRadius: 6, marginRight: 16 },
  todayBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  weekDayHeaders: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 8 },
  weekDayHeader: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#6b7280' },
  grid: { padding: 8 },
  week: { flexDirection: 'row', marginBottom: 8 },
  day: {
    flex: 1,
    aspectRatio: 1,
    margin: 4,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    alignItems: 'center',
  },
  dayOtherMonth: { opacity: 0.4 },
  dayToday: { backgroundColor: '#eef2ff', borderColor: '#4f46e5' },
  dayHasContent: { backgroundColor: '#eeecfa', borderColor: '#c7c2f0' },
  daySelected: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  dayNumber: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  dayNumberOther: { color: '#9ca3af' },
  dayNumberSelected: { color: '#fff' },
  eventDots: { flexDirection: 'row', gap: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dotEntry: { backgroundColor: '#4f46e5' },
  dotSelected: { backgroundColor: 'rgba(255,255,255,0.8)' },
});
