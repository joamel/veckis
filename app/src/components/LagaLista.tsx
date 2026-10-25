import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from './Pressable';
import { useTheme } from '../context/ThemeContext';
import { useTablet } from '../hooks/useTablet';
import { nyFont, type NyPalett } from '../lib/nyDesign';
import { formateraNedräkning } from '../lib/cookTimer';
import { useLagningar } from '../lib/cookSessions';
import { recipes as str } from '../lib/svenska';

// Flikskärmarna har flikraden i nederkanten; där ligger listen ovanför den.
const FLIKVÄGAR = new Set(['/', '/shopping', '/menu', '/recipes', '/settings']);

/**
 * Listen längst ned medan något lagas: minimerade laga-lägen med sina timrar,
 * på alla skärmar. Visar den timer som har kortast tid kvar (eller en som är
 * klar), och hur många lagningar till som pågår. Tryck → tillbaka till steget.
 */
export function LagaLista() {
  const lagningar = useLagningar();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { sp } = useTablet();
  const { ny } = useTheme();
  const st = useMemo(() => gorSt(ny), [ny]);

  const [nu, setNu] = useState(() => Date.now());
  const harTimrar = lagningar.some(l => l.timers.length > 0);
  useEffect(() => {
    if (!harTimrar) return;
    setNu(Date.now());
    const id = setInterval(() => setNu(Date.now()), 1000);
    return () => clearInterval(id);
  }, [harTimrar]);

  if (lagningar.length === 0) return null;

  // Den lagning vars timer går ut först står i listen; en klar timer går före.
  const medNästa = lagningar.map(l => ({
    l,
    nästa: l.timers.length ? Math.min(...l.timers.map(t => t.endsAt)) : Infinity,
  })).sort((a, b) => a.nästa - b.nästa);
  const { l: visad, nästa } = medNästa[0];
  const kvarS = nästa === Infinity ? null : Math.max(0, (nästa - nu) / 1000);
  const klar = kvarS !== null && kvarS <= 0;
  const tid = kvarS === null ? str.detail.cookPillStep(visad.step + 1) : klar ? str.detail.cookTimerKlar : formateraNedräkning(kvarS);

  const öppna = () => {
    const portioner = visad.servings ? `&servings=${visad.servings}` : '';
    router.push(`/recipes/${visad.recipeId}?cook=1${portioner}` as never);
  };

  const bottom = FLIKVÄGAR.has(pathname) ? sp(60) + insets.bottom + 10 : insets.bottom + 12;

  return (
    <View pointerEvents="box-none" style={[st.wrap, { bottom }]}>
      <Pressable
        style={[st.lista, klar && st.listaKlar]}
        onPress={öppna}
        accessibilityRole="button"
        accessibilityLabel={str.detail.cookPillA11y(visad.title)}
      >
        <Ionicons name={kvarS === null ? 'restaurant-outline' : 'timer-outline'} size={18} color={klar ? ny.skog : ny.lime} />
        <Text style={[st.titel, klar && st.textKlar]} numberOfLines={1}>{visad.title}</Text>
        {/* Fast bredd: Android mäter siffror för smalt och klipper sista tecknet. */}
        <Text style={[st.tid, klar && st.textKlar, { width: tid.length * 9 + 8 }]} numberOfLines={1}>{tid}</Text>
        {lagningar.length > 1 && (
          <View style={[st.fler, klar && st.flerKlar]}>
            <Text style={[st.flerText, klar && st.flerTextKlar]}>+{lagningar.length - 1}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const gorSt = (ny: NyPalett) => StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  lista: {
    flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 480, width: '100%',
    paddingHorizontal: 16, height: 48, borderRadius: 24, backgroundColor: ny.skog,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  listaKlar: { backgroundColor: ny.lime },
  titel: { flex: 1, fontFamily: nyFont.halvfet, fontSize: 15, color: ny.rubrikLjus },
  tid: { fontFamily: nyFont.fet, fontSize: 15, color: ny.lime, textAlign: 'right' },
  textKlar: { color: ny.skog },
  fler: { paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: ny.skogMellan, justifyContent: 'center' },
  flerKlar: { backgroundColor: ny.skog },
  flerText: { fontFamily: nyFont.fet, fontSize: 12, color: ny.lime },
  flerTextKlar: { color: ny.lime },
});
