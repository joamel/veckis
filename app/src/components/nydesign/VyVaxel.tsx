import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NyPalett } from '../../lib/nyDesign';
import { useNy } from '../../context/ThemeContext';
import type { ReceptVy } from '../../context/DesignContext';

/** Växeln mellan bildkort och kompakt lista i receptlistans sidhuvud. */
export function VyVaxel({ value, onChange, bildLabel, kompaktLabel }: {
  value: ReceptVy;
  onChange: (v: ReceptVy) => void;
  bildLabel: string;
  kompaktLabel: string;
}) {
  const ny = useNy();
  const st = useMemo(() => gorSt(ny), [ny]);
  return (
    <View style={st.ram}>
      <Knapp aktiv={value === 'bild'} ikon="grid-outline" label={bildLabel} onPress={() => onChange('bild')} />
      <Knapp aktiv={value === 'kompakt'} ikon="list-outline" label={kompaktLabel} onPress={() => onChange('kompakt')} />
    </View>
  );
}

function Knapp({ aktiv, ikon, label, onPress }: {
  aktiv: boolean;
  ikon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const ny = useNy();
  const st = useMemo(() => gorSt(ny), [ny]);
  return (
    <Pressable
      onPress={onPress}
      style={[st.knapp, aktiv && st.knappAktiv]}
      accessibilityRole="button"
      accessibilityState={{ selected: aktiv }}
      accessibilityLabel={label}
    >
      {/* Aktiv knapp har lime botten — där är skog rätt i BÅDA lägena, eftersom
          lime står still. Inaktiv ligger mot glaset i sidhuvudet. */}
      <Ionicons name={ikon} size={20} color={aktiv ? ny.skog : ny.ikonLjus} />
    </Pressable>
  );
}

const gorSt = (ny: NyPalett) => StyleSheet.create({
  ram: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 13, backgroundColor: ny.glasSvag },
  knapp: { width: 44, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  knappAktiv: { backgroundColor: ny.lime },
});
