import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

// Mat och storhandling först — appen handlar om inköpslistor, och de gamla
// förslagen inleddes med städ och badrum (🧹🧽🧺🧼🛁🚿) medan 🛒 låg sjua.
// Hushåll/apotek finns kvar längre ned för listor som inte är matinköp.
const SUGGESTIONS = [
  '🛒', '🍎', '🥕', '🥛', '🍞', '🧀', '🥩', '🐟', '🥚', '🍝',
  '🍕', '🍫', '☕', '🍺', '🧊', '🍳', '🍽️', '🧑‍🍳', '🎂', '🎉',
  '🧻', '🧼', '🧹', '🧽', '🪴', '🌿', '💊', '🐕', '🐈', '📦',
];

// Inget textfält för fri inmatning — bara förslags-chips. Vald/ej vald syns
// redan tydligt via vilken chip som är markerad; ett separat fält var bara en
// extra, potentiellt missvisande "förhandsvisning" (se BACKLOG_AFTER_PROD.md).
export function EmojiPicker({
  value,
  onChange,
  label = 'Emoji (valfritt)',
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label?: string;
}) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <>
      <Text style={s.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
        {SUGGESTIONS.map(e => (
          <Pressable key={e} style={[s.chip, value === e && s.chipActive]} onPress={() => onChange(value === e ? null : e)}>
            <Text style={s.chipText}>{e}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  chips: { gap: 6, paddingVertical: 2 },
  chip: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.borderLight, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
  chipActive: { borderColor: c.primary, backgroundColor: c.primaryTint },
  chipText: { fontSize: 20 },
});
