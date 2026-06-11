import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsOnline } from '../hooks/useIsOnline';

export function OfflineBanner() {
  const online = useIsOnline();
  if (online) return null;
  return (
    <View style={s.banner}>
      <Ionicons name="cloud-offline-outline" size={15} color="#fff" />
      <Text style={s.text}>Ingen anslutning — ändringar synkas när du är online igen.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#374151',
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 9998,
  },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '500' },
});
