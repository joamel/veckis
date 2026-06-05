// 404 — Expo Routers convention för okända paths. Visar vänlig
// "hittades inte"-vy med vägar tillbaka istället för en blank spinner
// eller automatisk redirect till schedule som hände innan.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotFoundScreen() {
  const router = useRouter();
  // Visa den felaktiga path:en så användaren ser vad som inte fanns —
  // ofta en typo i en delad länk.
  const params = useLocalSearchParams<{ unmatched?: string }>();

  return (
    <SafeAreaView style={s.container}>
      <View style={s.inner}>
        <View style={s.iconCircle}>
          <Ionicons name="search-outline" size={48} color="#7c3aed" />
        </View>
        <Text style={s.title}>Sidan hittades inte</Text>
        <Text style={s.body}>
          Vi kunde inte hitta sidan du sökte. Den kan ha tagits bort,
          flyttats eller också är länken fel.
        </Text>
        {params.unmatched && (
          <Text style={s.path}>{String(params.unmatched)}</Text>
        )}
        <View style={s.actions}>
          <Pressable style={s.primaryBtn} onPress={() => router.replace('/(tabs)/schedule' as never)}>
            <Text style={s.primaryBtnText}>Till kalendern</Text>
          </Pressable>
          <Pressable style={s.secondaryBtn} onPress={() => router.back()}>
            <Text style={s.secondaryBtnText}>Tillbaka</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f3ff' },
  inner: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center', gap: 16 },
  iconCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827', textAlign: 'center' },
  body: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22, maxWidth: 360 },
  path: { fontSize: 12, color: '#9ca3af', fontFamily: 'monospace', backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginTop: 4 },
  actions: { width: '100%', maxWidth: 320, gap: 10, marginTop: 16 },
  primaryBtn: { backgroundColor: '#7c3aed', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { backgroundColor: 'transparent', paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#c4b5fd' },
  secondaryBtnText: { color: '#7c3aed', fontSize: 15, fontWeight: '600' },
});
