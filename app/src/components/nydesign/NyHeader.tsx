import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { nyFont, nyLjus, type NyPalett } from '../../lib/nyDesign';
import { useNy } from '../../context/ThemeContext';

/** Mörkgrönt sidhuvud med rundade nederkanter (ny design). `children` hamnar
 *  under rubrikraden, t.ex. ett sökfält. */
export function NyHeader({ title, subtitle, onBack, backLabel, right, children, kompakt }: {
  title: string;
  subtitle?: string | null;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  children?: ReactNode;
  /** Mindre rubrik som får bryta på två rader — för långa namn (t.ex. butiker). */
  kompakt?: boolean;
}) {
  const ny = useNy();
  const st = useMemo(() => gorSt(ny), [ny]);
  return (
    <View style={st.band}>
      {/* Med bakåtpil linjerar raden i MITTEN. Med underkant hamnade pilen
          (42 px) aldrig i höjd med rubriken (38 px), och fanns en underrubrik
          linjerade pilen med den i stället. Rubriken ligger kvar på raden —
          att flytta ned den på egen rad var fel väg. */}
      <View style={[st.rad, onBack && st.radMitt]}>
        {onBack && (
          <NyIkonKnapp icon="arrow-back" onPress={onBack} label={backLabel} color={ny.rubrikLjus} />
        )}
        <View style={[st.titelyta, st.titelytaRad]}>
          <Text style={[st.titel, kompakt && st.titelKompakt]} numberOfLines={kompakt ? 2 : 1}>{title}</Text>
          {!!subtitle && <Text style={st.underrubrik} numberOfLines={1}>{subtitle}</Text>}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Ikonknapp i sidhuvudet: samma mönster överallt (42 px, genomskinligt vitt). */
// `ikonLjus` är samma i ljust och mörkt läge (sidhuvudet är grönt i båda), så
// den duger som standardvärde i signaturen — där finns ingen hook att ropa.
export function NyIkonKnapp({ icon, onPress, label, color = nyLjus.ikonLjus, size = 20 }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  label?: string;
  color?: string;
  size?: number;
}) {
  const ny = useNy();
  const st = useMemo(() => gorSt(ny), [ny]);
  return (
    <Pressable onPress={onPress} hitSlop={4} style={st.ikonKnapp} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

/** Textknapp i sidhuvudet, för en tydlig huvudåtgärd (t.ex. Butiker). Samma
 *  genomskinliga vita yta som ikonknapparna, med ikon och etikett. */
export function NyTextKnapp({ icon, label, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const ny = useNy();
  const st = useMemo(() => gorSt(ny), [ny]);
  return (
    <Pressable onPress={onPress} hitSlop={4} style={st.textKnapp} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={ny.rubrikLjus} />
      <Text style={st.textKnappText}>{label}</Text>
    </Pressable>
  );
}

const gorSt = (ny: NyPalett) => StyleSheet.create({
  textKnapp: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 14, borderRadius: 14, backgroundColor: ny.glas },
  textKnappText: { fontSize: 14, fontWeight: '600', color: ny.rubrikLjus },
  band: {
    backgroundColor: ny.skog,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  rad: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  radMitt: { alignItems: 'center' },
  titelyta: { gap: 2 },
  // Bara i raden, där rubriken ska fylla bredden bredvid knapparna. I kolumnen
  // (med bakåtpil) har bandet automatisk höjd, och där gav flex: 1 höjden 0 —
  // rubriken försvann helt.
  titelytaRad: { flex: 1 },
  titel: { fontFamily: nyFont.fet, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, color: ny.rubrikLjus },
  titelKompakt: { fontSize: 26, lineHeight: 30, letterSpacing: -0.5 },
  underrubrik: { fontSize: 13, color: ny.underrubrik },
  ikonKnapp: { width: 42, height: 42, borderRadius: 14, backgroundColor: ny.glas, alignItems: 'center', justifyContent: 'center' },
});
