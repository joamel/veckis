import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
          <Text style={s.title}>Välkommen till Veckis!</Text>
          <Text style={s.message}>
            Här följer några korta tips och trix om hur appen fungerar. De dyker
            upp allteftersom du utforskar flikarna — meny, sysslor, kalender och
            inköpslista.
          </Text>
          <Text style={s.subtle}>
            Tipsen visas bara en gång per styck och du kan slå av eller återställa
            dem under <Text style={s.subtleBold}>Inställningar ⋮</Text>.
          </Text>
          <Pressable style={s.primaryBtn} onPress={onContinue} accessibilityRole="button" accessibilityLabel="Fortsätt med onboarding-tips">
            <Text style={s.primaryBtnText}>Fortsätt</Text>
          </Pressable>
          <Pressable style={s.secondaryBtn} onPress={onSkipAll} accessibilityRole="button" accessibilityLabel="Hoppa över alla tips">
            <Text style={s.secondaryBtnText}>Jag är fullärd — hoppa över tipsen</Text>
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
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#7c3aed',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 12 },
  message: { fontSize: 15, color: '#374151', textAlign: 'center', lineHeight: 22, marginBottom: 12 },
  subtle: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  subtleBold: { fontWeight: '700', color: '#4f46e5' },
  primaryBtn: { backgroundColor: '#4f46e5', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { color: '#6b7280', fontSize: 14, fontWeight: '600' },
});
