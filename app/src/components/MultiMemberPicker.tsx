import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface MultiMemberPickerProps {
  members: { id: string; displayName: string }[];
  selected: string[];
  rotation: boolean;
  onChange: (ids: string[]) => void;
  onRotationChange: (v: boolean) => void;
  /** När false (t.ex. engångssyssla utan upprepning) visas rotation-raden
   *  utgråad med en förklaring i stället för att vara valbar. Default true. */
  rotationAllowed?: boolean;
}

/**
 * Väljare för att tilldela 0..n personer en syssla, med en rotation-toggle som
 * dyker upp först när 2+ personer är valda. Utbruten ur chores.tsx för
 * återanvändning + isolerad render-testning.
 */
export function MultiMemberPicker({ members, selected, rotation, onChange, onRotationChange, rotationAllowed = true }: MultiMemberPickerProps) {
  if (members.length === 0) return null;
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else onChange([...selected, id]);
  };
  return (
    <>
      <Text style={s.label}>Tilldela person{selected.length > 1 ? 'er' : ''}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.memberChipRow}>
        <Pressable
          style={[s.memberChip, selected.length === 0 && s.memberChipActive]}
          onPress={() => onChange([])}
        >
          <Text style={[s.memberChipText, selected.length === 0 && s.memberChipTextActive]}>Ingen</Text>
        </Pressable>
        {members.map(m => {
          const isActive = selected.includes(m.id);
          return (
            <Pressable
              key={m.id}
              style={[s.memberChip, isActive && s.memberChipActive]}
              onPress={() => toggle(m.id)}
            >
              <Text style={[s.memberChipText, isActive && s.memberChipTextActive]}>{m.displayName}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {selected.length >= 2 ? (
        rotationAllowed ? (
          <Pressable
            style={s.rotationRow}
            onPress={() => onRotationChange(!rotation)}
            accessibilityRole="switch"
            accessibilityState={{ checked: rotation }}
          >
            <View style={[s.rotationBox, rotation && s.rotationBoxActive]}>
              {rotation ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rotationLabel}>Turas om automatiskt</Text>
              <Text style={s.rotationSub}>
                {rotation
                  ? 'Tur byts efter varje avbockning — alla turas om i listan.'
                  : 'Alla i listan är gemensamt ansvariga (ingen rotation).'}
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={[s.rotationRow, s.rotationRowDisabled]} accessibilityState={{ disabled: true }}>
            <View style={s.rotationBox} />
            <View style={{ flex: 1 }}>
              <Text style={s.rotationLabel}>Turas om automatiskt</Text>
              <Text style={s.rotationSub}>Välj en upprepning först — en engångssyssla kan inte turas om.</Text>
            </View>
          </View>
        )
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  memberChipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  memberChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', flexShrink: 0 },
  memberChipActive: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  memberChipText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  memberChipTextActive: { color: '#7c3aed', fontWeight: '600' },
  rotationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, marginTop: 8 },
  rotationRowDisabled: { opacity: 0.45 },
  rotationBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  rotationBoxActive: { borderColor: '#7c3aed', backgroundColor: '#7c3aed' },
  rotationLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rotationSub: { fontSize: 12, color: '#6b7280', marginTop: 2, lineHeight: 17 },
});
