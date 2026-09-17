import { useMemo, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useDesign } from '../context/DesignContext';
import { nyFont, type NyPalett } from '../lib/nyDesign';
import type { Palette } from '../lib/theme';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { components as str } from '../lib/svenska';

const LOGO = require('../../assets/icon.png');

/**
 * Koncept-guide som fyrar EN gång vid första app-start (efter sign-in +
 * hushållsval). En flerstegs "så här funkar Handlis"-genomgång: välkomst +
 * kärn-loopen recept → veckomeny → inköpslista (samma story som landnings-
 * sidans krittavla). Ersätter de gamla spridda spotlight-tipsen.
 *
 * `onDone` markerar `seen-concept-walkthrough` så guiden inte återkommer;
 * "Återställ tips" i inställningar nollställer flaggan och visar den igen.
 */
interface Props {
  visible: boolean;
  onDone: () => void;
}

export function WelcomeModal({ visible, onDone }: Props) {
  const { colors: c, ny } = useTheme();
  const { nyDesign } = useDesign();
  const s = useMemo(() => makeStyles(c, nyDesign, ny), [c, nyDesign, ny]);
  const [step, setStep] = useState(0);
  const steps = str.walkthrough.steps;
  const isLast = step === steps.length - 1;
  const current = steps[step];

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={s.dim} />
      <View style={s.cardWrap}>
        <View style={s.card}>
          <Pressable
            style={s.skip}
            onPress={onDone}
            accessibilityRole="button"
            accessibilityLabel={str.walkthrough.skipA11y}
          >
            <Text style={s.skipText}>{str.walkthrough.skip}</Text>
          </Pressable>

          {step === 0 ? (
            <Image source={LOGO} style={s.logo} resizeMode="cover" />
          ) : (
            <View style={s.iconBubble}>
              <Ionicons name={current.icon} size={32} color={nyDesign ? ny.lime : '#fff'} />
            </View>
          )}
          <Text style={s.title}>{current.title}</Text>
          <Text style={s.message}>{current.body}</Text>

          <View
            style={s.dots}
            accessibilityRole="progressbar"
            accessibilityLabel={str.walkthrough.progressA11y(step + 1, steps.length)}
          >
            {steps.map((_, i) => (
              <View key={i} style={[s.dot, i === step && s.dotActive]} />
            ))}
          </View>

          <Pressable
            style={s.primaryBtn}
            onPress={() => (isLast ? onDone() : setStep(step + 1))}
            accessibilityRole="button"
          >
            <Text style={s.primaryBtnText}>
              {isLast ? str.walkthrough.done : str.walkthrough.next}
            </Text>
          </Pressable>
          {step > 0 && (
            <Pressable
              style={s.secondaryBtn}
              onPress={() => setStep(step - 1)}
              accessibilityRole="button"
            >
              <Text style={s.secondaryBtnText}>{str.walkthrough.back}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

// nyD: den nya designen (beta) skriver over de stilar som skiljer.
const makeStyles = (c: Palette, nyD: boolean, ny: NyPalett) => StyleSheet.create({
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)' },
  cardWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    backgroundColor: nyD ? ny.kort : c.surface,
    borderRadius: nyD ? 24 : 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  skip: { position: 'absolute', top: 14, right: 16, padding: 6, zIndex: 1 },
  skipText: { color: nyD ? ny.textDampad : c.textMuted, fontSize: 13, fontWeight: '600' },
  iconBubble: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: nyD ? ny.skog : c.accent,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16, marginTop: 8,
  },
  logo: { width: 76, height: 76, borderRadius: 18, alignSelf: 'center', marginBottom: 16, marginTop: 8 },
  title: { fontSize: 24, fontFamily: nyD ? nyFont.fet : 'Baloo2', color: nyD ? ny.padYta : c.primary, textAlign: 'center', marginBottom: 12 },
  message: { fontSize: 15, color: nyD ? ny.textDampad : c.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: nyD ? ny.kontur : c.border },
  dotActive: { backgroundColor: nyD ? ny.skog : c.primary, width: 20 },
  // Lime ar designens "tryck har"; morkgron text pa lime, inte vit.
  primaryBtn: { backgroundColor: nyD ? ny.lime : c.primary, borderRadius: nyD ? 14 : 12, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  primaryBtnText: { color: nyD ? ny.skog : '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 10, alignItems: 'center' },
  secondaryBtnText: { color: nyD ? ny.textDampad : c.textMuted, fontSize: 14, fontWeight: '600' },
});
