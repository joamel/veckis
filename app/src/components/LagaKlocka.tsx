import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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
import { avslutaLagning, useLagningar, ändraLagning, ärEgenTimer, type CookTimer } from '../lib/cookSessions';
import { larmaTimer, stoppaLarm, LARM_FÖNSTER_MS } from '../lib/timerLarm';
import { recipes as str } from '../lib/svenska';

// Flikskärmarna har flikraden i nederkanten; där ligger klockan ovanför den.
const FLIKVÄGAR = new Set(['/', '/shopping', '/menu', '/recipes', '/settings']);
export const KLOCKA_STORLEK = 56;

/**
 * Den runda klockknappen: kortaste nedräkningen under ikonen, en bricka med
 * antalet lagningar, och puls när en timer är klar. Används både nere till
 * höger i appen (LagaKlocka) och inne i laga-läget.
 */
export function KlockKnapp({ kvarS, antal, onPress, style }: {
  kvarS: number | null;
  antal: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { ny } = useTheme();
  const st = useMemo(() => gorSt(ny), [ny]);
  const klar = kvarS !== null && kvarS <= 0;

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

  const etikett = kvarS === null ? null : klar ? str.detail.cookTimerKlar : formateraNedräkning(kvarS);
  return (
    <Animated.View pointerEvents="box-none" style={[st.wrap, style, { transform: [{ scale: puls }] }]}>
      {/* Ett tryck tystar ett ringande larm. */}
      <Pressable style={[st.klocka, klar && st.klockaKlar]} onPress={() => { stoppaLarm(); onPress(); }} accessibilityRole="button" accessibilityLabel={str.detail.cookClockA11y(antal)}>
        <Ionicons name="timer-outline" size={etikett ? 20 : 26} color={klar ? ny.skog : ny.lime} />
        {/* Fast bredd: Android mäter siffror för smalt och klipper sista tecknet. */}
        {etikett && <Text style={[st.tid, klar && st.tidKlar, { width: KLOCKA_STORLEK - 6 }]} numberOfLines={1}>{etikett}</Text>}
      </Pressable>
      {antal > 1 && (
        <View style={st.bricka} pointerEvents="none">
          <Text style={st.brickaText}>{antal}</Text>
        </View>
      )}
    </Animated.View>
  );
}

export type ÖversiktLagning = {
  recipeId: string;
  title: string;
  step: number;
  timers: CookTimer[];
  /** Receptet man står i laga-läget för just nu. */
  aktuell?: boolean;
};

/**
 * Listan i "Pågående lagning": varje rätt med steget och sina timrar, var och
 * en med nedräkning och kryss. Samma innehåll utanför laga-läget (i ett ark)
 * och inne i det (i laga-lägets eget ark — en modal på en modal syns inte på iOS).
 */
export function LagaÖversikt({ lagningar, nu, onÖppna, onGåTillSteg, onStoppaTimer, onAvsluta }: {
  lagningar: ÖversiktLagning[];
  nu: number;
  /** Tryck på en annan rätt: till dess laga-läge. */
  onÖppna: (recipeId: string) => void;
  /** Tryck på en stegtimer i den aktuella rätten: till steget. */
  onGåTillSteg?: (step: number) => void;
  onStoppaTimer: (recipeId: string, step: number) => void;
  onAvsluta?: (recipeId: string) => void;
}) {
  const { ny } = useTheme();
  const st = useMemo(() => gorSt(ny), [ny]);
  return (
    <View style={st.lista}>
      {lagningar.map(l => (
        <View key={l.recipeId} style={[st.lagning, l.aktuell && st.lagningAktuell]}>
          <Pressable
            style={st.lagningHuvud}
            disabled={l.aktuell}
            onPress={() => onÖppna(l.recipeId)}
            accessibilityRole={l.aktuell ? undefined : 'button'}
            accessibilityLabel={l.aktuell ? l.title : str.detail.cookPillA11y(l.title)}
          >
            <View style={{ flex: 1 }}>
              <Text style={st.lagningTitel} numberOfLines={2}>{l.title}</Text>
              <Text style={st.lagningSteg}>{l.aktuell ? str.detail.cookSheetHere(l.step + 1) : str.detail.cookSheetStep(l.step + 1)}</Text>
            </View>
            {!l.aktuell && <Ionicons name="chevron-forward" size={20} color={ny.textDampad} />}
          </Pressable>
          {l.timers.length === 0 ? (
            <Text style={st.ingenTimer}>{str.detail.cookSheetNoTimers}</Text>
          ) : (
            [...l.timers].sort((a, b) => a.endsAt - b.endsAt).map(t => {
              const kvar = Math.max(0, (t.endsAt - nu) / 1000);
              const tKlar = kvar <= 0;
              const text = tKlar ? str.detail.cookTimerKlar : formateraNedräkning(kvar);
              const egen = ärEgenTimer(t.step);
              // I den aktuella rätten går en stegtimer till steget; annars till rätten.
              const tillSteg = l.aktuell && !egen && onGåTillSteg;
              return (
                <View key={t.step} style={st.timerRad}>
                  <Pressable
                    style={st.timerEtikett}
                    disabled={l.aktuell && !tillSteg}
                    onPress={() => (tillSteg ? onGåTillSteg(t.step) : onÖppna(l.recipeId))}
                    accessibilityRole="button"
                  >
                    <Ionicons name="timer-outline" size={18} color={tKlar ? ny.lime : ny.padYta} />
                    <Text style={st.timerSteg}>{egen ? (t.name || str.detail.cookCustomTimer) : str.detail.cookSheetStep(t.step + 1)}</Text>
                    <Text style={[st.timerTid, { width: text.length * 10 + 8 }]} numberOfLines={1}>{text}</Text>
                  </Pressable>
                  <Pressable onPress={() => onStoppaTimer(l.recipeId, t.step)} hitSlop={8} accessibilityRole="button" accessibilityLabel={str.detail.cookStopTimerA11y(t.step + 1)}>
                    <Ionicons name="close-circle" size={22} color={ny.textDampad} />
                  </Pressable>
                </View>
              );
            })
          )}
          {!l.aktuell && onAvsluta && (
            <Pressable style={st.avsluta} onPress={() => onAvsluta(l.recipeId)} accessibilityRole="button">
              <Text style={st.avslutaText}>{str.detail.cookSheetEnd}</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

/** Stoppar en timer i en minimerad lagning och avbokar dess notis. */
export function stoppaMinimeradTimer(recipeId: string, timers: CookTimer[], step: number) {
  stoppaLarm();
  const t = timers.find(x => x.step === step);
  if (t?.notisId) Notifications.cancelScheduledNotificationAsync(t.notisId).catch(() => {});
  ändraLagning(recipeId, s => ({ ...s, timers: s.timers.filter(x => x.step !== step) }));
}

/**
 * Klockan nere till höger medan något lagas: minimerade laga-lägen med sina
 * timrar, på alla skärmar. Tryck → "Pågående lagning" med alla rätter och
 * timrar. Ligger ovanför plusknappen, som sitter på samma ställe på flera
 * skärmar. Inne i laga-läget (en egen modal) ritar receptskärmen samma klocka.
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

  if (lagningar.length === 0) return null;

  const allaTimrar = lagningar.flatMap(l => l.timers);
  const nästa = allaTimrar.length ? Math.min(...allaTimrar.map(t => t.endsAt)) : null;
  const kvarS = nästa === null ? null : Math.max(0, (nästa - nu) / 1000);

  const öppna = (recipeId: string) => {
    setArkÖppet(false);
    const l = lagningar.find(x => x.recipeId === recipeId);
    const portioner = l?.servings ? `&servings=${l.servings}` : '';
    router.push(`/recipes/${recipeId}?cook=1${portioner}` as never);
  };
  const avsluta = (recipeId: string) => {
    const s = avslutaLagning(recipeId);
    for (const t of s?.timers ?? []) if (t.notisId) Notifications.cancelScheduledNotificationAsync(t.notisId).catch(() => {});
    if (lagningar.length <= 1) setArkÖppet(false);
  };

  const bas = FLIKVÄGAR.has(pathname) ? sp(60) + insets.bottom : insets.bottom;
  return (
    <>
      <KlockKnapp kvarS={kvarS} antal={lagningar.length} onPress={() => setArkÖppet(true)} style={{ bottom: bas + 20 + KLOCKA_STORLEK + 12 }} />
      <DraggableBottomSheet visible={arkÖppet} onRequestClose={() => setArkÖppet(false)} title={str.detail.cookSheetTitle}>
        <LagaÖversikt
          lagningar={lagningar}
          nu={nu}
          onÖppna={öppna}
          onStoppaTimer={(recipeId, step) => stoppaMinimeradTimer(recipeId, lagningar.find(l => l.recipeId === recipeId)?.timers ?? [], step)}
          onAvsluta={avsluta}
        />
      </DraggableBottomSheet>
    </>
  );
}

const gorSt = (ny: NyPalett) => StyleSheet.create({
  wrap: { position: 'absolute', right: 20 },
  klocka: {
    width: KLOCKA_STORLEK, height: KLOCKA_STORLEK, borderRadius: KLOCKA_STORLEK / 2, backgroundColor: ny.skog,
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
  lagning: { backgroundColor: ny.ljus, borderRadius: 18, padding: 14, gap: 8 },
  lagningAktuell: { borderWidth: 2, borderColor: ny.valdYta },
  lagningHuvud: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lagningTitel: { fontFamily: nyFont.fet, fontSize: 17, color: ny.text },
  lagningSteg: { fontSize: 13, color: ny.textDampad, marginTop: 2 },
  ingenTimer: { fontSize: 14, color: ny.textDampad },
  timerRad: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  timerEtikett: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  timerSteg: { flex: 1, fontSize: 15, color: ny.text },
  timerTid: { fontFamily: nyFont.fet, fontSize: 17, color: ny.padYta, textAlign: 'right' },
  // Som ConfirmDialogs sekundärknapp, med farofärgad text.
  avsluta: { height: 44, borderRadius: 22, backgroundColor: ny.kort, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  avslutaText: { fontFamily: nyFont.halvfet, fontSize: 15, color: ny.fara },
});
