import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
import { useOnceFlag } from '../hooks/useOnceFlag';
import { gettingStarted as str } from '../lib/svenska';

export interface GettingStartedStep {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  done: boolean;
  onPress: () => void;
}

/**
 * Icke-påträngande "Kom igång"-kort för nya hushåll. Bock-listan mäter VERKLIG
 * framgång (done-state läses från backend av föräldern), och att trycka på en
 * ej-klar rad navigerar + tänder en spotlight på rätt kontroll (opt-in guidning
 * — inget fyrar oombedt). Kortet döljs när användaren stänger det ELLER när alla
 * steg är klara.
 */
export function GettingStartedCard({ steps }: { steps: GettingStartedStep[] }) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { seen, markSeen } = useOnceFlag('seen-getting-started');

  if (seen !== false) return null;
  if (steps.length > 0 && steps.every(st => st.done)) return null;

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Ionicons name="sparkles-outline" size={16} color={c.primary} style={{ marginRight: 6 }} />
        <Text style={s.title}>{str.title}</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={markSeen} hitSlop={12} accessibilityLabel={str.close}>
          <Ionicons name="close" size={20} color={c.textFaint} />
        </Pressable>
      </View>
      <Text style={s.subtitle}>{str.subtitle}</Text>
      {steps.map(step => (
        <Pressable
          key={step.key}
          style={s.item}
          onPress={step.done ? undefined : step.onPress}
          disabled={step.done}
          accessibilityRole="button"
          accessibilityState={{ disabled: step.done }}
        >
          <Ionicons
            name={step.done ? 'checkmark-circle' : step.icon}
            size={20}
            color={step.done ? c.success : c.primary}
          />
          <Text style={[s.itemLabel, step.done && s.itemLabelDone]}>{step.label}</Text>
          {step.done
            ? <Text style={s.doneTag}>{str.done}</Text>
            : <Ionicons name="chevron-forward" size={16} color={c.textFaint} />}
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: c.primaryTint,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: c.text },
  subtitle: { fontSize: 12.5, color: c.textMuted, marginTop: 2, marginBottom: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: c.borderLight,
  },
  itemLabel: { flex: 1, fontSize: 14, color: c.text },
  itemLabelDone: { color: c.textFaint, textDecorationLine: 'line-through' },
  doneTag: { fontSize: 12, color: c.success, fontWeight: '600' },
});
