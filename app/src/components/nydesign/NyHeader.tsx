import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ny, nyFont } from '../../lib/nyDesign';

/** Mörkgrönt sidhuvud med rundade nederkanter (ny design). `children` hamnar
 *  under rubrikraden, t.ex. ett sökfält. */
export function NyHeader({ title, subtitle, onBack, backLabel, right, children }: {
  title: string;
  subtitle?: string | null;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <View style={st.band}>
      <View style={st.rad}>
        {onBack && (
          <NyIkonKnapp icon="arrow-back" onPress={onBack} label={backLabel} color={ny.rubrikLjus} />
        )}
        <View style={st.titelyta}>
          <Text style={st.titel} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={st.underrubrik} numberOfLines={1}>{subtitle}</Text>}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Ikonknapp i sidhuvudet: samma mönster överallt (42 px, genomskinligt vitt). */
export function NyIkonKnapp({ icon, onPress, label, color = ny.ikonLjus, size = 20 }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  label?: string;
  color?: string;
  size?: number;
}) {
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
  return (
    <Pressable onPress={onPress} hitSlop={4} style={st.textKnapp} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={ny.rubrikLjus} />
      <Text style={st.textKnappText}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
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
  titelyta: { flex: 1, gap: 2 },
  titel: { fontFamily: nyFont.fet, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, color: ny.rubrikLjus },
  underrubrik: { fontSize: 13, color: ny.underrubrik },
  ikonKnapp: { width: 42, height: 42, borderRadius: 14, backgroundColor: ny.glas, alignItems: 'center', justifyContent: 'center' },
});
