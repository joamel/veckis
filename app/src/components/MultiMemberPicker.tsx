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
  /** Dölj turordnings-editorn (override). Default: visas när rotation=true och 3+ är valda. */
  showOrderSection?: boolean;
}

export function MultiMemberPicker({ members, selected, rotation, onChange, onRotationChange, rotationAllowed = true, showOrderSection }: MultiMemberPickerProps) {
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
      {selected.length >= 2 && rotationAllowed ? (
        <>
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
            {rotation && selected.length >= 3 && showOrderSection !== false && (
              <View style={s.orderSection}>
                <Text style={s.orderLabel}>Turordning</Text>
                {selected.map((id, i) => {
                  const m = members.find(x => x.id === id);
                  if (!m) return null;
                  const moveUp = () => {
                    const a = [...selected];
                    [a[i - 1], a[i]] = [a[i], a[i - 1]];
                    onChange(a);
                  };
                  const moveDown = () => {
                    const a = [...selected];
                    [a[i], a[i + 1]] = [a[i + 1], a[i]];
                    onChange(a);
                  };
                  return (
                    <View key={id} style={s.orderRow}>
                      <Text style={s.orderNum}>{i + 1}</Text>
                      <Text style={s.orderName}>{m.displayName}</Text>
                      <View style={s.orderBtns}>
                        <Pressable
                          onPress={moveUp}
                          disabled={i === 0}
                          style={s.orderBtn}
                          accessibilityLabel="Flytta upp"
                        >
                          <Ionicons name="chevron-up" size={18} color={i === 0 ? '#d1d5db' : '#6b7280'} />
                        </Pressable>
                        <Pressable
                          onPress={moveDown}
                          disabled={i === selected.length - 1}
                          style={s.orderBtn}
                          accessibilityLabel="Flytta ned"
                        >
                          <Ionicons name="chevron-down" size={18} color={i === selected.length - 1 ? '#d1d5db' : '#6b7280'} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: '#374151' },
  memberChipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  memberChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', flexShrink: 0 },
  memberChipActive: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  memberChipText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  memberChipTextActive: { color: '#7c3aed', fontWeight: '600' },
  rotationRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, marginTop: 8 },
  rotationBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  rotationBoxActive: { borderColor: '#7c3aed', backgroundColor: '#7c3aed' },
  rotationLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rotationSub: { fontSize: 12, color: '#6b7280', marginTop: 2, lineHeight: 17 },
  orderSection: { marginTop: 10, gap: 4 },
  orderLabel: { fontSize: 12, fontWeight: '600', color: '#9ca3af', letterSpacing: 0.5, marginBottom: 4 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#f5f3ff', borderRadius: 10, borderWidth: 1, borderColor: '#ede9fe' },
  orderNum: { fontSize: 13, fontWeight: '700', color: '#7c3aed', width: 18, textAlign: 'center' },
  orderName: { flex: 1, fontSize: 14, fontWeight: '500', color: '#111827' },
  orderBtns: { flexDirection: 'row', gap: 2 },
  orderBtn: { padding: 4 },
});
