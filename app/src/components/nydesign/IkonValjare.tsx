import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ny } from '../../lib/nyDesign';
import { LIST_IKONER } from '../../lib/listIkoner';

/** Ny design: val av ikon för en inköpslista, i stället för EmojiPicker.
 *  Tryck på vald ikon igen för att ta bort valet. */
export function IkonValjare({ value, onChange, label }: {
  value: string | null;
  onChange: (v: string | null) => void;
  label: string;
}) {
  return (
    <>
      <Text style={st.etikett}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.rad} keyboardShouldPersistTaps="handled">
        {LIST_IKONER.map(({ kod, ikon }) => {
          const vald = value === kod;
          return (
            <Pressable
              key={kod}
              style={[st.ikon, vald && st.ikonVald]}
              onPress={() => onChange(vald ? null : kod)}
              accessibilityRole="button"
              accessibilityState={{ selected: vald }}
            >
              <Ionicons name={ikon} size={20} color={vald ? ny.lime : ny.skog} />
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

const st = StyleSheet.create({
  etikett: { fontSize: 14, fontWeight: '600', color: ny.chipText },
  rad: { gap: 6, paddingVertical: 2 },
  ikon: { width: 42, height: 42, borderRadius: 14, backgroundColor: ny.kort, alignItems: 'center', justifyContent: 'center' },
  ikonVald: { backgroundColor: ny.skog },
});
