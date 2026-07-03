import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

const SUGGESTIONS = [
  '🧹', '🧽', '🧺', '🧼', '🛁', '🚿', '🛒', '🍳', '🍽️', '🧑‍🍳',
  '🌿', '🌸', '🪴', '🐕', '🐈', '🚗', '🚲', '⚽', '🎾', '🎵',
  '📚', '🎂', '🎉', '💼', '💊', '💡', '🔧', '🧰', '📦', '✏️',
];

export function EmojiPicker({
  value,
  onChange,
  label = 'Emoji (valfritt)',
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label?: string;
}) {
  return (
    <>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        <TextInput
          style={s.input}
          value={value ?? ''}
          onChangeText={t => onChange(t ? Array.from(t)[0] ?? null : null)}
          maxLength={8}
          placeholder="🧹"
          placeholderTextColor="#a8a29e"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
          {SUGGESTIONS.map(e => (
            <Pressable key={e} style={[s.chip, value === e && s.chipActive]} onPress={() => onChange(value === e ? null : e)}>
              <Text style={s.chipText}>{e}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: '#44403c' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { width: 56, height: 44, borderWidth: 1, borderColor: '#e7e5e4', borderRadius: 10, backgroundColor: '#faf8f3', textAlign: 'center', fontSize: 22 },
  chips: { gap: 6, paddingVertical: 2 },
  chip: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#e7e5e4', backgroundColor: '#faf8f3', alignItems: 'center', justifyContent: 'center' },
  chipActive: { borderColor: '#4e7a5e', backgroundColor: '#ecf3ec' },
  chipText: { fontSize: 20 },
});
