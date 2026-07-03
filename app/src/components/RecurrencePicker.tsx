import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RecurrenceType, WeekDay } from '@veckis/shared';
import { components as str, common } from '../lib/svenska';

const DAYS: { key: WeekDay; short: string; label: string }[] = [
  { key: 'mon', short: 'Mån', label: 'Måndag' },
  { key: 'tue', short: 'Tis', label: 'Tisdag' },
  { key: 'wed', short: 'Ons', label: 'Onsdag' },
  { key: 'thu', short: 'Tor', label: 'Torsdag' },
  { key: 'fri', short: 'Fre', label: 'Fredag' },
  { key: 'sat', short: 'Lör', label: 'Lördag' },
  { key: 'sun', short: 'Sön', label: 'Söndag' },
];

const INTERVAL_UNIT: Record<RecurrenceType, string> = {
  none: '',
  daily: 'dag',
  weekly: 'vecka',
  custom_days: 'vecka',
  monthly: 'månad',
  yearly: 'år',
};

export type RecurrencePickerValue = {
  recurrenceType: RecurrenceType;
  recurrenceWeeks: number;
  recurrenceDays: WeekDay[];
  monthlyType: 'day_of_month' | 'weekday_of_month';
  recurrenceWeekOfMonth: number;
  endDate: string | null;
};

export type RecurrencePickerProps = RecurrencePickerValue & {
  onChangeType: (type: RecurrenceType) => void;
  onChangeWeeks: (weeks: number) => void;
  onChangeDays: (days: WeekDay[]) => void;
  onChangeMonthlyType: (type: 'day_of_month' | 'weekday_of_month') => void;
  onChangeWeekOfMonth: (week: number) => void;
  onChangeEndDate: (date: string | null) => void;
  onOpenEndPicker: () => void;
  /** Referensdatum för "den X:e" och "X dag i månaden". Default: idag. */
  referenceDate?: Date;
  /** Referensdag för weekday-of-month-label. Default: härleds från referenceDate. */
  referenceDay?: WeekDay;
  /** Om satt: visa stepper för dag-i-månaden (1-31). Annars: visa bara dagen från referenceDate. */
  dayOfMonth?: number;
  onChangeDayOfMonth?: (day: number) => void;
  /** Om satt: visa veckodag-rad för weekday-of-month. Annars: härled från referenceDay. */
  weekday?: WeekDay;
  onChangeWeekday?: (day: WeekDay) => void;
  /** Dölj slutdatum-raden (Upphör aldrig / Välj datum). Default: true (visas). */
  showEndDate?: boolean;
};

const WEEKDAY_FROM_JS: WeekDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function RecurrencePicker(props: RecurrencePickerProps) {
  const ref = props.referenceDate ?? new Date();
  const dom = props.dayOfMonth ?? ref.getDate();
  const wday = props.weekday ?? props.referenceDay ?? WEEKDAY_FROM_JS[ref.getDay()];

  return (
    <>
      <Text style={s.label}>{str.recurrencePicker.label}</Text>
      <View style={s.typeRow}>
        {(['none', 'daily', 'weekly', 'monthly', 'yearly'] as const).map(type => (
          <Pressable
            key={type}
            style={[s.typeBtn, props.recurrenceType === type && s.typeBtnActive]}
            onPress={() => props.onChangeType(type)}
          >
            <Text
              style={[s.typeBtnText, props.recurrenceType === type && s.typeBtnTextActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {str.recurrencePicker.types[type]}
            </Text>
          </Pressable>
        ))}
      </View>

      {props.recurrenceType !== 'none' && (
        <View style={s.intervalRow}>
          <Text style={s.intervalLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{str.recurrencePicker.every}</Text>
          <Pressable style={s.intervalBtn} onPress={() => props.onChangeWeeks(Math.max(1, props.recurrenceWeeks - 1))}>
            <Text style={s.intervalBtnText}>−</Text>
          </Pressable>
          <Text style={s.intervalValue}>{props.recurrenceWeeks}</Text>
          <Pressable style={s.intervalBtn} onPress={() => props.onChangeWeeks(props.recurrenceWeeks + 1)}>
            <Text style={s.intervalBtnText}>+</Text>
          </Pressable>
          <Text style={s.intervalLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{INTERVAL_UNIT[props.recurrenceType]}</Text>
        </View>
      )}

      {props.recurrenceType === 'weekly' && (
        <>
          <Text style={s.label}>{str.recurrencePicker.weekdays}</Text>
          <View style={s.dayRow}>
            {DAYS.map(day => {
              const active = props.recurrenceDays.includes(day.key);
              return (
                <Pressable
                  key={day.key}
                  style={[s.dayOption, active && s.dayOptionActive]}
                  onPress={() =>
                    props.onChangeDays(
                      active ? props.recurrenceDays.filter(d => d !== day.key) : [...props.recurrenceDays, day.key],
                    )
                  }
                >
                  <Text
                    style={[s.dayText, active && s.dayTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >{day.short}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {props.recurrenceType === 'monthly' && (
        <>
          <Text style={s.label}>{str.recurrencePicker.repeatsEvery}</Text>
          <View style={s.monthlyRow}>
            <Pressable
              style={[s.monthlyBtn, props.monthlyType === 'day_of_month' && s.monthlyBtnActive]}
              onPress={() => props.onChangeMonthlyType('day_of_month')}
            >
              <Text style={[s.monthlyBtnText, props.monthlyType === 'day_of_month' && s.monthlyBtnTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {str.recurrencePicker.monthly.dayOfMonth(dom)}
              </Text>
            </Pressable>
            <Pressable
              style={[s.monthlyBtn, props.monthlyType === 'weekday_of_month' && s.monthlyBtnActive]}
              onPress={() => props.onChangeMonthlyType('weekday_of_month')}
            >
              <Text style={[s.monthlyBtnText, props.monthlyType === 'weekday_of_month' && s.monthlyBtnTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {str.recurrencePicker.monthly.weekday(
                  common.ordinals[props.recurrenceWeekOfMonth - 1] ?? 'Sista',
                  DAYS.find(d => d.key === wday)?.label.toLowerCase() ?? '',
                )}
              </Text>
            </Pressable>
          </View>
          {props.monthlyType === 'day_of_month' && props.onChangeDayOfMonth && (
            <View style={s.intervalRow}>
              <Text style={s.intervalLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{str.recurrencePicker.dayOfMonth}</Text>
              <Pressable style={s.intervalBtn} onPress={() => props.onChangeDayOfMonth!(((dom - 2 + 31) % 31) + 1)}>
                <Text style={s.intervalBtnText}>−</Text>
              </Pressable>
              <Text style={s.intervalValue}>{dom}</Text>
              <Pressable style={s.intervalBtn} onPress={() => props.onChangeDayOfMonth!((dom % 31) + 1)}>
                <Text style={s.intervalBtnText}>+</Text>
              </Pressable>
            </View>
          )}
          {props.monthlyType === 'weekday_of_month' && (
            <>
              {props.onChangeWeekday && (
                <View style={s.dayRow}>
                  {DAYS.map(day => {
                    const active = wday === day.key;
                    return (
                      <Pressable
                        key={day.key}
                        style={[s.dayOption, active && s.dayOptionActive]}
                        onPress={() => props.onChangeWeekday!(day.key)}
                      >
                        <Text
                    style={[s.dayText, active && s.dayTextActive]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >{day.short}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <View style={s.intervalRow}>
                <Text style={s.intervalLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{str.recurrencePicker.weekOfMonth}</Text>
                <Pressable style={s.intervalBtn} onPress={() => props.onChangeWeekOfMonth(Math.max(1, props.recurrenceWeekOfMonth - 1))}>
                  <Text style={s.intervalBtnText}>−</Text>
                </Pressable>
                <Text style={s.intervalValue}>{props.recurrenceWeekOfMonth}</Text>
                <Pressable style={s.intervalBtn} onPress={() => props.onChangeWeekOfMonth(Math.min(4, props.recurrenceWeekOfMonth + 1))}>
                  <Text style={s.intervalBtnText}>+</Text>
                </Pressable>
              </View>
            </>
          )}
        </>
      )}

      {props.recurrenceType !== 'none' && props.showEndDate !== false && (
        <>
          <Text style={s.label}>{str.recurrencePicker.ends}</Text>
          <View style={s.endRow}>
            <Pressable
              style={[s.endBtn, !props.endDate && s.endBtnActive]}
              onPress={() => props.onChangeEndDate(null)}
            >
              <Text style={[s.endBtnText, !props.endDate && s.endBtnTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{str.recurrencePicker.neverEnds}</Text>
            </Pressable>
            <Pressable
              style={[s.endBtn, props.endDate && s.endBtnActive, { flex: 1.5 }]}
              onPress={props.onOpenEndPicker}
            >
              <Ionicons name="calendar-outline" size={13} color={props.endDate ? '#4e7a5e' : '#a8a29e'} />
              <Text style={[s.endBtnText, props.endDate && s.endBtnTextActive]}>{props.endDate ?? str.recurrencePicker.chooseDate}</Text>
            </Pressable>
          </View>
        </>
      )}
    </>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: '#44403c' },
  typeRow: { flexDirection: 'row', gap: 6 },
  typeBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#e7e5e4', alignItems: 'center', backgroundColor: '#faf8f3' },
  typeBtnActive: { borderColor: '#4e7a5e', backgroundColor: '#ecf3ec' },
  typeBtnText: { fontSize: 12, color: '#78716c', fontWeight: '500' },
  typeBtnTextActive: { color: '#4e7a5e', fontWeight: '700' },
  intervalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  intervalLabel: { fontSize: 13, color: '#78716c' },
  intervalBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#e7e5e4', backgroundColor: '#faf8f3', alignItems: 'center', justifyContent: 'center' },
  intervalBtnText: { fontSize: 18, color: '#4e7a5e', fontWeight: '700' },
  intervalValue: { fontSize: 15, fontWeight: '600', color: '#292524', minWidth: 24, textAlign: 'center' },
  dayRow: { flexDirection: 'row', gap: 4 },
  dayOption: { flex: 1, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#e7e5e4', backgroundColor: '#faf8f3', alignItems: 'center' },
  dayOptionActive: { borderColor: '#4e7a5e', backgroundColor: '#ecf3ec' },
  dayText: { fontSize: 12, color: '#78716c' },
  dayTextActive: { color: '#4e7a5e', fontWeight: '600' },
  monthlyRow: { gap: 6 },
  monthlyBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e7e5e4', backgroundColor: '#faf8f3' },
  monthlyBtnActive: { borderColor: '#4e7a5e', backgroundColor: '#ecf3ec' },
  monthlyBtnText: { fontSize: 13, color: '#78716c' },
  monthlyBtnTextActive: { color: '#4e7a5e', fontWeight: '600' },
  endRow: { flexDirection: 'row', gap: 6 },
  endBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#e7e5e4', backgroundColor: '#faf8f3' },
  endBtnActive: { borderColor: '#4e7a5e', backgroundColor: '#ecf3ec' },
  endBtnText: { fontSize: 12, color: '#78716c', fontWeight: '500' },
  endBtnTextActive: { color: '#4e7a5e', fontWeight: '700' },
});
