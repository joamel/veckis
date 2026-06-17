import { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useTablet } from '../hooks/useTablet';
import { useOnceFlag } from '../hooks/useOnceFlag';
import { useSpotlightTip, useTipsReady } from '../context/SpotlightTipContext';

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
  // Ring-target = bara texten "Vecka N", inte hela tryckytan (som är osynlig
  // och spänner över hela raden). #6 från backloggen.
  const labelTextRef = useRef<View>(null);
  const dateTip = useOnceFlag('seen-weeknav-date-tip');
  const dateTipShownRef = useRef(false);
  const showTip = useSpotlightTip();
  const tipsReady = useTipsReady();
  const isFocused = useIsFocused();

  // Datepicker via week-label tap is hidden — fire a tip once when WeekNav is
  // visible (host screen focused) with a date-picker handler wired. WeekNav
  // renders in both calendar and menu; useIsFocused gates so only the active
  // tab's instance fires, otherwise the ring would target the wrong screen.
  useEffect(() => {
    if (!tipsReady) return;
    if (!isFocused) return;
    if (dateTip.seen !== false || dateTipShownRef.current) return;
    if (!onPickDate) return;
    const shown = showTip({
      title: 'Hoppa till annan vecka',
      message: 'Tryck på veckonumret för att öppna en kalender och hoppa till valfri vecka eller dag.',
      targetRef: labelTextRef,
    });
    if (shown) { dateTipShownRef.current = true; dateTip.markSeen(); }
  }, [tipsReady, isFocused, onPickDate, dateTip.seen, dateTip.markSeen, showTip]);

  return (
    <View style={[s.container, { paddingHorizontal: sp(12), paddingVertical: sp(10) }]}>
      {/* Rendered first so arrows appear on top of it in touch handling */}
      <Pressable style={s.labelBtn} onPress={onPickDate ?? onToday}>
        <View ref={labelTextRef} collapsable={false}>
          <Text style={[s.label, { fontSize: fs(14) }, isCurrentWeek && s.labelCurrent, isPastWeek && s.labelPast]}>{weekLabel}</Text>
        </View>
      </Pressable>
      <Pressable style={[s.arrow, { padding: sp(8) }]} onPress={disablePrev ? undefined : onPrev} accessibilityRole="button" accessibilityLabel="Föregående vecka" disabled={disablePrev}>
        <Ionicons name="chevron-back" size={fs(18)} color={disablePrev ? '#d1d5db' : '#4f46e5'} />
      </Pressable>
      <View style={{ flex: 1 }} />
      {!isCurrentWeek && (
        <Pressable style={[s.todayBtn, { paddingHorizontal: sp(12), paddingVertical: sp(6) }]} onPress={onToday}>
          <Text style={[s.todayBtnText, { fontSize: fs(12) }]}>Idag</Text>
        </Pressable>
      )}
      <Pressable style={[s.arrow, { padding: sp(8) }]} onPress={onNext} accessibilityRole="button" accessibilityLabel="Nästa vecka">
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
  label: { fontWeight: '600', color: '#4f46e5' },
  labelCurrent: { color: '#4f46e5' },
  labelPast: { color: '#9ca3af' },
  todayBtn: { backgroundColor: '#4f46e5', borderRadius: 6, marginRight: 16 },
  todayBtnText: { fontWeight: '600', color: '#fff' },
});
