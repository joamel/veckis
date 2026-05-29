import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Inline warning shown at the top of an edit dialog when someone else changed
 * the same item via realtime while you have it open. A toast can't be used here
 * because React Native renders <Modal> in a separate layer above everything, so
 * a root-level toast would be hidden behind the open dialog (L35).
 *
 * When `onShowLatest` is given, a non-destructive "Visa senaste" button lets the
 * user pull the incoming values into the form on demand (auto-overwriting their
 * in-progress edits would be worse).
 */
export function ConflictBanner({ message, onShowLatest }: { message: string | null; onShowLatest?: () => void }) {
  if (!message) return null;
  return (
    <View style={s.banner}>
      <Ionicons name="warning-outline" size={18} color="#92400e" />
      <Text style={s.text}>{message}</Text>
      {onShowLatest && (
        <Pressable onPress={onShowLatest} hitSlop={6} style={s.action}>
          <Text style={s.actionText}>Visa senaste</Text>
        </Pressable>
      )}
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
  action: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fcd34d' },
  actionText: { fontSize: 13, fontWeight: '700', color: '#78350f' },
});
