// Delad chrome för juridiska sidor (privacy + terms). Statisk text-rendering
// med rubriker + stycken. Routen ska kunna nås utan inloggning så det är
// medvetet enkelt — inget API, ingen state.
import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  title: string;
  children: ReactNode;
}

export function LegalPage({ title, children }: Props) {
  const router = useRouter();
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Tillbaka">
          <Ionicons name="arrow-back" size={24} color="#292524" />
        </Pressable>
        <Text style={s.headerTitle}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        {children}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

export const legalStyles = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '700', color: '#292524', marginTop: 8, marginBottom: 12 },
  h2: { fontSize: 17, fontWeight: '700', color: '#292524', marginTop: 24, marginBottom: 8 },
  p: { fontSize: 14, color: '#44403c', lineHeight: 22, marginBottom: 10 },
  list: { fontSize: 14, color: '#44403c', lineHeight: 22, marginBottom: 6, paddingLeft: 12 },
  meta: { fontSize: 12, color: '#a8a29e', marginTop: 8, fontStyle: 'italic' },
  link: { color: '#b96a45', fontWeight: '600' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1efec' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#292524' },
  scroll: { padding: 20, paddingBottom: 40 },
});
