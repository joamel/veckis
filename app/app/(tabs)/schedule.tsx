import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type WeekMenuItemWithRecipe } from '../../src/api/client';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useSpotlightTip, useTipsReady } from '../../src/context/SpotlightTipContext';
import { useOnceFlag } from '../../src/hooks/useOnceFlag';
import { useDiscardDraft } from '../../src/hooks/useDiscardDraft';
import { useFirstActionTip } from '../../src/hooks/useFirstActionTip';
import { useHouseholdSocket } from '../../src/hooks/useHouseholdSocket';
import { useAuth } from '@clerk/clerk-expo';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useMemberFilter } from '../../src/context/MemberFilterContext';
import { useHaptics } from '../../src/hooks/useHaptics';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState } from '../../src/components/EmptyState';
import { WeekNav } from '../../src/components/WeekNav';
import { useTablet } from '../../src/hooks/useTablet';
import { MonthView } from '../../src/components/calendar/MonthView';
import { DatePickerModal } from '../../src/components/DatePickerModal';
import { RecurrencePicker } from '../../src/components/RecurrencePicker';
import { ConflictBanner } from '../../src/components/ConflictBanner';
import { getISOWeek, addWeeks } from '../../src/lib/week';
import { occursOn } from '@veckis/shared';
import type { ScheduleEntry, WeekDay, Chore, ChoreCompletion } from '@veckis/shared';
import { kavBehavior } from '../../src/lib/platform';
import { schedule as str, common, chores as choresStr, components as componentsStr } from '../../src/lib/svenska';

const DAY_KEYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAYS: { key: WeekDay; label: string; short: string }[] = DAY_KEYS.map((key, i) => ({
  key,
  label: common.weekdays.long[i],
  short: common.weekdays.short[i],
}));

const TODAY_DAY = DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1].key;

const DRUM_H = 44;
const HOUR_VALS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MIN_VALS = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
// Varv 1: 0°-360° = 1-60 min (6°/min)
// Varv 2: 360°-720° = 1-24 tim (15°/tim)
// Varv 3: 720°-1080° = 1-7 dagar (60°/dag)
// Varv 4: 1080°-1440° = 1-8 veckor (45°/vecka)
function minutesToTotalAngle(m: number): number {
  if (m <= 60) return m * 6;
  if (m <= 1440) return 360 + (m / 60) * 15;
  if (m <= 7 * 1440) return 660 + m / 24;  // 1 dag=720°, 7 dagar=1080°
  return 1080 + (m / 10080) * 45;
}
function totalAngleToMinutes(a: number): number {
  if (a <= 360) return Math.max(0, Math.round(a / 6));
  if (a <= 720) return Math.max(1, Math.round((a - 360) / 15)) * 60;
  if (a <= 1080) return Math.max(1, Math.min(7, Math.round((a - 720) / 60) + 1)) * 1440;
  return Math.max(1, Math.round((a - 1080) / 45)) * 10080;
}
const REMIND_PRESETS = str.remind.presets as readonly { label: string; value: number }[];

function formatRemindTime(m: number): string {
  if (m === 0) return str.remind.atStart;
  if (m < 60) return str.remind.formatMin(m);
  const h = Math.round(m / 60);
  if (m < 1440) return str.remind.formatHour(h);
  const d = Math.round(m / 1440);
  if (m < 10080) return str.remind.formatDay(d);
  const w = Math.round(m / 10080);
  return str.remind.formatWeek(w);
}

type ChoreWithCompletion = Chore & { completions: ChoreCompletion[] };
type Member = { id: string; clerkUserId: string | null; displayName: string };

function hapticTick() {
  if (Platform.OS === 'android') Vibration.vibrate(8);
}

function Drum({ values, selected, onSelect }: { values: string[]; selected: number; onSelect: (i: number) => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const len = values.length;
  // 3 copies for seamless wrapping
  const allValues = useMemo(() => [...values, ...values, ...values], [values]);
  const liveIndexRef = useRef(selected);
  const [liveIndex, setLiveIndex] = useState(selected);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: (len + selected) * DRUM_H, animated: false });
    }, 60);
    return () => clearTimeout(t);
  }, []);

  function handleScroll(e: { nativeEvent: { contentOffset: { y: number } } }) {
    const y = e.nativeEvent.contentOffset.y;
    const rawIdx = Math.round(y / DRUM_H);
    const newIdx = ((rawIdx % len) + len) % len;
    if (newIdx !== liveIndexRef.current) {
      liveIndexRef.current = newIdx;
      setLiveIndex(newIdx);
      hapticTick();
    }
  }

  function handleScrollEnd(e: { nativeEvent: { contentOffset: { y: number } } }) {
    const y = e.nativeEvent.contentOffset.y;
    const rawIdx = Math.round(y / DRUM_H);
    const normalIdx = ((rawIdx % len) + len) % len;
    onSelect(normalIdx);
    // If drifted to first or last copy, snap back to middle copy silently
    const targetY = (len + normalIdx) * DRUM_H;
    if (Math.abs(y - targetY) > 2) {
      scrollRef.current?.scrollTo({ y: targetY, animated: false });
    }
  }

  return (
    <View style={{ height: DRUM_H * 3, overflow: 'hidden', flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        snapToInterval={DRUM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: DRUM_H }}
        nestedScrollEnabled
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
      >
        {allValues.map((val, i) => {
          const isSelected = (i % len) === liveIndex;
          return (
            <View key={i} style={{ height: DRUM_H, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{
                fontSize: isSelected ? 26 : 17,
                fontWeight: isSelected ? '700' : '400',
                color: isSelected ? '#111827' : '#d1d5db',
              }}>
                {val}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: DRUM_H, left: 0, right: 0,
          height: DRUM_H,
          borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e5e7eb',
        }}
      />
    </View>
  );
}

const DIAL_SIZE = 200;
const DIAL_R = DIAL_SIZE / 2;
const DIAL_HAND_R = DIAL_R - 26;

const PIE_COLOR = '#e0e7ff';

function RemindDial({ minutes, onChange, onAdd }: { minutes: number; onChange: (m: number) => void; onAdd?: () => void }) {
  const [displayText, setDisplayText] = useState(() => formatRemindTime(minutes));
  const dialRef = useRef<View>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const totalAngleSV = useSharedValue(minutesToTotalAngle(minutes));
  const lastAngleRef = useRef<number | null>(null);
  const lastHapticRef = useRef(minutes);
  const lastEmittedRef = useRef(minutes);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAddRef = useRef(onAdd);
  onAddRef.current = onAdd;
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });

  useEffect(() => {
    if (minutes !== lastEmittedRef.current) {
      const target = minutesToTotalAngle(minutes);
      totalAngleSV.value = target;
      lastEmittedRef.current = minutes;
      lastHapticRef.current = minutes;
      setDisplayText(formatRemindTime(minutes));
    }
  }, [minutes]);

  // Center button scale — declared before PanResponder so release handler can trigger it.
  const pulseScale = useSharedValue(1);

  // Rotation/pie-fill runs on UI thread via Reanimated shared values (no re-renders during drag).
  // Display text updates only when the displayed value changes (same cadence as haptic feedback).
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { pageX, pageY } = e.nativeEvent;
      touchStartRef.current = { x: pageX, y: pageY, time: Date.now() };
      dialRef.current?.measure((_, __, w, h, px, py) => {
        centerRef.current = { x: px + w / 2, y: py + h / 2 };
      });
      lastAngleRef.current = Math.atan2(pageY - centerRef.current.y, pageX - centerRef.current.x) * (180 / Math.PI);
    },
    onPanResponderMove: (e) => {
      const { pageX, pageY } = e.nativeEvent;
      const a = Math.atan2(pageY - centerRef.current.y, pageX - centerRef.current.x) * (180 / Math.PI);
      if (lastAngleRef.current !== null) {
        let delta = a - lastAngleRef.current;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const newTotal = Math.max(0, Math.min(1440, totalAngleSV.value + delta));
        totalAngleSV.value = newTotal;
        const m = totalAngleToMinutes(newTotal);
        if (m !== lastHapticRef.current) {
          lastHapticRef.current = m;
          setDisplayText(formatRemindTime(m));
          hapticTick();
        }
      }
      lastAngleRef.current = a;
    },
    onPanResponderRelease: (e) => {
      lastAngleRef.current = null;
      const m = totalAngleToMinutes(totalAngleSV.value);
      lastEmittedRef.current = m;
      setDisplayText(formatRemindTime(m));
      onChangeRef.current(m);
      // Tap detection: short press, little movement, touch started in center area → add
      const elapsed = Date.now() - touchStartRef.current.time;
      const dx = e.nativeEvent.pageX - touchStartRef.current.x;
      const dy = e.nativeEvent.pageY - touchStartRef.current.y;
      if (elapsed < 350 && Math.sqrt(dx * dx + dy * dy) < 12) {
        const cx = touchStartRef.current.x - centerRef.current.x;
        const cy = touchStartRef.current.y - centerRef.current.y;
        if (Math.sqrt(cx * cx + cy * cy) < 62) onAddRef.current?.();
      } else {
        // Pulse on drag release to signal the value was set
        pulseScale.value = withSequence(
          withTiming(1.12, { duration: 120 }),
          withTiming(0.96, { duration: 100 }),
          withTiming(1, { duration: 100 }),
        );
      }
    },
  })).current;

  // Indicator dot moves along the hand radius
  const indicatorStyle = useAnimatedStyle(() => {
    const ha = totalAngleSV.value % 360;
    const rad = (ha - 90) * Math.PI / 180;
    return { transform: [{ translateX: DIAL_HAND_R * Math.cos(rad) }, { translateY: DIAL_HAND_R * Math.sin(rad) }] };
  });

  // Snake arc: 4 layers rendered bottom→top for seamless revolution carry-over.
  // Layer 1 (carry): full circle filled with previous zone's tail color — persists across revolution boundary.
  // Layer 2 (bg cover): 0→min(210+ha, 360)° with dial bg, erases the "empty" region and the carry-over below it.
  // Layer 3 (head): 0→ha° with current zone dark color, painted on top of bg cover.
  // Layer 4 (tail): 0→max(0,ha-60)° with current zone light color, lightens the tail portion of head.
  // Result: snake tip is always 150° visible regardless of revolution boundary.
  const snakeCarryRightStyle = useAnimatedStyle(() => {
    const zone = Math.min(Math.floor(totalAngleSV.value / 360), 3);
    const c = zone === 0 ? '#f9fafb' : zone === 1 ? '#c4b5fd' : zone === 2 ? '#818cf8' : '#6366f1';
    return { backgroundColor: c };
  });
  const snakeCarryLeftStyle = useAnimatedStyle(() => {
    const zone = Math.min(Math.floor(totalAngleSV.value / 360), 3);
    const c = zone === 0 ? '#f9fafb' : zone === 1 ? '#c4b5fd' : zone === 2 ? '#818cf8' : '#6366f1';
    return { backgroundColor: c };
  });
  const snakeBgRightStyle = useAnimatedStyle(() => {
    const zone = Math.min(Math.floor(totalAngleSV.value / 360), 3);
    const ha = totalAngleSV.value >= 1440 ? 360 : totalAngleSV.value % 360;
    const coverAngle = Math.min(210 + ha, 360);
    const rot = Math.min(coverAngle, 180) - 180;
    // Zone 0: erase to dial bg → worm effect on blank ring.
    // Zone 1+: erase to carry color → ring stays colored, no white flash.
    const c = zone === 0 ? '#f9fafb' : zone === 1 ? '#c4b5fd' : zone === 2 ? '#818cf8' : '#6366f1';
    return { backgroundColor: c, transform: [{ translateX: -DIAL_R / 2 }, { rotate: `${rot}deg` }, { translateX: DIAL_R / 2 }] };
  });
  const snakeBgLeftStyle = useAnimatedStyle(() => {
    const zone = Math.min(Math.floor(totalAngleSV.value / 360), 3);
    const ha = totalAngleSV.value >= 1440 ? 360 : totalAngleSV.value % 360;
    const coverAngle = Math.min(210 + ha, 360);
    const rot = Math.max(coverAngle - 180, 0) - 180;
    const c = zone === 0 ? '#f9fafb' : zone === 1 ? '#c4b5fd' : zone === 2 ? '#818cf8' : '#6366f1';
    return { backgroundColor: c, transform: [{ translateX: DIAL_R / 2 }, { rotate: `${rot}deg` }, { translateX: -DIAL_R / 2 }] };
  });
  const snakeHeadRightStyle = useAnimatedStyle(() => {
    const zone = Math.min(Math.floor(totalAngleSV.value / 360), 3);
    const ha = totalAngleSV.value >= 1440 ? 360 : totalAngleSV.value % 360;
    const rot = Math.min(ha, 180) - 180;
    const c = zone === 0 ? '#818cf8' : zone === 1 ? '#6366f1' : zone === 2 ? '#4f46e5' : '#3730a3';
    return { backgroundColor: c, transform: [{ translateX: -DIAL_R / 2 }, { rotate: `${rot}deg` }, { translateX: DIAL_R / 2 }] };
  });
  const snakeHeadLeftStyle = useAnimatedStyle(() => {
    const zone = Math.min(Math.floor(totalAngleSV.value / 360), 3);
    const ha = totalAngleSV.value >= 1440 ? 360 : totalAngleSV.value % 360;
    const rot = Math.max(ha - 180, 0) - 180;
    const c = zone === 0 ? '#818cf8' : zone === 1 ? '#6366f1' : zone === 2 ? '#4f46e5' : '#3730a3';
    return { backgroundColor: c, transform: [{ translateX: DIAL_R / 2 }, { rotate: `${rot}deg` }, { translateX: -DIAL_R / 2 }] };
  });
  const snakeTailRightStyle = useAnimatedStyle(() => {
    const zone = Math.min(Math.floor(totalAngleSV.value / 360), 3);
    const ha = Math.max(0, (totalAngleSV.value >= 1440 ? 360 : totalAngleSV.value % 360) - 60);
    const rot = Math.min(ha, 180) - 180;
    const c = zone === 0 ? '#c4b5fd' : zone === 1 ? '#818cf8' : zone === 2 ? '#6366f1' : '#4f46e5';
    return { backgroundColor: c, transform: [{ translateX: -DIAL_R / 2 }, { rotate: `${rot}deg` }, { translateX: DIAL_R / 2 }] };
  });
  const snakeTailLeftStyle = useAnimatedStyle(() => {
    const zone = Math.min(Math.floor(totalAngleSV.value / 360), 3);
    const ha = Math.max(0, (totalAngleSV.value >= 1440 ? 360 : totalAngleSV.value % 360) - 60);
    const rot = Math.max(ha - 180, 0) - 180;
    const c = zone === 0 ? '#c4b5fd' : zone === 1 ? '#818cf8' : zone === 2 ? '#6366f1' : '#4f46e5';
    return { backgroundColor: c, transform: [{ translateX: DIAL_R / 2 }, { rotate: `${rot}deg` }, { translateX: -DIAL_R / 2 }] };
  });

  const centerScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));
  useEffect(() => {
    pulseScale.value = withSequence(
      withTiming(1.18, { duration: 180 }),
      withTiming(0.94, { duration: 140 }),
      withTiming(1.1, { duration: 130 }),
      withTiming(1, { duration: 130 }),
    );
  }, []);

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <View
        ref={dialRef}
        style={s.remindDial}
        onLayout={() => {
          dialRef.current?.measure((_, __, w, h, px, py) => {
            centerRef.current = { x: px + w / 2, y: py + h / 2 };
          });
        }}
        {...panResponder.panHandlers}
      >
          {/* Snake layer 1 (bottom) — carry-over: full circle in previous zone's tail color */}
          <View style={{ position: 'absolute', left: DIAL_R, top: 0, width: DIAL_R, height: DIAL_SIZE, overflow: 'hidden' }}>
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: DIAL_R, height: DIAL_SIZE, borderTopRightRadius: DIAL_R, borderBottomRightRadius: DIAL_R }, snakeCarryRightStyle]} />
          </View>
          <View style={{ position: 'absolute', left: 0, top: 0, width: DIAL_R, height: DIAL_SIZE, overflow: 'hidden' }}>
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: DIAL_R, height: DIAL_SIZE, borderTopLeftRadius: DIAL_R, borderBottomLeftRadius: DIAL_R }, snakeCarryLeftStyle]} />
          </View>
          {/* Snake layer 2 — bg cover: 0→min(210+ha,360)°, erases the empty region */}
          <View style={{ position: 'absolute', left: DIAL_R, top: 0, width: DIAL_R, height: DIAL_SIZE, overflow: 'hidden' }}>
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: DIAL_R, height: DIAL_SIZE, borderTopRightRadius: DIAL_R, borderBottomRightRadius: DIAL_R }, snakeBgRightStyle]} />
          </View>
          <View style={{ position: 'absolute', left: 0, top: 0, width: DIAL_R, height: DIAL_SIZE, overflow: 'hidden' }}>
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: DIAL_R, height: DIAL_SIZE, borderTopLeftRadius: DIAL_R, borderBottomLeftRadius: DIAL_R }, snakeBgLeftStyle]} />
          </View>
          {/* Snake layer 3 — head: 0→ha° with dark color, on top of bg cover */}
          <View style={{ position: 'absolute', left: DIAL_R, top: 0, width: DIAL_R, height: DIAL_SIZE, overflow: 'hidden' }}>
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: DIAL_R, height: DIAL_SIZE, borderTopRightRadius: DIAL_R, borderBottomRightRadius: DIAL_R }, snakeHeadRightStyle]} />
          </View>
          <View style={{ position: 'absolute', left: 0, top: 0, width: DIAL_R, height: DIAL_SIZE, overflow: 'hidden' }}>
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: DIAL_R, height: DIAL_SIZE, borderTopLeftRadius: DIAL_R, borderBottomLeftRadius: DIAL_R }, snakeHeadLeftStyle]} />
          </View>
          {/* Snake layer 4 (top) — tail: 0→max(0,ha-60)° with light color, lightens tail portion */}
          <View style={{ position: 'absolute', left: DIAL_R, top: 0, width: DIAL_R, height: DIAL_SIZE, overflow: 'hidden' }}>
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: DIAL_R, height: DIAL_SIZE, borderTopRightRadius: DIAL_R, borderBottomRightRadius: DIAL_R }, snakeTailRightStyle]} />
          </View>
          <View style={{ position: 'absolute', left: 0, top: 0, width: DIAL_R, height: DIAL_SIZE, overflow: 'hidden' }}>
            <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: DIAL_R, height: DIAL_SIZE, borderTopLeftRadius: DIAL_R, borderBottomLeftRadius: DIAL_R }, snakeTailLeftStyle]} />
          </View>
          {/* Indicator dot */}
          <Animated.View style={[{
            position: 'absolute', left: DIAL_R - 12, top: DIAL_R - 12,
            width: 24, height: 24, borderRadius: 12, backgroundColor: '#312e81',
          }, indicatorStyle]} />
          {/* Center — fixed indigo button; tap here (detected in PanResponder) to add; pulses once on mount */}
          <Animated.View style={[{
            position: 'absolute', left: DIAL_R - 62, top: DIAL_R - 62,
            width: 124, height: 124, borderRadius: 62,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#312e81',
          }, centerScaleStyle]}>
            <Text style={{ fontSize: 28, fontWeight: '700', textAlign: 'center', color: '#ffffff' }}>{displayText}</Text>
          </Animated.View>
        </View>
    </View>
  );
}

export default function ScheduleScreen() {
  const router = useRouter();
  const deeplinkParams = useLocalSearchParams<{ entryId?: string }>();
  const openedEntryParamRef = useRef<string | null>(null);
  const client = useApiClient();
  const { showToast, showError } = useToast();
  const confirm = useConfirm();
  const tryCloseCreate = useDiscardDraft(confirm);
  const showTip = useSpotlightTip();
  const tipsReady = useTipsReady();
  const filterTip = useOnceFlag('seen-filter-tip');
  const filterTipShownRef = useRef(false);
  const filterBtnRef = useRef<View>(null);
  const calendarSwipeTip = useOnceFlag('seen-calendar-swipe-tip');
  const calendarSwipeTipShownRef = useRef(false);
  // Origins-tipset: förklarar VARIFRÅN kalenderns innehåll kommer (recept-
  // fliken + sysslor-fliken) så användaren förstår var de skapar grejer.
  const originsTip = useOnceFlag('seen-calendar-origins-tip');
  const originsTipShownRef = useRef(false);
  const wrapAddTip = useFirstActionTip('seen-calendar-add-tip');
  const { getToken } = useAuth();
  const { householdId } = useHousehold();

  useHouseholdSocket(householdId, getToken, (msg) => {
    if (msg.type === 'schedule_entry_added') {
      setEntries(prev => prev.some(e => e.id === msg.data.id) ? prev : [...prev, msg.data as never]);
    } else if (msg.type === 'schedule_entry_updated') {
      if (editingEntry?.id === msg.data.id) setEntryConflict({ msg: `${msg.actor ?? 'Någon'} ändrade ${editingEntry.title}`, latest: msg.data });
      setEntries(prev => prev.map(e => e.id === msg.data.id ? (msg.data as never) : e));
    } else if (msg.type === 'schedule_entry_deleted') {
      if (editingEntry?.id === msg.data.id) { showToast(`${msg.actor ?? 'Någon'} tog bort ${editingEntry.title}`, 'neutral'); setEditingEntry(null); }
      setEntries(prev => prev.filter(e => e.id !== msg.data.id));
    } else if (msg.type === 'chore_added') {
      setChores(prev => prev.some(c => c.id === msg.data.id) ? prev : [...prev, msg.data as never]);
    } else if (msg.type === 'chore_updated') {
      if (editingCalChore?.id === msg.data.id) setCalChoreConflict({ msg: `${msg.actor ?? 'Någon'} ändrade ${editingCalChore.title}`, latest: { ...editingCalChore, ...msg.data } });
      setChores(prev => prev.map(c => c.id === msg.data.id ? { ...c, ...msg.data } as never : c));
    } else if (msg.type === 'chore_deleted') {
      if (editingCalChore?.id === msg.data.id) { showToast(`${msg.actor ?? 'Någon'} tog bort ${editingCalChore.title}`, 'neutral'); setEditingCalChore(null); }
      setChores(prev => prev.filter(c => c.id !== msg.data.id));
    } else if (msg.type === 'chore_completed') {
      setChores(prev => prev.map(c => c.id === msg.data.choreId
        ? { ...c, completions: c.completions.some(x => x.id === msg.data.id) ? c.completions : [msg.data, ...c.completions] }
        : c));
    } else if (msg.type === 'chore_uncompleted') {
      const { date, day } = msg.data;
      setChores(prev => prev.map(c => c.id === msg.data.id
        ? { ...c, completions: c.completions.filter(x => {
            if (date) return x.date !== date;
            return x.day !== day || (Date.now() - new Date(x.completedAt).getTime()) > 86_400_000;
          }) }
        : c));
    }
  });
  const { user } = useUser();
  const { medium } = useHaptics();
  const { isTablet, fs, sp, isSplitView } = useTablet();
  const insets = useSafeAreaInsets();
  const userId = user?.id;

  const [weekRef, setWeekRef] = useState(new Date());
  // Two virtualised pagers: the day-row swipes weeks, the content swipes days.
  // Both are long lists indexed by absolute offset from a fixed base, so they
  // never recenter (recentering is what made the old 3-page pagers flash).
  const dayListRef = useRef<FlatList<number>>(null);
  const weekRowListRef = useRef<FlatList<number>>(null);
  const weekScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dayScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set true in scroll handlers before calling setWeekRef/setSelectedDay so the
  // useEffect below skips calling scrollToOffset (which would interrupt CSS snap
  // on iOS Safari web — the "flyger iväg" bug).
  const weekScrollFromUser = useRef(false);
  const dayScrollFromUser = useRef(false);
  // Pre-measured window-rect of the day-row for the onboarding swipe tip's
  // spotlight ring + finger animation. Captured one-shot via a callback ref
  // on the dayRow itself (measureInWindow on the FlatList wrapper reports
  // wrong dimensions on Android virtualised content).
  const [weekRowRect, setWeekRowRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const { width: weekPageW, height: windowHeight } = useWindowDimensions();
  const DAY_SPAN = 400; // ~13 months of days each way
  const WEEK_SPAN = 104; // ~2 years of weeks each way
  const dayIndices = useMemo(() => Array.from({ length: DAY_SPAN * 2 + 1 }, (_, i) => i - DAY_SPAN), []);
  const weekRowIndices = useMemo(() => Array.from({ length: WEEK_SPAN * 2 + 1 }, (_, i) => i - WEEK_SPAN), []);
  const dayBase = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const weekBase = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const DAY_MS = 86400000;
  const dateForDayIndex = (i: number) => new Date(dayBase.getTime() + i * DAY_MS);
  const dayIndexForDate = (date: Date) => Math.round((date.getTime() - dayBase.getTime()) / DAY_MS);
  const mondayForWeekIndex = (i: number) => new Date(weekBase.getTime() + i * 7 * DAY_MS);
  const weekIndexForMonday = (mon: Date) => Math.round((mon.getTime() - weekBase.getTime()) / (7 * DAY_MS));
  const [monthRef, setMonthRef] = useState(new Date());
  const { weekYear, weekNumber } = getISOWeek(weekRef);

  const weekMonday = useMemo(() => {
    const d = new Date(weekRef);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekRef]);

  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [menuItems, setMenuItems] = useState<WeekMenuItemWithRecipe[]>([]);
  const [chores, setChores] = useState<ChoreWithCompletion[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<WeekDay>(TODAY_DAY);
  const [refreshKey, setRefreshKey] = useState(0);

  const selectedDayIndex = DAYS.findIndex(d => d.key === selectedDay);
  const selectedDayDate = new Date(weekMonday.getTime() + selectedDayIndex * DAY_MS);
  const selectedDayDateStr = `${selectedDayDate.getFullYear()}-${String(selectedDayDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDayDate.getDate()).padStart(2, '0')}`;

  // Slide both pagers to the current week/day whenever it changes from any
  // source (swipe, tab tap, arrows, "Idag", month-pick). Absolute indexing means
  // the target page already shows the right data, so this never flashes — the
  // list that was just swiped is already there (no-op) and only the other one
  // moves to follow.
  useEffect(() => {
    const di = Math.min(DAY_SPAN, Math.max(-DAY_SPAN, dayIndexForDate(selectedDayDate))) + DAY_SPAN;
    const wi = Math.min(WEEK_SPAN, Math.max(-WEEK_SPAN, weekIndexForMonday(weekMonday))) + WEEK_SPAN;
    // Skip scrollToOffset when the user's own swipe triggered the state change —
    // calling it mid-CSS-snap on iOS Safari web causes the "flyger iväg" jump.
    if (!dayScrollFromUser.current) dayListRef.current?.scrollToOffset({ offset: di * weekPageW, animated: false });
    if (!weekScrollFromUser.current) weekRowListRef.current?.scrollToOffset({ offset: wi * weekPageW, animated: false });
    weekScrollFromUser.current = false;
    dayScrollFromUser.current = false;
  }, [weekRef, selectedDay, weekPageW]);

  // Filter
  const { filterMemberIds, setFilterMemberIds } = useMemberFilter();
  const [tabletCalendarView, setTabletCalendarView] = useState<'month' | 'week'>('month');
  const [showFilterModal, setShowFilterModal] = useState(false);

  const newModalScrollRef = useRef<ScrollView>(null);
  const newTimeSectionY = useRef(0);
  const editModalScrollRef = useRef<ScrollView>(null);
  const editTimeSectionY = useRef(0);

  // New entry modal
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [timeEnabled, setTimeEnabled] = useState(false);
  const [newHour, setNewHour] = useState(12);
  const [newMinute, setNewMinute] = useState(0);
  const [newDay, setNewDay] = useState<WeekDay>(TODAY_DAY);
  const [newIsShared, setNewIsShared] = useState(true);
  const [newRemindEnabled, setNewRemindEnabled] = useState(false);
  const [newRemindMinutes, setNewRemindMinutes] = useState<number[]>([]);
  const [newRemindDialValue, setNewRemindDialValue] = useState(0);
  const [showNewRemindDial, setShowNewRemindDial] = useState(false);
  const [showNewQuickPick, setShowNewQuickPick] = useState(false);
  const [newAssignedToMany, setNewAssignedToMany] = useState<string[]>([]);
  const [newRecurrenceType, setNewRecurrenceType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('none');
  const [newRecurrenceDays, setNewRecurrenceDays] = useState<WeekDay[]>([]);
  const [newRecurrenceWeeks, setNewRecurrenceWeeks] = useState(1);
  const [creating, setCreating] = useState(false);
  const [showWeekPicker, setShowWeekPicker] = useState(false);

  // Edit entry modal
  const [editingEntry, setEditingEntry] = useState<ScheduleEntry | null>(null);
  const [viewingEntry, setViewingEntry] = useState<ScheduleEntry | null>(null);
  const [entryConflict, setEntryConflict] = useState<{ msg: string; latest: ScheduleEntry } | null>(null);
  const [editEntryTitle, setEditEntryTitle] = useState('');
  const [editEntryTimeEnabled, setEditEntryTimeEnabled] = useState(false);
  const [editEntryHour, setEditEntryHour] = useState(12);
  const [editEntryMinute, setEditEntryMinute] = useState(0);
  const [editEntryDay, setEditEntryDay] = useState<WeekDay>(TODAY_DAY);
  const [editEntryIsShared, setEditEntryIsShared] = useState(true);
  const [editRemindEnabled, setEditRemindEnabled] = useState(false);
  const [editEntryRemindMinutes, setEditEntryRemindMinutes] = useState<number[]>([]);
  const [editRemindDialValue, setEditRemindDialValue] = useState(0);
  const [showEditRemindDial, setShowEditRemindDial] = useState(false);
  const [showEditQuickPick, setShowEditQuickPick] = useState(false);
  const [editEntryAssignedToMany, setEditEntryAssignedToMany] = useState<string[]>([]);
  const [savingEntry, setSavingEntry] = useState(false);

  // New entry date range + recurrence
  const [newStartDate, setNewStartDate] = useState<string | null>(null);
  const [newEndDate, setNewEndDate] = useState<string | null>(null);
  const [showNewStartPicker, setShowNewStartPicker] = useState(false);
  const [showNewEndPicker, setShowNewEndPicker] = useState(false);
  const [newMonthlyType, setNewMonthlyType] = useState<'day_of_month' | 'weekday_of_month'>('day_of_month');
  const [newRecurrenceWeekOfMonth, setNewRecurrenceWeekOfMonth] = useState<number>(1);

  // Edit entry state
  const [editMode, setEditMode] = useState<'single' | 'series'>('series');
  const [editEntryRecurrenceType, setEditEntryRecurrenceType] = useState<'none' | 'daily' | 'weekly' | 'custom_days' | 'monthly' | 'yearly'>('none');
  const [editEntryRecurrenceDays, setEditEntryRecurrenceDays] = useState<WeekDay[]>([]);
  const [editEntryRecurrenceWeeks, setEditEntryRecurrenceWeeks] = useState(1);
  const [editEntryMonthlyType, setEditEntryMonthlyType] = useState<'day_of_month' | 'weekday_of_month'>('day_of_month');
  const [editEntryRecurrenceWeekOfMonth, setEditEntryRecurrenceWeekOfMonth] = useState<number>(1);
  const [editEntryStartDate, setEditEntryStartDate] = useState<string | null>(null);
  const [editEntryEndDate, setEditEntryEndDate] = useState<string | null>(null);
  const [showEditStartPicker, setShowEditStartPicker] = useState(false);
  const [showEditEndPicker, setShowEditEndPicker] = useState(false);

  // Edit chore modal (from calendar)
  const [editingCalChore, setEditingCalChore] = useState<ChoreWithCompletion | null>(null);
  const [calChoreConflict, setCalChoreConflict] = useState<{ msg: string; latest: ChoreWithCompletion } | null>(null);
  const [editCalChoreTitle, setEditCalChoreTitle] = useState('');
  // Clear the conflict banner whenever the opened entity changes (open / switch
  // / close); a socket update to the same open entity keeps the id, so the
  // banner set by the handler survives.
  useEffect(() => { setEntryConflict(null); }, [editingEntry?.id]);
  useEffect(() => { setCalChoreConflict(null); }, [editingCalChore?.id]);
  const [editCalChoreAssignedTo, setEditCalChoreAssignedTo] = useState<string | null>(null);
  const [savingCalChore, setSavingCalChore] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const [scheduleData, menuData, choreData, household] = await Promise.all([
        client.getSchedule(householdId),
        client.getWeekMenu(householdId, weekYear, weekNumber),
        client.getChores(householdId),
        client.getHousehold(householdId),
      ]);
      setEntries(scheduleData);
      setMenuItems(menuData);
      setChores(choreData as ChoreWithCompletion[]);
      setMembers(household.members);
    } catch {
      confirm({ title: 'Fel', message: str.toasts.errorLoad, buttons: [{ label: common.actions.ok }] });
    } finally {
      setLoading(false);
    }
  }, [householdId, weekYear, weekNumber, refreshKey]);

  // Reload data on focus but DON'T reset week/day — preserves user's position when
  // navigating to a recipe and back. They can tap "Idag" to return to today.
  useFocusEffect(useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []));

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    if (!householdId) return;
    setRefreshing(true);
    try {
      const [scheduleData, menuData, choreData, household] = await Promise.all([
        client.getSchedule(householdId),
        client.getWeekMenu(householdId, weekYear, weekNumber),
        client.getChores(householdId),
        client.getHousehold(householdId),
      ]);
      setEntries(scheduleData);
      setMenuItems(menuData);
      setChores(choreData as ChoreWithCompletion[]);
      setMembers(household.members);
    } catch { /* keep stale */ }
    finally { setRefreshing(false); }
  }, [householdId, weekYear, weekNumber]);

  // Kalender-swipe-tip: två dolda gester i kalendern — svep på veckodags-baren
  // byter vecka, svep på själva dag-innehållet byter dag. Centrerat (ingen
  // ring, eftersom det är gester inte en knapp).
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (calendarSwipeTip.seen !== false || calendarSwipeTipShownRef.current) return;
    if (!weekRowRect) return; // vänta tills onLayout fångat rect (re-deps nedan)
    const shown = showTip({
      title: str.tips.swipe.title,
      message: str.tips.swipe.message,
      targetRect: weekRowRect,
      swipeDemo: 'horizontal',
    });
    if (shown) { calendarSwipeTipShownRef.current = true; calendarSwipeTip.markSeen(); }
  }, [tipsReady, calendarSwipeTip.seen, calendarSwipeTip.markSeen, showTip, weekRowRect]));

  // Origins-tip: kalendern visar saker som SKAPAS i andra flikar (recept → meny
  // → här; sysslor-fliken → här). Förklaras EN gång efter att swipe-tipset är
  // dismissat (queue:as via showTip's hasNext-knapp).
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (originsTip.seen !== false || originsTipShownRef.current) return;
    const shown = showTip({
      title: str.tips.origins.title,
      message: str.tips.origins.message,
    });
    if (shown) { originsTipShownRef.current = true; originsTip.markSeen(); }
  }, [tipsReady, originsTip.seen, originsTip.markSeen, showTip]));

  // Filter-tip: använder useFocusEffect så det bara fyrar från den AKTIVA
  // fliken. Sysslor-fliken delar flagga `seen-filter-tip` — vem som ser
  // tipset först beror på vilken flik användaren öppnar först, inte vems
  // useEffect som vinner mount-racet.
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (filterTip.seen !== false || filterTipShownRef.current) return;
    if (members.length === 0) return;
    const shown = showTip({
      title: str.tips.filter.title,
      message: str.tips.filter.message,
      targetRef: filterBtnRef,
    });
    if (shown) { filterTipShownRef.current = true; filterTip.markSeen(); }
  }, [tipsReady, members.length, filterTip.seen, filterTip.markSeen, showTip]));

  // Deep link from a tapped activity notification (L45): land on the calendar
  // tab and show the entry's read-only summary (not the edit dialog), then clear
  // the param so it won't re-fire.
  useEffect(() => {
    const id = deeplinkParams.entryId;
    if (!id || entries.length === 0 || openedEntryParamRef.current === id) return;
    const entry = entries.find(e => e.id === id);
    if (entry) {
      openedEntryParamRef.current = id;
      setViewingEntry(entry);
      router.setParams({ entryId: undefined });
    }
  }, [deeplinkParams.entryId, entries, router]);

  function getMemberName(memberId: string | null) {
    if (!memberId) return null;
    return members.find(m => m.id === memberId)?.displayName ?? null;
  }

  function isDoneOnDate(completions: ChoreCompletion[], dateStr: string, day: WeekDay) {
    return completions.some(c => {
      if (c.date) return c.date === dateStr;
      // Legacy fallback (completions before the date column was added): match weekday within 24h.
      return c.day === day && Date.now() - new Date(c.completedAt).getTime() < 86400000;
    });
  }

  function choreVisibleOnDay(chore: ChoreWithCompletion, day: WeekDay, actualDate: Date): boolean {
    if (chore.recurrenceType && chore.recurrenceType !== 'none') {
      return occursOn({
        recurrenceType: chore.recurrenceType,
        recurrenceWeeks: chore.recurrenceWeeks,
        recurrenceDays: chore.days,
        monthlyType: chore.monthlyType,
        recurrenceWeekOfMonth: chore.recurrenceWeekOfMonth,
        startDate: chore.startDate,
        endDate: chore.endDate,
      }, actualDate);
    }
    if (chore.frequency === 'once') return false;
    return occursOn({
      recurrenceType: chore.frequency === 'daily' ? 'daily' : chore.frequency === 'monthly' ? 'monthly' : 'weekly',
      recurrenceWeeks: chore.frequency === 'biweekly' ? 2 : 1,
      recurrenceDays: chore.days.length > 0 ? chore.days : [day],
      startDate: chore.startDate ?? null,
      endDate: chore.endDate ?? null,
    }, actualDate);
  }

  async function uncompleteChoreCalendar(chore: ChoreWithCompletion, day: WeekDay, dateStr: string) {
    const saved = chore.completions;
    setChores(cs => cs.map(c => c.id === chore.id
      ? { ...c, completions: c.completions.filter(comp =>
          !(comp.date === dateStr || (comp.date == null && comp.day === day && Date.now() - new Date(comp.completedAt).getTime() < 86400000)))
        }
      : c));
    try {
      await client.uncompleteChore(chore.id, day, dateStr);
    } catch (e) {
      setChores(cs => cs.map(c => c.id === chore.id ? { ...c, completions: saved } : c));
      showError(e, choresStr.toasts.errorUncomplete);
    }
  }

  function resetNewEntryForm() {
    setNewTitle('');
    setTimeEnabled(false);
    setNewHour(12);
    setNewMinute(0);
    setNewIsShared(true);
    setNewRemindEnabled(false);
    setNewRemindMinutes([]);
    setNewRemindDialValue(0);
    setShowNewRemindDial(false);
    setShowNewQuickPick(false);
    setNewAssignedToMany([]);
    setNewRecurrenceType('none');
    setNewRecurrenceDays([]);
    setNewRecurrenceWeeks(1);
    setNewMonthlyType('day_of_month');
    setNewRecurrenceWeekOfMonth(1);
    setNewStartDate(null);
    setNewEndDate(null);
  }

  // Always open a fresh dialog so an abandoned (cancelled) entry doesn't reappear.
  function openNewEntry(day: WeekDay) {
    resetNewEntryForm();
    setNewDay(day);
    setShowModal(true);
  }

  async function createEntry() {
    if (!householdId || !newTitle.trim()) return;
    setCreating(true);
    try {
      // Anchor one-offs to the concrete date of newDay in the viewed week, so
      // they render only that day instead of every matching weekday.
      const newDayIdx = DAYS.findIndex(d => d.key === newDay);
      const newDayDateStr = toIsoLocal(new Date(weekMonday.getTime() + newDayIdx * DAY_MS));
      const entry = await client.createScheduleEntry({
        householdId,
        title: newTitle.trim(),
        day: newDay,
        startTime: timeEnabled
          ? `${newHour.toString().padStart(2, '0')}:${MIN_VALS[newMinute]}`
          : undefined,
        assignedToMany: newAssignedToMany,
        isShared: newIsShared,
        remind: timeEnabled && newRemindEnabled,
        remindMinutes: timeEnabled && newRemindEnabled
          ? (newRemindMinutes.length > 0 ? newRemindMinutes : [newRemindDialValue])
          : [],
        recurrenceType: newRecurrenceType,
        recurrenceDays: newRecurrenceType === 'weekly' ? newRecurrenceDays : undefined,
        recurrenceWeeks: newRecurrenceType !== 'none' ? newRecurrenceWeeks : undefined,
        monthlyType: newRecurrenceType === 'monthly' ? newMonthlyType : undefined,
        recurrenceWeekOfMonth: newRecurrenceType === 'monthly' && newMonthlyType === 'weekday_of_month' ? newRecurrenceWeekOfMonth : undefined,
        startDate: newRecurrenceType === 'none' ? newDayDateStr : (newStartDate ?? toIsoLocal(new Date())),
        endDate: newRecurrenceType === 'none' ? newDayDateStr : newEndDate,
      });
      setEntries(prev => prev.some(e => e.id === entry.id) ? prev : [...prev, entry]);
      setShowModal(false);
      resetNewEntryForm();
      showToast(str.toasts.created, 'success');
    } catch (e: any) {
      showError(e, e?.message ?? str.toasts.errorCreate);
    } finally {
      setCreating(false);
    }
  }

  async function deleteEntry(entry: ScheduleEntry, dateStr: string) {
    if (entry.recurrenceType !== 'none') {
      confirm({
        title: str.deleteScope.title,
        message: str.deleteScope.message(entry.title),
        buttons: [
          {
            label: str.deleteScope.single,
            onPress: async () => {
              try {
                const result = await client.deleteScheduleEntry(entry.id, dateStr);
                if (result) {
                  setEntries(prev => prev.map(e => e.id === entry.id ? result as ScheduleEntry : e));
                }
                setEditingEntry(null);
              } catch (e) {
                showError(e, str.toasts.errorDelete);
              }
            },
          },
          {
            label: str.deleteScope.series, style: 'destructive',
            onPress: async () => {
              try {
                await client.deleteScheduleEntry(entry.id);
                setEntries(prev => prev.filter(e => e.id !== entry.id));
                setEditingEntry(null);
              } catch (e) {
                showError(e, str.toasts.errorDelete);
              }
            },
          },
          { label: common.actions.cancel, style: 'cancel' },
        ],
      });
    } else {
      confirm({
        title: str.deleteOnce.title,
        message: str.deleteScope.message(entry.title),
        buttons: [
          {
            label: str.deleteOnce.confirm, style: 'destructive',
            onPress: () => {
              const prev = entries;
              setEntries(p => p.filter(e => e.id !== entry.id));
              setEditingEntry(null);
              let cancelled = false;
              showToast(str.toasts.deleted, 'neutral', {
                label: common.actions.undo,
                onPress: () => { cancelled = true; setEntries(prev); },
              });
              setTimeout(async () => {
                if (cancelled) return;
                try { await client.deleteScheduleEntry(entry.id); }
                catch (e) { setEntries(prev); showError(e, str.toasts.errorDelete); }
              }, 5000);
            },
          },
          { label: common.actions.cancel, style: 'cancel' },
        ],
      });
    }
  }

  async function completeChoreCalendar(chore: ChoreWithCompletion, day: WeekDay, dateStr: string) {
    const fakeId = '__opt__';
    const fake: ChoreCompletion = { id: fakeId, choreId: chore.id, completedBy: '', performedByMemberId: null, completedAt: new Date().toISOString(), note: null, day, date: dateStr };
    setChores(cs => cs.map(c => c.id === chore.id ? { ...c, completions: [fake, ...c.completions] } : c));
    try {
      const completion = await client.completeChore(chore.id, day, undefined, dateStr);
      setChores(cs => cs.map(c => c.id === chore.id
        ? { ...c, completions: c.completions.map(comp => comp.id === fakeId ? completion : comp) }
        : c));
    } catch (e) {
      setChores(cs => cs.map(c => c.id === chore.id
        ? { ...c, completions: c.completions.filter(comp => comp.id !== fakeId) }
        : c));
      showError(e, choresStr.toasts.errorComplete);
    }
  }

  async function deleteChoreCalendar(choreId: string, title: string) {
    confirm({
      title: choresStr.delete.title,
      message: choresStr.delete.message(title),
      buttons: [
        {
          label: choresStr.delete.confirm, style: 'destructive',
          onPress: () => {
            const prev = chores;
            setChores(p => p.filter(c => c.id !== choreId));
            let cancelled = false;
            showToast(choresStr.toasts.deleted, 'neutral', {
              label: common.actions.undo,
              onPress: () => { cancelled = true; setChores(prev); },
            });
            setTimeout(async () => {
              if (cancelled) return;
              try { await client.deleteChore(choreId); }
              catch (e) { setChores(prev); showError(e, common.errors.couldNotDelete('sysslan')); }
            }, 5000);
          },
        },
        { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }

  function doOpenEditEntry(entry: ScheduleEntry, mode: 'single' | 'series') {
    setEditMode(mode);
    setEditingEntry(entry);
    setEditEntryTitle(entry.title);
    setEditEntryDay(entry.day);
    setEditEntryIsShared(entry.isShared);
    const loadedRemind = [...(entry.remindMinutes?.length ? entry.remindMinutes : (entry.remind ? [5] : []))].sort((a, b) => a - b);
    setEditRemindEnabled(loadedRemind.length > 0);
    setEditEntryRemindMinutes(loadedRemind);
    setEditRemindDialValue(0);
    setShowEditRemindDial(false);
    setShowEditQuickPick(false);
    setEditEntryAssignedToMany(entry.assignedToMany && entry.assignedToMany.length > 0 ? entry.assignedToMany : (entry.assignedTo ? [entry.assignedTo] : []));
    setEditEntryRecurrenceType(entry.recurrenceType as any);
    setEditEntryRecurrenceDays(entry.recurrenceDays as WeekDay[]);
    setEditEntryRecurrenceWeeks(entry.recurrenceWeeks ?? 1);
    setEditEntryMonthlyType((entry.monthlyType as any) ?? 'day_of_month');
    setEditEntryRecurrenceWeekOfMonth(entry.recurrenceWeekOfMonth ?? 1);
    setEditEntryStartDate(entry.startDate ?? null);
    setEditEntryEndDate(entry.endDate ?? null);
    if (entry.startTime) {
      const [h, m] = entry.startTime.split(':').map(Number);
      setEditEntryTimeEnabled(true);
      setEditEntryHour(h);
      setEditEntryMinute(Math.round(m / 5));
    } else {
      setEditEntryTimeEnabled(false);
      setEditEntryHour(12);
      setEditEntryMinute(0);
    }
  }

  function openEditEntry(entry: ScheduleEntry) {
    if (entry.recurrenceType !== 'none') {
      confirm({
        title: str.editScope.dialogTitle,
        message: str.editScope.title,
        buttons: [
          { label: str.editScope.single, onPress: () => doOpenEditEntry(entry, 'single') },
          { label: str.editScope.series, onPress: () => doOpenEditEntry(entry, 'series') },
          { label: common.actions.cancel, style: 'cancel' },
        ],
      });
    } else {
      doOpenEditEntry(entry, 'series');
    }
  }

  function openEntryActions(entry: ScheduleEntry) {
    confirm({
      variant: 'menu',
      buttons: [
        { label: common.actions.edit, icon: 'create-outline', onPress: () => { setViewingEntry(null); openEditEntry(entry); } },
        { label: common.actions.delete, icon: 'trash-outline', style: 'destructive', onPress: () => { setViewingEntry(null); deleteEntry(entry, selectedDayDateStr); } },
        { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }

  // Mänsklig sammanfattning av upprepningen för läsvyn.
  function recurrenceSummary(entry: ScheduleEntry): string {
    const every = str.recurrenceSummary.every(entry.recurrenceWeeks);
    switch (entry.recurrenceType) {
      case 'none':
        return str.recurrenceSummary.once;
      case 'daily':
        return str.recurrenceSummary.daily(entry.recurrenceWeeks);
      case 'weekly':
      case 'custom_days': {
        const days = (entry.recurrenceDays?.length ? entry.recurrenceDays : [entry.day])
          .map(k => DAYS.find(d => d.key === k)?.label ?? k);
        return str.recurrenceSummary.weekly(every, days.join(', '));
      }
      case 'monthly':
        return str.recurrenceSummary.monthly(every);
      case 'yearly':
        return str.recurrenceSummary.yearly(every);
      default:
        return '';
    }
  }

  async function saveEditEntry() {
    if (!editingEntry || !editEntryTitle.trim()) return;
    setSavingEntry(true);
    try {
      const startTime = editEntryTimeEnabled
        ? `${editEntryHour.toString().padStart(2, '0')}:${MIN_VALS[editEntryMinute]}`
        : null;

      if (editMode === 'single') {
        // Add this date to exceptions on the original, then create a one-off entry
        const withException = await client.deleteScheduleEntry(editingEntry.id, selectedDayDateStr);
        if (withException) {
          setEntries(prev => prev.map(e => e.id === editingEntry.id ? withException as ScheduleEntry : e));
        }
        const newEntry = await client.createScheduleEntry({
          householdId: editingEntry.householdId,
          title: editEntryTitle.trim(),
          day: editEntryDay,
          startTime: startTime ?? undefined,
          isShared: editEntryIsShared,
          remind: editEntryTimeEnabled && editRemindEnabled,
          remindMinutes: editEntryTimeEnabled && editRemindEnabled
            ? (editEntryRemindMinutes.length > 0 ? editEntryRemindMinutes : [editRemindDialValue])
            : [],
          recurrenceType: 'none',
          startDate: selectedDayDateStr,
          endDate: selectedDayDateStr,
        });
        setEntries(prev => [...prev, newEntry]);
      } else {
        const updated = await client.updateScheduleEntry(editingEntry.id, {
          title: editEntryTitle.trim(),
          day: editEntryDay,
          startTime,
          isShared: editEntryIsShared,
          remind: editEntryTimeEnabled && editRemindEnabled,
          remindMinutes: editEntryTimeEnabled && editRemindEnabled
            ? (editEntryRemindMinutes.length > 0 ? editEntryRemindMinutes : [editRemindDialValue])
            : [],
          assignedToMany: editEntryAssignedToMany,
          recurrenceType: editEntryRecurrenceType,
          recurrenceDays: editEntryRecurrenceType === 'weekly' ? editEntryRecurrenceDays : [],
          recurrenceWeeks: editEntryRecurrenceWeeks,
          monthlyType: editEntryMonthlyType,
          recurrenceWeekOfMonth: editEntryRecurrenceType === 'monthly' && editEntryMonthlyType === 'weekday_of_month' ? editEntryRecurrenceWeekOfMonth : null,
          startDate: editEntryStartDate,
          endDate: editEntryEndDate,
        } as any);
        setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
      }
      setEditingEntry(null);
      showToast(str.toasts.saved, 'success');
    } catch (e) {
      showError(e, str.toasts.errorSave);
    } finally {
      setSavingEntry(false);
    }
  }

  function openEditCalChore(chore: ChoreWithCompletion) {
    setEditingCalChore(chore);
    setEditCalChoreTitle(chore.title);
    setEditCalChoreAssignedTo(chore.assignedTo);
  }

  async function saveCalChore() {
    if (!editingCalChore || !editCalChoreTitle.trim()) return;
    setSavingCalChore(true);
    try {
      await client.updateChore(editingCalChore.id, {
        title: editCalChoreTitle.trim(),
        assignedTo: editCalChoreAssignedTo,
      });
      setChores(prev => prev.map(c => c.id === editingCalChore.id
        ? { ...c, title: editCalChoreTitle.trim(), assignedTo: editCalChoreAssignedTo }
        : c
      ));
      setEditingCalChore(null);
    } catch (e) {
      showError(e, choresStr.toasts.errorSave);
    } finally {
      setSavingCalChore(false);
    }
  }

  function handleSelectDayFromMonth(date: Date) {
    const dow = date.getDay();
    const dayKey: WeekDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dow] as WeekDay;
    setSelectedDay(dayKey);
    setWeekRef(date);
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#4f46e5" /></View>;
  }

  const todayISOWeek = getISOWeek(new Date());
  const isCurrentWeek = weekYear === todayISOWeek.weekYear && weekNumber === todayISOWeek.weekNumber;
  const now = new Date();
  const isCurrentMonth = monthRef.getMonth() === now.getMonth() && monthRef.getFullYear() === now.getFullYear();

  const visibleEntries = entries.filter(e => e.isShared || e.createdBy === userId);
  const weekdayKeyOf = (date: Date): WeekDay =>
    (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()]) as WeekDay;
  const toIsoLocal = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Whether a schedule entry should render on a given absolute date. One-time
  // entries ('none') are anchored to their startDate; recurring entries delegate
  // to the shared occursOn() so the rule matches chores exactly. Matching on
  // weekday alone (the old behaviour) made one-offs repeat every week.
  const entryVisibleOnDate = (e: ScheduleEntry, date: Date): boolean => {
    const ds = toIsoLocal(date);
    if (e.exceptions?.includes(ds)) return false;
    if (e.recurrenceType === 'none') {
      // Date-anchored one-off. Legacy entries created before anchoring have no
      // startDate — fall back to weekday match so they don't silently vanish.
      return e.startDate ? e.startDate === ds : e.day === weekdayKeyOf(date);
    }
    return occursOn({
      recurrenceType: e.recurrenceType,
      recurrenceWeeks: e.recurrenceWeeks,
      recurrenceDays: e.recurrenceDays && e.recurrenceDays.length > 0 ? e.recurrenceDays : [e.day],
      monthlyType: e.monthlyType,
      recurrenceWeekOfMonth: e.recurrenceWeekOfMonth,
      startDate: e.startDate,
      endDate: e.endDate,
    }, date);
  };

  // Day data for an arbitrary absolute date — filters by THAT date's weekday so
  // the content day-pager can render the previous/next day (even across a week
  // boundary).
  const dayDataForDate = (date: Date) => {
    const wd = weekdayKeyOf(date);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dEntries = visibleEntries.filter(e =>
      entryVisibleOnDate(e, date) &&
      (filterMemberIds.length === 0 || ((e.assignedToMany && e.assignedToMany.some(id => filterMemberIds.includes(id))) || (e.assignedTo != null && filterMemberIds.includes(e.assignedTo))))
    ).sort((a, b) => {
      if (!a.startTime && b.startTime) return -1;
      if (a.startTime && !b.startTime) return 1;
      if (!a.startTime && !b.startTime) return 0;
      return (a.startTime ?? '').localeCompare(b.startTime ?? '');
    });
    const menu = menuItems.filter(i => i.day === wd);
    const dchores = chores.filter(c =>
      choreVisibleOnDay(c, wd, date) &&
      (filterMemberIds.length === 0 || (c.assignedToMany?.length ? c.assignedToMany : (c.assignedTo ? [c.assignedTo] : [])).some(id => filterMemberIds.includes(id)))
    ).sort((a, b) =>
      Number(isDoneOnDate(a.completions, dateStr, wd)) -
      Number(isDoneOnDate(b.completions, dateStr, wd))
    );
    return { date, dateStr, wd, entries: dEntries, menu, chores: dchores, isEmpty: dEntries.length === 0 && menu.length === 0 && dchores.length === 0 };
  };

  // Item count for a given weekday within an arbitrary week (for the day-row
  // week-pager, where neighbour pages show other weeks).
  const totalPerDayOn = (pageMonday: Date, day: WeekDay) => {
    const idx = DAYS.findIndex(d => d.key === day);
    const dt = new Date(pageMonday.getTime() + idx * 86400000);
    const filterActive = filterMemberIds.length > 0;
    return visibleEntries.filter(e =>
      entryVisibleOnDate(e, dt) &&
      (!filterActive || ((e.assignedToMany && e.assignedToMany.some(id => filterMemberIds.includes(id))) || (e.assignedTo != null && filterMemberIds.includes(e.assignedTo))))
    ).length +
      (filterActive ? 0 : menuItems.filter(i => i.day === day).length) +
      chores.filter(c =>
        choreVisibleOnDay(c, day, dt) &&
        (!filterActive || (c.assignedToMany?.length ? c.assignedToMany : (c.assignedTo ? [c.assignedTo] : [])).some(id => filterMemberIds.includes(id)))
      ).length;
  };
  const totalPerDay = (day: WeekDay) => totalPerDayOn(weekMonday, day);

  const cur = dayDataForDate(selectedDayDate);
  const isEmpty = cur.isEmpty;

  const renderDayDetail = (d: ReturnType<typeof dayDataForDate>) => (
    <>
      {d.menu.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>{str.sections.meals}</Text>
          {d.menu.map(item => (
            <Pressable
              key={item.id}
              style={s.menuCard}
              onPress={() => router.push(`/recipes/${item.recipeId}?from=calendar` as never)}
            >
              <View style={[s.menuIcon, { width: sp(32), height: sp(32) }]}>
                <Ionicons name="restaurant-outline" size={fs(16)} color="#4f46e5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuTitle, { fontSize: fs(15) }]} numberOfLines={1}>{item.recipe.title}</Text>
                <Text style={[s.menuMeta, { fontSize: fs(12) }]}>{item.servings ?? item.recipe.servings} port</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {d.chores.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>{str.sections.chores}</Text>
          {d.chores.map(chore => {
            const done = isDoneOnDate(chore.completions, d.dateStr, d.wd);
            const assignedName = getMemberName(chore.assignedTo);
            return (
              <Pressable
                key={chore.id}
                style={[s.choreCard, done && s.choreDone]}
                onPress={() => router.push(`/(tabs)/chores?choreId=${chore.id}` as never)}
              >
                <View style={[s.menuIcon, { backgroundColor: '#f5f3ff' }]}>
                  <Ionicons name="sparkles-outline" size={fs(16)} color="#7c3aed" />
                </View>
                <View style={s.choreInfo}>
                  <Text style={[s.choreTitle, { fontSize: fs(15) }, done && s.choreStrike]}>{chore.title}</Text>
                  {assignedName && (
                    <Text style={[s.choreAssigned, { fontSize: fs(12) }]}>{assignedName}</Text>
                  )}
                </View>
                <Pressable
                  style={[s.choreCheckBtn, { width: sp(32), height: sp(32), borderRadius: sp(16) }, done && s.choreCheckBtnDone]}
                  onPress={() => done ? uncompleteChoreCalendar(chore, d.wd, d.dateStr) : completeChoreCalendar(chore, d.wd, d.dateStr)}
                >
                  {done && <Ionicons name="checkmark" size={fs(18)} color="#fff" />}
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      )}

      {d.entries.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>{str.sections.entries}</Text>
          {d.entries.map(entry => {
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            let isPast = false;
            if (d.dateStr < todayStr) isPast = true;
            else if (d.dateStr === todayStr && entry.startTime) {
              const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
              isPast = entry.startTime < nowHHMM;
            }
            return (
            <Pressable
              key={entry.id}
              style={[s.entryCard, isPast && { opacity: 0.5 }]}
              onPress={() => setViewingEntry(entry)}
              onLongPress={() => { medium(); openEntryActions(entry); }}
            >
              <View style={[s.menuIcon, { backgroundColor: '#ecfeff' }]}>
                <Ionicons name="calendar-outline" size={fs(16)} color="#0891b2" />
              </View>
              <View style={s.entryContent}>
                <Text style={[s.entryTitle, { fontSize: fs(15) }, isPast && { textDecorationLine: 'line-through' }]}>{entry.title}</Text>
                {(() => {
                  const ids = entry.assignedToMany && entry.assignedToMany.length > 0
                    ? entry.assignedToMany
                    : entry.assignedTo ? [entry.assignedTo] : [];
                  const names = ids.map(id => getMemberName(id)).filter(Boolean) as string[];
                  if (names.length === 0) return null;
                  return <Text style={[s.choreAssigned, { fontSize: fs(12) }]}>{names.join(', ')}</Text>;
                })()}
                {entry.description && <Text style={[s.entryDesc, { fontSize: fs(13) }]}>{entry.description}</Text>}
              </View>
              <View style={s.entryRightCol}>
                <Text style={[s.entryRightTime, { fontSize: fs(13) }, isPast && { textDecorationLine: 'line-through' }]}>
                  {entry.startTime ?? str.allDay}
                </Text>
                {!entry.isShared && <Ionicons name="lock-closed-outline" size={fs(14)} color="#9ca3af" />}
              </View>
            </Pressable>
            );
          })}
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader
        title={str.title}
        actionNode={members.length > 0 ? (
          <Pressable ref={filterBtnRef} style={[s.filterBtn, filterMemberIds.length > 0 && s.filterBtnActive, { paddingHorizontal: sp(10), paddingVertical: sp(6) }]} onPress={() => setShowFilterModal(true)}>
            <Ionicons name="person-outline" size={fs(14)} color={filterMemberIds.length > 0 ? '#7c3aed' : '#6b7280'} />
            <Text style={[s.filterBtnText, filterMemberIds.length > 0 && s.filterBtnTextActive, { fontSize: fs(12) }]}>{choresStr.header.filter}</Text>
            {filterMemberIds.length > 0 && (
              <View style={s.filterBadge}>
                <Text style={s.filterBadgeText}>{filterMemberIds.length}</Text>
              </View>
            )}
          </Pressable>
        ) : undefined}
      />

      {isSplitView && tabletCalendarView === 'month' ? (
        <View style={s.tabletLayout}>
          <View style={s.tabletLeft}>
            <View style={s.tabletViewToggle}>
              <Pressable
                style={[s.viewToggleBtn, s.viewToggleBtnActive, { paddingHorizontal: sp(14), paddingVertical: sp(6) }]}
                onPress={() => setTabletCalendarView('month')}
              >
                <Text style={[s.viewToggleText, s.viewToggleTextActive, { fontSize: fs(13) }]}>{str.view.monthToggle}</Text>
              </Pressable>
              <Pressable
                style={[s.viewToggleBtn, { paddingHorizontal: sp(14), paddingVertical: sp(6) }]}
                onPress={() => setTabletCalendarView('week')}
              >
                <Text style={[s.viewToggleText, { fontSize: fs(13) }]}>{str.view.weekToggle}</Text>
              </Pressable>
            </View>
            <MonthView
              date={monthRef}
              onMonthChange={setMonthRef}
              entries={visibleEntries}
              chores={chores}
              userId={userId}
              onSelectDay={handleSelectDayFromMonth}
              onEditEntry={(entry) => setViewingEntry(entry)}
              onEditChore={(chore) => setEditingCalChore(chore)}
              onToday={!isCurrentMonth ? () => { setMonthRef(new Date()); setWeekRef(new Date()); setSelectedDay(weekdayKeyOf(new Date())); } : undefined}
              selectedDate={selectedDayDate}
              filterMemberIds={filterMemberIds}
            />
          </View>
          <View style={s.tabletRight}>
            <View style={s.tabletDayHeader}>
              <Text style={s.tabletDayTitle}>
                {DAYS.find(d => d.key === selectedDay)?.label}{' '}
                {selectedDayDate.getDate()}{' '}
                {selectedDayDate.toLocaleDateString('sv-SE', { month: 'long' })}
              </Text>
            </View>
            <ScrollView style={s.content} contentContainerStyle={[s.contentInner, isEmpty && s.contentEmpty]}>
              {isEmpty ? (
                <EmptyState
                  icon="calendar-outline"
                  title={str.emptyState.title}
                  subtitle={str.emptyState.subtitle}
                  actionLabel={str.emptyState.cta}
                  onAction={() => { openNewEntry(selectedDay); }}
                />
              ) : renderDayDetail(cur)}
            </ScrollView>
            <Pressable style={[s.fab, { width: sp(56), height: sp(56), borderRadius: sp(28) }]} onPress={wrapAddTip(
            () => openNewEntry(selectedDay),
            { title: str.tips.add.title, message: str.tips.add.message },
          )}>
              <Ionicons name="add" size={fs(30)} color="#fff" />
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {isSplitView && (
            <View style={s.tabletViewToggle}>
              <Pressable
                style={[s.viewToggleBtn, { paddingHorizontal: sp(14), paddingVertical: sp(6) }]}
                onPress={() => setTabletCalendarView('month')}
              >
                <Text style={[s.viewToggleText, { fontSize: fs(13) }]}>{str.view.monthToggle}</Text>
              </Pressable>
              <Pressable
                style={[s.viewToggleBtn, s.viewToggleBtnActive, { paddingHorizontal: sp(14), paddingVertical: sp(6) }]}
                onPress={() => setTabletCalendarView('week')}
              >
                <Text style={[s.viewToggleText, s.viewToggleTextActive, { fontSize: fs(13) }]}>{str.view.weekToggle}</Text>
              </Pressable>
            </View>
          )}
          <WeekNav
            weekLabel={str.weekLabel(weekNumber)}
            isCurrentWeek={isCurrentWeek}
            onPrev={() => setWeekRef(w => addWeeks(w, -1))}
            onNext={() => setWeekRef(w => addWeeks(w, 1))}
            onToday={() => { setWeekRef(new Date()); setSelectedDay(TODAY_DAY); }}
            onPickDate={() => setShowWeekPicker(true)}
          />

          {/* Day-row as a virtualised week pager: swipe the weekday bar to
              change week (keeps the selected weekday). Absolute-indexed, never
              recenters. */}
          <FlatList
            ref={weekRowListRef}
            data={weekRowIndices}
            keyExtractor={i => `w${i}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={[s.dayRowPager, (Platform.OS === 'web' ? { scrollSnapType: 'x mandatory' } : null) as any]}
            initialScrollIndex={weekIndexForMonday(weekMonday) + WEEK_SPAN}
            getItemLayout={(_, index) => ({ length: weekPageW, offset: weekPageW * index, index })}
            windowSize={5}
            maxToRenderPerBatch={3}
            extraData={{ weekRef, selectedDay, entries, menuItems, chores, filterMemberIds }}
            onScrollToIndexFailed={() => {}}
            scrollEventThrottle={16}
            onMomentumScrollEnd={e => {
              weekScrollFromUser.current = true;
              const wi = Math.round(e.nativeEvent.contentOffset.x / weekPageW) - WEEK_SPAN;
              const pm = mondayForWeekIndex(wi);
              if (weekIndexForMonday(weekMonday) !== wi) setWeekRef(pm);
            }}
            onScroll={Platform.OS === 'web' ? e => {
              const x = e.nativeEvent.contentOffset.x;
              if (weekScrollTimer.current) clearTimeout(weekScrollTimer.current);
              weekScrollTimer.current = setTimeout(() => {
                weekScrollFromUser.current = true;
                const wi = Math.round(x / weekPageW) - WEEK_SPAN;
                const pm = mondayForWeekIndex(wi);
                if (weekIndexForMonday(weekMonday) !== wi) setWeekRef(pm);
              }, 80);
            } : undefined}
            renderItem={({ item: wi }) => {
              const pm = mondayForWeekIndex(wi);
              return (
                <View
                  ref={node => {
                    // Capture window-rect for the onboarding swipe tip. dayRows
                    // är virtualiserade — vi tar bara den SYNLIGA (x ≈ 0),
                    // annars får vi en off-screen-instans till vänster. One-shot
                    // via weekRowRect-guard.
                    if (!node || weekRowRect) return;
                    setTimeout(() => {
                      node.measureInWindow((x, y, width, height) => {
                        if (width > 0 && height > 0 && Math.abs(x) < 5) {
                          setWeekRowRect({ x, y, width, height });
                        }
                      });
                    }, 200);
                  }}
                  style={[s.dayRow, { width: weekPageW }]}
                  {...((Platform.OS === 'web' ? { dataSet: { weekpage: '' } } : {}) as any)}
                  collapsable={false}
                >
                  {DAYS.map((day, i) => {
                    const count = totalPerDayOn(pm, day.key);
                    const dayDate = new Date(pm.getTime() + i * DAY_MS);
                    const today = new Date();
                    const isToday = dayDate.getDate() === today.getDate() &&
                      dayDate.getMonth() === today.getMonth() &&
                      dayDate.getFullYear() === today.getFullYear();
                    const isActive = selectedDay === day.key;
                    return (
                      <Pressable
                        key={day.key}
                        style={[s.dayTab, isActive && s.dayTabActive, !isActive && count > 0 && s.dayTabHasContent]}
                        onPress={() => { setWeekRef(pm); setSelectedDay(day.key); }}
                      >
                        <Text style={[s.dayTabShort, isActive && s.dayTabTextActive]}>{day.short}</Text>
                        <Text style={[s.dayTabDate, isActive && s.dayTabTextActive]}>{dayDate.getDate()}</Text>
                        <View style={[s.todayDot, isActive && s.todayDotActive, !isToday && s.todayDotHidden]} />
                      </Pressable>
                    );
                  })}
                </View>
              );
            }}
          />

          {/* Content as a virtualised day pager: swipe the detail area to go to
              the previous / next day (rolls over into the adjacent week).
              Absolute-indexed, never recenters → no flash. */}
          <FlatList
            ref={dayListRef}
            data={dayIndices}
            keyExtractor={i => `d${i}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4f46e5" />}
            style={[s.content, (Platform.OS === 'web' ? { scrollSnapType: 'x mandatory' } : null) as any]}
            initialScrollIndex={dayIndexForDate(selectedDayDate) + DAY_SPAN}
            getItemLayout={(_, index) => ({ length: weekPageW, offset: weekPageW * index, index })}
            windowSize={15}
            initialNumToRender={1}
            maxToRenderPerBatch={3}
            extraData={{ weekRef, selectedDay, entries, menuItems, chores, filterMemberIds }}
            onScrollToIndexFailed={() => {}}
            scrollEventThrottle={16}
            onMomentumScrollEnd={e => {
              dayScrollFromUser.current = true;
              const di = Math.round(e.nativeEvent.contentOffset.x / weekPageW) - DAY_SPAN;
              const nd = dateForDayIndex(di);
              if (dayIndexForDate(selectedDayDate) !== di) {
                setSelectedDay(weekdayKeyOf(nd));
                setWeekRef(nd);
              }
            }}
            onScroll={Platform.OS === 'web' ? e => {
              const x = e.nativeEvent.contentOffset.x;
              if (dayScrollTimer.current) clearTimeout(dayScrollTimer.current);
              dayScrollTimer.current = setTimeout(() => {
                dayScrollFromUser.current = true;
                const di = Math.round(x / weekPageW) - DAY_SPAN;
                const nd = dateForDayIndex(di);
                if (dayIndexForDate(selectedDayDate) !== di) {
                  setSelectedDay(weekdayKeyOf(nd));
                  setWeekRef(nd);
                }
              }, 80);
            } : undefined}
            renderItem={({ item: di }) => {
              const d = dayDataForDate(dateForDayIndex(di));
              return (
                <ScrollView
                  style={{ width: weekPageW }}
                  {...((Platform.OS === 'web' ? { dataSet: { weekpage: '' } } : {}) as any)}
                  contentContainerStyle={[s.contentInner, d.isEmpty && s.contentEmpty]}
                >
                  {d.isEmpty ? (
                    <EmptyState
                      icon="calendar-outline"
                      title={str.emptyState.title}
                      subtitle={str.emptyState.subtitle}
                      actionLabel={str.emptyState.cta}
                      onAction={() => { openNewEntry(d.wd); }}
                    />
                  ) : renderDayDetail(d)}
                </ScrollView>
              );
            }}
          />

          <Pressable style={s.fab} onPress={wrapAddTip(
            () => openNewEntry(selectedDay),
            { title: str.tips.add.title, message: str.tips.add.message },
          )}>
            <Ionicons name="add" size={30} color="#fff" />
          </Pressable>
        </>
      )}

      {/* View entry — full-screen read-only view; edit/delete under the 3-dot */}
      <Modal visible={!!viewingEntry} animationType="slide" onRequestClose={() => setViewingEntry(null)}>
        <View style={[s.viewFull, { paddingTop: Platform.OS === 'ios' ? insets.top : 0 }]}>
          {viewingEntry && (() => {
            const e = viewingEntry;
            const ids = e.assignedToMany?.length ? e.assignedToMany : e.assignedTo ? [e.assignedTo] : [];
            const names = ids.map(id => getMemberName(id)).filter(Boolean) as string[];
            let dateLabel = DAYS.find(d => d.key === e.day)?.label ?? '';
            if (e.recurrenceType === 'none' && e.startDate) {
              const [yy, mm, dd] = e.startDate.split('-').map(Number);
              const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
              dateLabel = `${dateLabel} ${dd} ${months[mm - 1]} ${yy}`;
            }
            return (
              <>
                <View style={s.viewNav}>
                  <Pressable onPress={() => setViewingEntry(null)} hitSlop={8} style={s.viewNavBtn} accessibilityLabel={common.actions.close}>
                    <Ionicons name="arrow-back" size={24} color="#111827" />
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => openEntryActions(e)} hitSlop={8} style={s.viewNavBtn} accessibilityLabel={common.actions.more}>
                    <Ionicons name="ellipsis-vertical" size={22} color="#111827" />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={[s.viewBody, { paddingBottom: insets.bottom + 24 }]}>
                  <Text style={s.viewTitle}>{e.title}</Text>
                  <View style={s.viewRow}>
                    <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                    <Text style={s.viewRowText}>{dateLabel}</Text>
                  </View>
                  <View style={s.viewRow}>
                    <Ionicons name="time-outline" size={18} color="#6b7280" />
                    <Text style={s.viewRowText}>{e.startTime ?? str.allDay}</Text>
                  </View>
                  {!!(e.remindMinutes?.length) && (
                    <View style={s.viewRow}>
                      <Ionicons name="notifications-outline" size={18} color="#6b7280" />
                      <Text style={s.viewRowText}>{(() => { const times = [...e.remindMinutes].sort((a, b) => a - b).map(m => formatRemindTime(m)); return times.every(t => t === str.remind.atStart) ? times.join(', ') : str.remind.before(times.join(', ')); })()}</Text>
                    </View>
                  )}
                  <View style={s.viewRow}>
                    <Ionicons name="repeat-outline" size={18} color="#6b7280" />
                    <Text style={s.viewRowText}>{recurrenceSummary(e)}</Text>
                  </View>
                  {names.length > 0 && (
                    <View style={s.viewRow}>
                      <Ionicons name="people-outline" size={18} color="#6b7280" />
                      <Text style={s.viewRowText}>{names.join(', ')}</Text>
                    </View>
                  )}
                  <View style={s.viewRow}>
                    <Ionicons name={e.isShared ? 'earth-outline' : 'lock-closed-outline'} size={18} color="#6b7280" />
                    <Text style={s.viewRowText}>{e.isShared ? str.shared.isShared : str.shared.isPrivate}</Text>
                  </View>
                  {!!e.description && (
                    <View style={[s.viewRow, { alignItems: 'flex-start' }]}>
                      <Ionicons name="document-text-outline" size={18} color="#6b7280" style={{ marginTop: 2 }} />
                      <Text style={s.viewRowText}>{e.description}</Text>
                    </View>
                  )}
                </ScrollView>
              </>
            );
          })()}
        </View>
      </Modal>

      {/* Edit entry modal */}
      <Modal visible={!!editingEntry} transparent animationType="slide" onRequestClose={() => tryCloseCreate(editEntryTitle !== (editingEntry?.title ?? ''), () => setEditingEntry(null))}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => tryCloseCreate(editEntryTitle !== (editingEntry?.title ?? ''), () => setEditingEntry(null))} />
        <KeyboardAvoidingView pointerEvents="box-none" behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <View style={[s.sheet, { maxHeight: windowHeight * 0.80, paddingBottom: Math.max(8, insets.bottom) }]}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{str.form.editEntryTitle}</Text>
          <ConflictBanner
            message={entryConflict?.msg ?? null}
            onShowLatest={entryConflict ? () => { doOpenEditEntry(entryConflict.latest, editMode); setEntryConflict(null); } : undefined}
          />
          <ScrollView ref={editModalScrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetScroll}>
            <TextInput
              style={s.input}
              placeholder={str.form.titleLabel}
              placeholderTextColor="#9ca3af"
              value={editEntryTitle}
              onChangeText={setEditEntryTitle}
            />
            <View onLayout={e => { editTimeSectionY.current = e.nativeEvent.layout.y; }}>
            <View style={s.timeToggleRow}>
              <Text style={s.label}>{str.form.timeLabel}</Text>
              <Switch
                value={editEntryTimeEnabled}
                onValueChange={v => {
                  setEditEntryTimeEnabled(v);
                  if (v) setTimeout(() => editModalScrollRef.current?.scrollTo({ y: editTimeSectionY.current, animated: true }), 100);
                }}
                trackColor={{ true: '#4f46e5' }}
              />
            </View>
            {editEntryTimeEnabled && (
              <View style={s.drumRow}>
                <Drum values={HOUR_VALS} selected={editEntryHour} onSelect={setEditEntryHour} />
                <Text style={s.drumColon}>:</Text>
                <Drum values={MIN_VALS} selected={editEntryMinute} onSelect={setEditEntryMinute} />
              </View>
            )}
            {editEntryTimeEnabled && (
              <>
                <Pressable style={s.sharedRow} onPress={() => setEditRemindEnabled(v => !v)}>
                  <Ionicons name={editRemindEnabled ? 'notifications-outline' : 'notifications-off-outline'} size={18} color={editRemindEnabled ? '#4f46e5' : '#9ca3af'} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.sharedLabel}>{str.form.reminderLabel}</Text>
                    <Text style={s.sharedSub}>{editRemindEnabled ? str.form.reminderOnSub : str.form.reminderOffSub}</Text>
                  </View>
                  <Switch value={editRemindEnabled} onValueChange={v => { setEditRemindEnabled(v); if (!v) { setEditEntryRemindMinutes([]); setShowEditRemindDial(false); setShowEditQuickPick(false); } else { setShowEditQuickPick(true); } }} trackColor={{ true: '#4f46e5' }} />
                </Pressable>
                {editRemindEnabled && (
                  <>
                    {editEntryRemindMinutes.length > 0 && (
                      <View style={s.remindChips}>
                        {editEntryRemindMinutes.map((m) => (
                          <View key={m} style={s.remindChip}>
                            <Text style={s.remindChipText}>{formatRemindTime(m)}</Text>
                            <Pressable onPress={() => setEditEntryRemindMinutes(prev => prev.filter(x => x !== m))} hitSlop={8}>
                              <Ionicons name="close" size={14} color="#4f46e5" />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}
                    {showEditRemindDial ? (
                      <View style={{ alignItems: 'center', marginVertical: 12 }}>
                        <RemindDial minutes={editRemindDialValue} onChange={setEditRemindDialValue} onAdd={() => { setEditEntryRemindMinutes(prev => prev.includes(editRemindDialValue) ? prev : [...prev, editRemindDialValue].sort((a, b) => a - b)); setEditRemindDialValue(0); setShowEditRemindDial(false); }} />
                      </View>
                    ) : showEditQuickPick && editEntryRemindMinutes.length < 5 ? (
                      <View style={s.remindQuickRow}>
                        {REMIND_PRESETS.filter(p => !editEntryRemindMinutes.includes(p.value)).map(p => (
                          <Pressable
                            key={p.value}
                            style={s.remindQuickChip}
                            onPress={() => { setEditEntryRemindMinutes(prev => [...prev, p.value].sort((a, b) => a - b)); setShowEditQuickPick(false); }}
                          >
                            <Text style={s.remindQuickChipText}>{p.label}</Text>
                          </Pressable>
                        ))}
                        <Pressable onPress={() => { setShowEditRemindDial(true); setShowEditQuickPick(false); }}>
                          <Text style={s.remindCustomLink}>{str.remind.customTime}</Text>
                        </Pressable>
                      </View>
                    ) : editEntryRemindMinutes.length > 0 && editEntryRemindMinutes.length < 5 ? (
                      <Pressable style={s.remindMoreBtn} onPress={() => setShowEditQuickPick(true)}>
                        <Ionicons name="add-circle-outline" size={18} color="#4f46e5" />
                        <Text style={s.remindMoreBtnText}>{str.remind.addReminder}</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </>
            )}
            </View>
            {editMode === 'series' && (
              <RecurrencePicker
                recurrenceType={editEntryRecurrenceType}
                recurrenceWeeks={editEntryRecurrenceWeeks}
                recurrenceDays={editEntryRecurrenceDays}
                monthlyType={editEntryMonthlyType}
                recurrenceWeekOfMonth={editEntryRecurrenceWeekOfMonth}
                endDate={editEntryEndDate}
                referenceDate={selectedDayDate}
                referenceDay={editEntryDay}
                onChangeType={setEditEntryRecurrenceType}
                onChangeWeeks={setEditEntryRecurrenceWeeks}
                onChangeDays={setEditEntryRecurrenceDays}
                onChangeMonthlyType={setEditEntryMonthlyType}
                onChangeWeekOfMonth={setEditEntryRecurrenceWeekOfMonth}
                onChangeEndDate={setEditEntryEndDate}
                onOpenEndPicker={() => setShowEditEndPicker(true)}
              />
            )}
            <Pressable style={s.sharedRow} onPress={() => setEditEntryIsShared(v => { if (v) setEditEntryAssignedToMany([]); return !v; })}>
              <Ionicons name={editEntryIsShared ? 'earth-outline' : 'lock-closed-outline'} size={18} color={editEntryIsShared ? '#4f46e5' : '#9ca3af'} />
              <View style={{ flex: 1 }}>
                <Text style={s.sharedLabel}>{editEntryIsShared ? str.shared.isShared : str.shared.isPrivate}</Text>
                <Text style={s.sharedSub}>{editEntryIsShared ? str.shared.sharedSub : str.shared.privateSub}</Text>
              </View>
              <Switch value={editEntryIsShared} onValueChange={v => { setEditEntryIsShared(v); if (!v) setEditEntryAssignedToMany([]); }} trackColor={{ true: '#4f46e5' }} />
            </Pressable>
            {members.length > 0 && editEntryIsShared && (
              <>
                <Text style={s.label}>{str.form.assignLabel}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.memberPickerRow}>
                  {members.map(m => {
                    const active = editEntryAssignedToMany.includes(m.id);
                    return (
                      <Pressable
                        key={m.id}
                        style={[s.memberOption, active && s.memberOptionActive]}
                        onPress={() => setEditEntryAssignedToMany(prev => active ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                      >
                        <Text style={[s.memberOptionText, active && s.memberOptionTextActive]}>{m.displayName}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}
            <View style={s.editModalActions}>
              <Pressable style={s.deleteActionBtn} onPress={() => { if (editingEntry) deleteEntry(editingEntry, selectedDayDateStr); }}>
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={s.deleteActionText}>{common.actions.delete}</Text>
              </Pressable>
              <Pressable
                style={[s.button, { flex: 1, marginTop: 0 }, (!editEntryTitle.trim() || savingEntry) && s.buttonDisabled]}
                onPress={saveEditEntry}
                disabled={savingEntry || !editEntryTitle.trim()}
              >
                {savingEntry ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{common.actions.save}</Text>}
              </Pressable>
            </View>
          </ScrollView>
          </View>
          </KeyboardAvoidingView>
      </Modal>

      {/* Edit chore from calendar modal */}
      <Modal visible={!!editingCalChore} transparent animationType="slide" onRequestClose={() => setEditingCalChore(null)}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setEditingCalChore(null)} />
        <KeyboardAvoidingView pointerEvents="box-none" behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <View style={[s.sheet, { maxHeight: windowHeight * 0.80, paddingBottom: Math.max(8, insets.bottom) }]}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{str.form.editChoreTitle}</Text>
          <ConflictBanner
            message={calChoreConflict?.msg ?? null}
            onShowLatest={calChoreConflict ? () => { openEditCalChore(calChoreConflict.latest); setCalChoreConflict(null); } : undefined}
          />
          <View style={s.sheetScroll}>
            <TextInput
              style={s.input}
              placeholder={str.form.titleLabel}
              placeholderTextColor="#9ca3af"
              value={editCalChoreTitle}
              onChangeText={setEditCalChoreTitle}
            />
            <Text style={s.label}>{str.form.responsibleLabel}</Text>
            <View style={s.memberPickerRow}>
              <Pressable
                style={[s.memberOption, editCalChoreAssignedTo === null && s.memberOptionActive]}
                onPress={() => setEditCalChoreAssignedTo(null)}
              >
                <Text style={[s.memberOptionText, editCalChoreAssignedTo === null && s.memberOptionTextActive]}>{str.form.noOne}</Text>
              </Pressable>
              {members.map(m => (
                <Pressable
                  key={m.id}
                  style={[s.memberOption, editCalChoreAssignedTo === m.id && s.memberOptionActive]}
                  onPress={() => setEditCalChoreAssignedTo(m.id)}
                >
                  <Text style={[s.memberOptionText, editCalChoreAssignedTo === m.id && s.memberOptionTextActive]}>{m.displayName}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={s.navButton}
              onPress={() => { setEditingCalChore(null); router.push('/(tabs)/chores' as never); }}
            >
              <Ionicons name="open-outline" size={15} color="#4f46e5" />
              <Text style={s.navButtonText}>{str.actions.goToChores}</Text>
            </Pressable>
            <View style={s.editModalActions}>
              <Pressable style={s.deleteActionBtn} onPress={() => { setEditingCalChore(null); if (editingCalChore) deleteChoreCalendar(editingCalChore.id, editingCalChore.title); }}>
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={s.deleteActionText}>{common.actions.delete}</Text>
              </Pressable>
              <Pressable
                style={[s.button, { flex: 1, marginTop: 0 }, (!editCalChoreTitle.trim() || savingCalChore) && s.buttonDisabled]}
                onPress={saveCalChore}
                disabled={savingCalChore || !editCalChoreTitle.trim()}
              >
                {savingCalChore ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{common.actions.save}</Text>}
              </Pressable>
            </View>
          </View>
          </View>
          </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showFilterModal} transparent animationType="fade" onRequestClose={() => setShowFilterModal(false)}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setShowFilterModal(false)} />
        <View style={s.filterPopup}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={s.filterPopupTitle}>{str.filter.popupTitle}</Text>
            {filterMemberIds.length > 0 && (
              <Pressable onPress={() => setFilterMemberIds([])} hitSlop={8}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#7c3aed' }}>{str.filter.clear}</Text>
              </Pressable>
            )}
          </View>
          <Pressable
            style={s.filterMemberRow}
            onPress={() => setFilterMemberIds([])}
          >
            <Text style={[s.filterMemberName, filterMemberIds.length === 0 && s.filterMemberNameActive]}>{str.filter.all}</Text>
            <Ionicons
              name={filterMemberIds.length === 0 ? 'checkbox' : 'square-outline'}
              size={22}
              color={filterMemberIds.length === 0 ? '#7c3aed' : '#d1d5db'}
            />
          </Pressable>
          {members.map(m => {
            const active = filterMemberIds.includes(m.id);
            return (
              <Pressable
                key={m.id}
                style={s.filterMemberRow}
                onPress={() => setFilterMemberIds(prev =>
                  active ? prev.filter(id => id !== m.id) : [...prev, m.id]
                )}
              >
                <Text style={[s.filterMemberName, active && s.filterMemberNameActive]}>{m.displayName}</Text>
                <Ionicons
                  name={active ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={active ? '#7c3aed' : '#d1d5db'}
                />
              </Pressable>
            );
          })}
        </View>
      </Modal>

      <DatePickerModal
        visible={showWeekPicker}
        value={selectedDayDateStr}
        title={str.weekPicker.title}
        onChange={(dateStr) => {
          if (!dateStr) return;
          const picked = new Date(dateStr + 'T00:00:00');
          setWeekRef(picked);
          // jsGetDay: 0=Sunday … 6=Saturday → map to our WeekDay.
          const idx = picked.getDay();
          setSelectedDay((['sun','mon','tue','wed','thu','fri','sat'] as WeekDay[])[idx]);
          setShowWeekPicker(false);
        }}
        onClose={() => setShowWeekPicker(false)}
      />
      <DatePickerModal value={newStartDate} onChange={setNewStartDate} onClose={() => setShowNewStartPicker(false)} title={str.weekPicker.startDate} visible={showNewStartPicker} />
      <DatePickerModal value={newEndDate} onChange={setNewEndDate} onClose={() => setShowNewEndPicker(false)} title={str.weekPicker.endDate} visible={showNewEndPicker} />
      <DatePickerModal value={editEntryStartDate} onChange={setEditEntryStartDate} onClose={() => setShowEditStartPicker(false)} title={str.weekPicker.startDate} visible={showEditStartPicker} />
      <DatePickerModal value={editEntryEndDate} onChange={setEditEntryEndDate} onClose={() => setShowEditEndPicker(false)} title={str.weekPicker.endDate} visible={showEditEndPicker} />

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => tryCloseCreate(newTitle.trim() !== '', () => { setShowModal(false); resetNewEntryForm(); })}>
        <View pointerEvents="none" style={s.overlayDim} />
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => tryCloseCreate(newTitle.trim() !== '', () => { setShowModal(false); resetNewEntryForm(); })} />
        <KeyboardAvoidingView pointerEvents="box-none" behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <View style={[s.sheet, { maxHeight: windowHeight * 0.80, paddingBottom: Math.max(8, insets.bottom) }]}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{str.form.newTitle}</Text>
          <ScrollView ref={newModalScrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.sheetScroll}>
            <TextInput
              style={s.input}
              placeholder={str.form.titlePlaceholder}
              placeholderTextColor="#9ca3af"
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
            />

            <View onLayout={e => { newTimeSectionY.current = e.nativeEvent.layout.y; }}>
            <View style={s.timeToggleRow}>
              <Text style={s.label}>{str.form.timeLabel}</Text>
              <Switch
                value={timeEnabled}
                onValueChange={v => {
                  setTimeEnabled(v);
                  if (v) setTimeout(() => newModalScrollRef.current?.scrollTo({ y: newTimeSectionY.current, animated: true }), 100);
                }}
                trackColor={{ true: '#4f46e5' }}
              />
            </View>
            {timeEnabled && (
              <View style={s.drumRow}>
                <Drum values={HOUR_VALS} selected={newHour} onSelect={setNewHour} />
                <Text style={s.drumColon}>:</Text>
                <Drum values={MIN_VALS} selected={newMinute} onSelect={setNewMinute} />
              </View>
            )}
            {timeEnabled && (
              <>
                <Pressable style={s.sharedRow} onPress={() => setNewRemindEnabled(v => !v)}>
                  <Ionicons name={newRemindEnabled ? 'notifications-outline' : 'notifications-off-outline'} size={18} color={newRemindEnabled ? '#4f46e5' : '#9ca3af'} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.sharedLabel}>{str.form.reminderLabel}</Text>
                    <Text style={s.sharedSub}>{newRemindEnabled ? str.form.reminderOnSub : str.form.reminderOffSub}</Text>
                  </View>
                  <Switch value={newRemindEnabled} onValueChange={v => { setNewRemindEnabled(v); if (!v) { setNewRemindMinutes([]); setShowNewRemindDial(false); setShowNewQuickPick(false); } else { setShowNewQuickPick(true); } }} trackColor={{ true: '#4f46e5' }} />
                </Pressable>
                {newRemindEnabled && (
                  <>
                    {newRemindMinutes.length > 0 && (
                      <View style={s.remindChips}>
                        {newRemindMinutes.map((m) => (
                          <View key={m} style={s.remindChip}>
                            <Text style={s.remindChipText}>{formatRemindTime(m)}</Text>
                            <Pressable onPress={() => setNewRemindMinutes(prev => prev.filter(x => x !== m))} hitSlop={8}>
                              <Ionicons name="close" size={14} color="#4f46e5" />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}
                    {showNewRemindDial ? (
                      <View style={{ alignItems: 'center', marginVertical: 12 }}>
                        <RemindDial minutes={newRemindDialValue} onChange={setNewRemindDialValue} onAdd={() => { setNewRemindMinutes(prev => prev.includes(newRemindDialValue) ? prev : [...prev, newRemindDialValue].sort((a, b) => a - b)); setNewRemindDialValue(0); setShowNewRemindDial(false); }} />
                      </View>
                    ) : showNewQuickPick && newRemindMinutes.length < 5 ? (
                      <View style={s.remindQuickRow}>
                        {REMIND_PRESETS.filter(p => !newRemindMinutes.includes(p.value)).map(p => (
                          <Pressable
                            key={p.value}
                            style={s.remindQuickChip}
                            onPress={() => { setNewRemindMinutes(prev => [...prev, p.value].sort((a, b) => a - b)); setShowNewQuickPick(false); }}
                          >
                            <Text style={s.remindQuickChipText}>{p.label}</Text>
                          </Pressable>
                        ))}
                        <Pressable onPress={() => { setShowNewRemindDial(true); setShowNewQuickPick(false); }}>
                          <Text style={s.remindCustomLink}>{str.remind.customTime}</Text>
                        </Pressable>
                      </View>
                    ) : newRemindMinutes.length > 0 && newRemindMinutes.length < 5 ? (
                      <Pressable style={s.remindMoreBtn} onPress={() => setShowNewQuickPick(true)}>
                        <Ionicons name="add-circle-outline" size={18} color="#4f46e5" />
                        <Text style={s.remindMoreBtnText}>{str.remind.addReminder}</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </>
            )}
            </View>

            <Pressable style={s.sharedRow} onPress={() => setNewIsShared(v => { if (v) setNewAssignedToMany([]); return !v; })}>
              <Ionicons name={newIsShared ? 'earth-outline' : 'lock-closed-outline'} size={18} color={newIsShared ? '#4f46e5' : '#9ca3af'} />
              <View style={{ flex: 1 }}>
                <Text style={s.sharedLabel}>{newIsShared ? str.shared.isShared : str.shared.isPrivate}</Text>
                <Text style={s.sharedSub}>{newIsShared ? str.shared.sharedSub : str.shared.privateSub}</Text>
              </View>
              <Switch value={newIsShared} onValueChange={v => { setNewIsShared(v); if (!v) setNewAssignedToMany([]); }} trackColor={{ true: '#4f46e5' }} />
            </Pressable>

            {members.length > 0 && newIsShared && (
              <>
                <Text style={s.label}>{str.form.assignLabel}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.memberPickerRow}>
                  {members.map(m => {
                    const active = newAssignedToMany.includes(m.id);
                    return (
                      <Pressable
                        key={m.id}
                        style={[s.memberOption, active && s.memberOptionActive]}
                        onPress={() => setNewAssignedToMany(prev => active ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                      >
                        <Text style={[s.memberOptionText, active && s.memberOptionTextActive]}>{m.displayName}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <Text style={s.label}>{componentsStr.recurrencePicker.label}</Text>
            <View style={s.recurrenceTypeRow}>
              {(['none', 'daily', 'weekly', 'monthly', 'yearly'] as const).map(type => {
                const label = componentsStr.recurrencePicker.types[type];
                return (
                  <Pressable
                    key={type}
                    style={[s.recurrenceTypeBtn, newRecurrenceType === type && s.recurrenceTypeBtnActive]}
                    onPress={() => setNewRecurrenceType(type)}
                  >
                    <Text style={[s.recurrenceTypeBtnText, newRecurrenceType === type && s.recurrenceTypeBtnTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {newRecurrenceType !== 'none' && (
              <View style={s.intervalRow}>
                <Text style={s.intervalLabel}>{componentsStr.recurrencePicker.every}</Text>
                <Pressable style={s.intervalBtn} onPress={() => setNewRecurrenceWeeks(Math.max(1, newRecurrenceWeeks - 1))}>
                  <Text style={s.intervalBtnText}>−</Text>
                </Pressable>
                <Text style={s.intervalValue}>{newRecurrenceWeeks}</Text>
                <Pressable style={s.intervalBtn} onPress={() => setNewRecurrenceWeeks(newRecurrenceWeeks + 1)}>
                  <Text style={s.intervalBtnText}>+</Text>
                </Pressable>
                <Text style={s.intervalLabel}>
                  {(str.newRecurrence.intervalUnit)[newRecurrenceType] ?? ''}
                </Text>
              </View>
            )}

            {newRecurrenceType === 'weekly' && (
              <>
                <Text style={s.label}>{componentsStr.recurrencePicker.weekdays}</Text>
                <View style={s.dayPickerRow}>
                  {DAYS.map(day => (
                    <Pressable
                      key={day.key}
                      style={[s.dayPickerOption, newRecurrenceDays.includes(day.key) && s.dayPickerOptionActive]}
                      onPress={() => setNewRecurrenceDays(prev =>
                        prev.includes(day.key) ? prev.filter(d => d !== day.key) : [...prev, day.key]
                      )}
                    >
                      <Text style={[s.dayPickerText, newRecurrenceDays.includes(day.key) && s.dayPickerTextActive]}>{day.short}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {newRecurrenceType === 'monthly' && (
              <>
                <Text style={s.label}>{componentsStr.recurrencePicker.repeatsEvery}</Text>
                <View style={s.monthlyTypeRow}>
                  <Pressable
                    style={[s.monthlyTypeBtn, newMonthlyType === 'day_of_month' && s.monthlyTypeBtnActive]}
                    onPress={() => setNewMonthlyType('day_of_month')}
                  >
                    <Text style={[s.monthlyTypeBtnText, newMonthlyType === 'day_of_month' && s.monthlyTypeBtnTextActive]}>
                      {componentsStr.recurrencePicker.monthly.dayOfMonth(new Date().getDate())}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[s.monthlyTypeBtn, newMonthlyType === 'weekday_of_month' && s.monthlyTypeBtnActive]}
                    onPress={() => setNewMonthlyType('weekday_of_month')}
                  >
                    <Text style={[s.monthlyTypeBtnText, newMonthlyType === 'weekday_of_month' && s.monthlyTypeBtnTextActive]}>
                      {componentsStr.recurrencePicker.monthly.weekday(
                        common.ordinals[newRecurrenceWeekOfMonth - 1] ?? 'Sista',
                        DAYS.find(d => d.key === newDay)?.label.toLowerCase() ?? '',
                      )}
                    </Text>
                  </Pressable>
                </View>
                {newMonthlyType === 'weekday_of_month' && (
                  <View style={s.intervalRow}>
                    <Text style={s.intervalLabel}>{componentsStr.recurrencePicker.weekOfMonth}</Text>
                    <Pressable style={s.intervalBtn} onPress={() => setNewRecurrenceWeekOfMonth(Math.max(1, newRecurrenceWeekOfMonth - 1))}>
                      <Text style={s.intervalBtnText}>−</Text>
                    </Pressable>
                    <Text style={s.intervalValue}>{newRecurrenceWeekOfMonth}</Text>
                    <Pressable style={s.intervalBtn} onPress={() => setNewRecurrenceWeekOfMonth(Math.min(4, newRecurrenceWeekOfMonth + 1))}>
                      <Text style={s.intervalBtnText}>+</Text>
                    </Pressable>
                  </View>
                )}
              </>
            )}

            {newRecurrenceType !== 'none' && (
              <>
                <Text style={s.label}>{componentsStr.recurrencePicker.ends}</Text>
                <View style={s.endCondRow}>
                  <Pressable
                    style={[s.endCondBtn, !newEndDate && s.endCondBtnActive]}
                    onPress={() => setNewEndDate(null)}
                  >
                    <Text style={[s.endCondBtnText, !newEndDate && s.endCondBtnTextActive]}>{componentsStr.recurrencePicker.neverEnds}</Text>
                  </Pressable>
                  <Pressable
                    style={[s.endCondBtn, newEndDate && s.endCondBtnActive, { flex: 1.5 }]}
                    onPress={() => setShowNewEndPicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={13} color={newEndDate ? '#4f46e5' : '#9ca3af'} />
                    <Text style={[s.endCondBtnText, newEndDate && s.endCondBtnTextActive]}>{newEndDate ?? componentsStr.recurrencePicker.chooseDate}</Text>
                  </Pressable>
                </View>
              </>
            )}

            <Pressable
              style={[s.button, !newTitle.trim() && s.buttonDisabled]}
              onPress={createEntry}
              disabled={creating || !newTitle.trim()}
            >
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{common.actions.add}</Text>}
            </Pressable>
          </ScrollView>
          </View>
          </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dayRowPager: { flexGrow: 0, backgroundColor: '#fff' },
  dayRow: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 4 },
  dayTab: { flex: 1, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', alignItems: 'center', gap: 1 },
  dayTabActive: { borderColor: '#4f46e5', backgroundColor: '#4f46e5' },
  dayTabHasContent: { backgroundColor: '#eeecfa', borderColor: '#c7c2f0' },
  dayTabShort: { fontSize: 10, fontWeight: '500', color: '#9ca3af' },
  dayTabDate: { fontSize: 14, fontWeight: '700', color: '#374151' },
  dayTabTextActive: { color: '#fff' },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#4f46e5', marginTop: 1 },
  todayDotActive: { backgroundColor: 'rgba(255,255,255,0.8)' },
  todayDotHidden: { opacity: 0 },
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 2, paddingBottom: 80 },
  contentEmpty: { flex: 1 },
  section: { gap: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#7c3aed', letterSpacing: 0.8, paddingHorizontal: 2 },
  menuCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#c7d2fe', padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  menuIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  menuTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  menuMeta: { fontSize: 12, color: '#6b7280' },
  choreCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#c4b5fd', padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  choreDone: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', opacity: 0.7 },
  choreInfo: { flex: 1 },
  choreTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  choreStrike: { textDecorationLine: 'line-through', color: '#9ca3af' },
  choreAssigned: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  choreCheckBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#d1d5db', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  choreCheckBtnDone: { backgroundColor: '#10b981', borderColor: '#10b981' },
  entryCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#cffafe', padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  entryTime: { width: 44, alignItems: 'center', paddingTop: 2 },
  timeText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  timeTextMuted: { fontSize: 10, color: '#9ca3af', fontStyle: 'italic' },
  entryContent: { flex: 1 },
  entryRightCol: { alignItems: 'flex-end', gap: 4 },
  entryRightTime: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  entryTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  entryDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', shadowColor: '#4f46e5', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  // Dim på eget absolut lager så det täcker bakom sheetens rundade hörn.
  overlay: { flex: 1 },
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 0, maxHeight: '92%' },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  viewFull: { flex: 1, backgroundColor: '#fff' },
  viewNav: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 8 },
  viewNavBtn: { padding: 8 },
  viewBody: { paddingHorizontal: 20, paddingTop: 8, gap: 4 },
  viewTitle: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 12 },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  viewRowText: { flex: 1, fontSize: 16, color: '#374151' },
  sheetScroll: { gap: 14, paddingBottom: 40 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 16, backgroundColor: '#f9fafb' },
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  timeToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  drumRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden', paddingHorizontal: 20 },
  drumColon: { fontSize: 30, fontWeight: '700', color: '#374151', marginHorizontal: 8 },
  dayPickerRow: { flexDirection: 'row', gap: 6 },
  dayPickerOption: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', backgroundColor: '#f9fafb' },
  dayPickerOptionActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  dayPickerText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  dayPickerTextActive: { color: '#4f46e5', fontWeight: '700' },
  sharedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f9fafb', borderRadius: 10, padding: 12 },
  sharedLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  sharedSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  button: { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  editModalActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  deleteActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fff7f7' },
  deleteActionText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },
  memberPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', flexShrink: 0 },
  memberOptionActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  memberOptionText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  memberOptionTextActive: { color: '#4f46e5', fontWeight: '600' },
  navButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, marginBottom: 10 },
  navButtonText: { fontSize: 14, fontWeight: '600', color: '#4f46e5' },
  tabletLayout: { flex: 1, flexDirection: 'row' },
  tabletLeft: { flex: 1.4, borderRightWidth: 1, borderRightColor: '#f3f4f6' },
  tabletViewToggle: { flexDirection: 'row', gap: 6, padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  viewToggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f3f4f6' },
  viewToggleBtnActive: { backgroundColor: '#4f46e5' },
  viewToggleText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  viewToggleTextActive: { color: '#fff' },
  tabletRight: { flex: 1, backgroundColor: '#f9fafb' },
  tabletDayHeader: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  tabletDayTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  dateBtnSet: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  dateBtnText: { fontSize: 13, color: '#9ca3af', flex: 1 },
  dateBtnTextSet: { color: '#4f46e5', fontWeight: '600' },
  recurrenceTypeRow: { flexDirection: 'row', gap: 6 },
  recurrenceTypeBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', backgroundColor: '#f9fafb' },
  recurrenceTypeBtnActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  recurrenceTypeBtnText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  recurrenceTypeBtnTextActive: { color: '#4f46e5', fontWeight: '700' },
  intervalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f9fafb', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  intervalLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },
  intervalBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  intervalBtnText: { fontSize: 18, color: '#374151', fontWeight: '600', lineHeight: 22 },
  intervalValue: { fontSize: 18, fontWeight: '700', color: '#111827', minWidth: 28, textAlign: 'center' },
  monthlyTypeRow: { gap: 8 },
  monthlyTypeBtn: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  monthlyTypeBtnActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  monthlyTypeBtnText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  monthlyTypeBtnTextActive: { color: '#4f46e5', fontWeight: '700' },
  endCondRow: { flexDirection: 'row', gap: 8 },
  endCondBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 11, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  endCondBtnActive: { borderColor: '#4f46e5', backgroundColor: '#eef2ff' },
  endCondBtnText: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  endCondBtnTextActive: { color: '#4f46e5', fontWeight: '700' },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
  filterBtnActive: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  filterBtnText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  filterBtnTextActive: { color: '#7c3aed', fontWeight: '600' },
  filterBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  filterPopup: { position: 'absolute', top: 0, right: 0, backgroundColor: '#fff', borderRadius: 12, padding: 16, minWidth: 200, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 8, overflow: 'hidden' },
  filterPopupTitle: { fontSize: 13, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  filterMemberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  filterMemberName: { fontSize: 15, color: '#374151', flex: 1, marginRight: 12 },
  filterMemberNameActive: { color: '#7c3aed', fontWeight: '600' },
  remindDial: { width: DIAL_SIZE, height: DIAL_SIZE, borderRadius: DIAL_R, borderWidth: 2, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', position: 'relative', overflow: 'hidden' },
  remindChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  remindChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ede9fe', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  remindChipText: { fontSize: 13, fontWeight: '600' as const, color: '#4f46e5' },
  remindAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#4f46e5', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  remindAddBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' as const },
  remindMoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  remindMoreBtnText: { color: '#4f46e5', fontSize: 14, fontWeight: '600' as const },
  remindQuickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 6, alignItems: 'center' },
  remindQuickChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#c4b5fd', backgroundColor: '#f5f3ff' },
  remindQuickChipText: { fontSize: 13, fontWeight: '600' as const, color: '#7c3aed' },
  remindCustomLink: { fontSize: 13, color: '#4f46e5', fontWeight: '500' as const, paddingHorizontal: 4, paddingVertical: 7, textDecorationLine: 'underline' },
});
