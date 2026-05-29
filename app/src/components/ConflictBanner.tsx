import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Inline warning shown at the top of an edit dialog when someone else changed
 * the same item via realtime while you have it open. A toast can't be used here
 * because React Native renders <Modal> in a separate layer above everything, so
 * a root-level toast would be hidden behind the open dialog (L35).
 */
export function ConflictBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.banner}>
      <Ionicons name="warning-outline" size={18} color="#92400e" />
      <Text style={s.text}>{message}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  text: { flex: 1, fontSize: 13, fontWeight: '600', color: '#92400e' },
});
