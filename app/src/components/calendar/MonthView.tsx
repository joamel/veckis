import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ScheduleEntry, WeekDay, Chore, ChoreCompletion } from '@veckis/shared';
import type { WeekMenuItemWithRecipe } from '../../api/client';

interface MonthViewProps {
  date: Date;
  onMonthChange: (date: Date) => void;
  entries: (ScheduleEntry & { createdBy: string; isShared: boolean })[];
  menuItems: WeekMenuItemWithRecipe[];
  chores: (Chore & { completions: ChoreCompletion[] })[];
  userId?: string;
  onSelectDay: (day: Date) => void;
  onEditEntry: (entry: ScheduleEntry) => void;
  onEditChore: (chore: Chore & { completions: ChoreCompletion[] }) => void;
}

export function MonthView({
  date,
  onMonthChange,
  entries,
  menuItems,
  chores,
  userId,
  onSelectDay,
}: MonthViewProps) {
  const year = date.getFullYear();
  const month = date.getMonth();

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

  const weeks = useMemo(() => {
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  }, [days]);

  const getEventsForDay = (day: Date) => {
    const dayEntries = entries.filter(e => {
      const dayOfWeek: WeekDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day.getDay()] as WeekDay;
      return e.day === dayOfWeek && (e.isShared || e.createdBy === userId);
    });
    const menuForDay = menuItems.filter(m => {
      const dayOfWeek: WeekDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day.getDay()] as WeekDay;
      return m.day === dayOfWeek;
    });
    return { entries: dayEntries, menu: menuForDay };
  };

  const monthName = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' }).format(date);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => onMonthChange(new Date(year, month - 1))}>
          <Ionicons name="chevron-back" size={24} color="#374151" />
        </Pressable>
        <Text style={s.monthLabel}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</Text>
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
              const { entries: dayEntries, menu: dayMenu } = getEventsForDay(day);
              const isCurrentMonth = day.getMonth() === month;
              const isToday = day.toDateString() === new Date().toDateString();

              return (
                <Pressable
                  key={day.toISOString()}
                  style={[s.day, !isCurrentMonth && s.dayOtherMonth, isToday && s.dayToday]}
                  onPress={() => onSelectDay(day)}
                >
                  <Text style={[s.dayNumber, !isCurrentMonth && s.dayNumberOther]}>{day.getDate()}</Text>
                  <View style={s.eventDots}>
                    {dayMenu.length > 0 && <View style={[s.dot, s.dotMenu]} />}
                    {dayEntries.length > 0 && <View style={[s.dot, s.dotEntry]} />}
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
  monthLabel: { fontSize: 18, fontWeight: '700', color: '#111827' },
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
  dayNumber: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  dayNumberOther: { color: '#9ca3af' },
  eventDots: { flexDirection: 'row', gap: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dotMenu: { backgroundColor: '#f59e0b' },
  dotEntry: { backgroundColor: '#4f46e5' },
});
