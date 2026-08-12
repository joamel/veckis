import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
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
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Tillbaka">
          <Ionicons name="arrow-back" size={24} color={c.text} />
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

const makeLegalStyles = (c: Palette) => StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '700', color: c.text, marginTop: 8, marginBottom: 12 },
  h2: { fontSize: 17, fontWeight: '700', color: c.text, marginTop: 24, marginBottom: 8 },
  p: { fontSize: 14, color: c.textSecondary, lineHeight: 22, marginBottom: 10 },
  list: { fontSize: 14, color: c.textSecondary, lineHeight: 22, marginBottom: 6, paddingLeft: 12 },
  meta: { fontSize: 12, color: c.textFaint, marginTop: 8, fontStyle: 'italic' },
  link: { color: c.accent, fontWeight: '600' },
});

/** Temareaktiva stilar för de juridiska sidornas innehåll (privacy/terms). */
export function useLegalStyles() {
  const { colors: c } = useTheme();
  return useMemo(() => makeLegalStyles(c), [c]);
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  headerTitle: { fontSize: 16, fontWeight: '700', color: c.text },
  scroll: { padding: 20, paddingBottom: 40 },
});
