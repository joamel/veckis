import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RecurrenceType, WeekDay } from '@veckis/shared';
import { components as str, common } from '../lib/svenska';

// Dagnamn härleds från de centraliserade veckodagarna (mån-först) → inget
// dagnamn hårdkodat här.
const DAY_KEYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAYS: { key: WeekDay; short: string; label: string }[] = DAY_KEYS.map((key, i) => ({
  key, short: common.weekdays.short[i], label: common.weekdays.long[i],
}));

const INTERVAL_UNIT: Record<RecurrenceType, string> = {
  none: '',
  daily: str.recurrencePicker.units.daily,
  weekly: str.recurrencePicker.units.weekly,
  custom_days: str.recurrencePicker.units.weekly,
  monthly: str.recurrencePicker.units.monthly,
  yearly: str.recurrencePicker.units.yearly,
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
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
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
                  common.ordinals[props.recurrenceWeekOfMonth - 1] ?? common.ordinals[common.ordinals.length - 1],
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
              <Ionicons name="calendar-outline" size={13} color={props.endDate ? c.primary : c.textFaint} />
              <Text style={[s.endBtnText, props.endDate && s.endBtnTextActive]}>{props.endDate ?? str.recurrencePicker.chooseDate}</Text>
            </Pressable>
          </View>
        </>
      )}
    </>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  typeRow: { flexDirection: 'row', gap: 6 },
  typeBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: c.borderLight, alignItems: 'center', backgroundColor: c.background },
  typeBtnActive: { borderColor: c.primary, backgroundColor: c.primaryTint },
  typeBtnText: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  typeBtnTextActive: { color: c.primary, fontWeight: '700' },
  intervalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  intervalLabel: { fontSize: 13, color: c.textMuted },
  intervalBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: c.borderLight, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
  intervalBtnText: { fontSize: 18, color: c.primary, fontWeight: '700' },
  intervalValue: { fontSize: 15, fontWeight: '600', color: c.text, minWidth: 24, textAlign: 'center' },
  dayRow: { flexDirection: 'row', gap: 4 },
  dayOption: { flex: 1, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: c.borderLight, backgroundColor: c.background, alignItems: 'center' },
  dayOptionActive: { borderColor: c.primary, backgroundColor: c.primaryTint },
  dayText: { fontSize: 12, color: c.textMuted },
  dayTextActive: { color: c.primary, fontWeight: '600' },
  monthlyRow: { gap: 6 },
  monthlyBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: c.borderLight, backgroundColor: c.background },
  monthlyBtnActive: { borderColor: c.primary, backgroundColor: c.primaryTint },
  monthlyBtnText: { fontSize: 13, color: c.textMuted },
  monthlyBtnTextActive: { color: c.primary, fontWeight: '600' },
  endRow: { flexDirection: 'row', gap: 6 },
  endBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: c.borderLight, backgroundColor: c.background },
  endBtnActive: { borderColor: c.primary, backgroundColor: c.primaryTint },
  endBtnText: { fontSize: 12, color: c.textMuted, fontWeight: '500' },
  endBtnTextActive: { color: c.primary, fontWeight: '700' },
});
