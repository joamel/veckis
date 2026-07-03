import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { components as str } from '../lib/svenska';

/**
 * Välkomstmodal som fyrar EN gång vid första app-start (efter sign-in +
 * hushållsval). Två val:
 *
 *   "Fortsätt"        → lämnar onboarding-tipsen påslagna; de visas
 *                       allteftersom användaren utforskar flikarna
 *   "Jag är fullärd"  → master-toggle av, inga tips visas alls
 *
 * Båda valen markerar `seen-welcome-tip` så modalen inte återkommer.
 */
interface Props {
  visible: boolean;
  onContinue: () => void;
  onSkipAll: () => void;
}

export function WelcomeModal({ visible, onContinue, onSkipAll }: Props) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade">
      <View style={s.dim} />
      <View style={s.cardWrap}>
        <View style={s.card}>
          <View style={s.iconBubble}>
            <Ionicons name="sparkles" size={32} color="#fff" />
          </View>
          <Text style={s.title}>{str.welcomeModal.title}</Text>
          <Text style={s.message}>
            {str.welcomeModal.message}
          </Text>
          <Text style={s.subtle}>
            {str.welcomeModal.subtle} <Text style={s.subtleBold}>{str.welcomeModal.subtleBold}</Text>.
          </Text>
          <Pressable style={s.primaryBtn} onPress={onContinue} accessibilityRole="button" accessibilityLabel={str.welcomeModal.continueA11y}>
            <Text style={s.primaryBtnText}>{str.welcomeModal.continueAction}</Text>
          </Pressable>
          <Pressable style={s.secondaryBtn} onPress={onSkipAll} accessibilityRole="button" accessibilityLabel={str.welcomeModal.skipAllA11y}>
            <Text style={s.secondaryBtnText}>{str.welcomeModal.skipAll}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.85)' },
  cardWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
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
  iconBubble: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#b96a45',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#292524', textAlign: 'center', marginBottom: 12 },
  message: { fontSize: 15, color: '#44403c', textAlign: 'center', lineHeight: 22, marginBottom: 12 },
  subtle: { fontSize: 13, color: '#78716c', textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  subtleBold: { fontWeight: '700', color: '#4e7a5e' },
  primaryBtn: { backgroundColor: '#4e7a5e', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { color: '#78716c', fontSize: 14, fontWeight: '600' },
});
