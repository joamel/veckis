import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from './Pressable';
import { DraggableBottomSheet } from './DraggableBottomSheet';
import { useTheme } from '../context/ThemeContext';
import { useTablet } from '../hooks/useTablet';
import { nyFont, type NyPalett } from '../lib/nyDesign';
import { formateraNedräkning } from '../lib/cookTimer';
import { avslutaLagning, useLagningar, ändraLagning, type CookSession } from '../lib/cookSessions';
import { larmaTimer, LARM_FÖNSTER_MS } from '../lib/timerLarm';
import { recipes as str } from '../lib/svenska';

// Flikskärmarna har flikraden i nederkanten; där ligger klockan ovanför den.
const FLIKVÄGAR = new Set(['/', '/shopping', '/menu', '/recipes', '/settings']);
const KNAPP = 56;

/**
 * Klockan nere till höger medan något lagas: minimerade laga-lägen med sina
 * timrar, på alla skärmar. Visar den nedräkning som går ut först; tryck →
 * ett ark med alla lagningar och timrar. Ligger ovanför plusknappen, som
 * sitter på samma ställe på flera skärmar.
 *
 * Larmar (vibration + pling) när en minimerad timer slår om medan appen är
 * öppen — oavsett skärm. Timrar i ett ÖPPET laga-läge larmar receptskärmen.
 */
export function LagaKlocka() {
  const lagningar = useLagningar();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { sp } = useTablet();
  const { ny } = useTheme();
  const st = useMemo(() => gorSt(ny), [ny]);
  const [arkÖppet, setArkÖppet] = useState(false);

  const [nu, setNu] = useState(() => Date.now());
  const harTimrar = lagningar.some(l => l.timers.length > 0);
  useEffect(() => {
    if (!harTimrar) return;
    setNu(Date.now());
    const id = setInterval(() => setNu(Date.now()), 1000);
    return () => clearInterval(id);
  }, [harTimrar]);

  // Larmet: varje timer en gång, och bara om den gick ut alldeles nyss.
  const larmade = useRef(new Set<string>());
  useEffect(() => {
    for (const l of lagningar) {
      for (const t of l.timers) {
        const nyckel = `${l.recipeId}:${t.step}:${t.endsAt}`;
        if (t.endsAt <= nu && t.endsAt > nu - LARM_FÖNSTER_MS && !larmade.current.has(nyckel)) {
          larmade.current.add(nyckel);
          larmaTimer();
        }
      }
    }
  }, [nu, lagningar]);

  const allaTimrar = lagningar.flatMap(l => l.timers);
  const nästa = allaTimrar.length ? Math.min(...allaTimrar.map(t => t.endsAt)) : null;
  const kvarS = nästa === null ? null : Math.max(0, (nästa - nu) / 1000);
  const klar = kvarS !== null && kvarS <= 0;

  // Klar timer: klockan pulserar tills man tittar.
  const puls = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!klar) { puls.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(puls, { toValue: 1.12, duration: 450, useNativeDriver: true }),
      Animated.timing(puls, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [klar, puls]);

  if (lagningar.length === 0) return null;

  const öppnaLagning = (l: CookSession) => {
    setArkÖppet(false);
    const portioner = l.servings ? `&servings=${l.servings}` : '';
    router.push(`/recipes/${l.recipeId}?cook=1${portioner}` as never);
  };
  const stoppaTimer = (l: CookSession, step: number) => {
    const t = l.timers.find(x => x.step === step);
    if (t?.notisId) Notifications.cancelScheduledNotificationAsync(t.notisId).catch(() => {});
    ändraLagning(l.recipeId, s => ({ ...s, timers: s.timers.filter(x => x.step !== step) }));
  };
  const avsluta = (l: CookSession) => {
    const s = avslutaLagning(l.recipeId);
    for (const t of s?.timers ?? []) if (t.notisId) Notifications.cancelScheduledNotificationAsync(t.notisId).catch(() => {});
    if (lagningar.length <= 1) setArkÖppet(false);
  };

  const bas = FLIKVÄGAR.has(pathname) ? sp(60) + insets.bottom : insets.bottom;
  const bottom = bas + 20 + KNAPP + 12;
  const etikett = kvarS === null ? null : klar ? str.detail.cookTimerKlar : formateraNedräkning(kvarS);

  return (
    <>
      <Animated.View pointerEvents="box-none" style={[st.wrap, { bottom, transform: [{ scale: puls }] }]}>
        <Pressable
          style={[st.klocka, klar && st.klockaKlar]}
          onPress={() => setArkÖppet(true)}
          accessibilityRole="button"
          accessibilityLabel={str.detail.cookClockA11y(lagningar.length)}
        >
          <Ionicons name="timer-outline" size={etikett ? 20 : 26} color={klar ? ny.skog : ny.lime} />
          {/* Fast bredd: Android mäter siffror för smalt och klipper sista tecknet. */}
          {etikett && <Text style={[st.tid, klar && st.tidKlar, { width: KNAPP - 6 }]} numberOfLines={1}>{etikett}</Text>}
        </Pressable>
        {lagningar.length > 1 && (
          <View style={st.bricka} pointerEvents="none">
            <Text style={st.brickaText}>{lagningar.length}</Text>
          </View>
        )}
      </Animated.View>

      <DraggableBottomSheet visible={arkÖppet} onRequestClose={() => setArkÖppet(false)} title={str.detail.cookSheetTitle}>
        <View style={st.lista}>
          {lagningar.map(l => (
            <View key={l.recipeId} style={st.lagning}>
              <Pressable style={st.lagningHuvud} onPress={() => öppnaLagning(l)} accessibilityRole="button" accessibilityLabel={str.detail.cookPillA11y(l.title)}>
                <View style={{ flex: 1 }}>
                  <Text style={st.lagningTitel} numberOfLines={2}>{l.title}</Text>
                  <Text style={st.lagningSteg}>{str.detail.cookSheetStep(l.step + 1)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={ny.textDampad} />
              </Pressable>
              {l.timers.length === 0 ? (
                <Text style={st.ingenTimer}>{str.detail.cookSheetNoTimers}</Text>
              ) : (
                [...l.timers].sort((a, b) => a.endsAt - b.endsAt).map(t => {
                  const kvar = Math.max(0, (t.endsAt - nu) / 1000);
                  const tKlar = kvar <= 0;
                  const text = tKlar ? str.detail.cookTimerKlar : formateraNedräkning(kvar);
                  return (
                    <View key={t.step} style={st.timerRad}>
                      <Ionicons name="timer-outline" size={18} color={tKlar ? ny.lime : ny.padYta} />
                      <Text style={st.timerSteg}>{str.detail.cookSheetStep(t.step + 1)}</Text>
                      <Text style={[st.timerTid, tKlar && st.timerTidKlar, { width: text.length * 10 + 8 }]} numberOfLines={1}>{text}</Text>
                      <Pressable onPress={() => stoppaTimer(l, t.step)} hitSlop={8} accessibilityRole="button" accessibilityLabel={str.detail.cookStopTimerA11y(t.step + 1)}>
                        <Ionicons name="close-circle" size={22} color={ny.textDampad} />
                      </Pressable>
                    </View>
                  );
                })
              )}
              <Pressable style={st.avsluta} onPress={() => avsluta(l)} accessibilityRole="button">
                <Text style={st.avslutaText}>{str.detail.cookSheetEnd}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </DraggableBottomSheet>
    </>
  );
}

const gorSt = (ny: NyPalett) => StyleSheet.create({
  wrap: { position: 'absolute', right: 20 },
  klocka: {
    width: KNAPP, height: KNAPP, borderRadius: KNAPP / 2, backgroundColor: ny.skog,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  klockaKlar: { backgroundColor: ny.lime },
  tid: { fontFamily: nyFont.fet, fontSize: 11, color: ny.lime, textAlign: 'center', marginTop: 1 },
  tidKlar: { color: ny.skog },
  bricka: {
    position: 'absolute', top: -4, right: -4, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5,
    backgroundColor: ny.lime, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: ny.skog,
  },
  brickaText: { width: 14, textAlign: 'center', fontFamily: nyFont.fet, fontSize: 11, color: ny.skog },
  lista: { gap: 14, paddingBottom: 8 },
  lagning: { backgroundColor: ny.kort, borderRadius: 18, padding: 14, gap: 8 },
  lagningHuvud: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lagningTitel: { fontFamily: nyFont.fet, fontSize: 17, color: ny.text },
  lagningSteg: { fontSize: 13, color: ny.textDampad, marginTop: 2 },
  ingenTimer: { fontSize: 14, color: ny.textDampad },
  timerRad: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  timerSteg: { flex: 1, fontSize: 15, color: ny.text },
  timerTid: { fontFamily: nyFont.fet, fontSize: 17, color: ny.padYta, textAlign: 'right' },
  timerTidKlar: { color: ny.padYta },
  avsluta: { alignSelf: 'flex-start', paddingVertical: 4 },
  avslutaText: { fontSize: 14, fontWeight: '600', color: '#b3261e' },
});
