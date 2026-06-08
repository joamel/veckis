import { Component, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { reportClientError } from '../lib/errorReport';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * Fångar render-fel i underträdet så ett oväntat fel inte ger en vit skärm.
 * Visar en vänlig fallback + "Försök igen", och rapporterar felet till backend
 * (→ Render-loggar) så vi ser prod-krascher.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string }) {
    reportClientError(error, { kind: 'render', componentStack: info?.componentStack ?? null });
  }

  reset = () => this.setState({ hasError: false });

  // Web: en hård sid-omladdning funkar pålitligt. På native finns ingen pålitlig
  // JS-reload (expo-updates reloadAsync funkar inte i Expo Go) — där visar vi
  // istället ett råd om att starta om appen manuellt.
  reloadWeb = () => {
    if (typeof window !== 'undefined' && window.location) window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={s.container}>
        <Text style={s.emoji}>😵</Text>
        <Text style={s.title}>Hoppsan, något gick fel</Text>
        <Text style={s.body}>
          Ett oväntat fel inträffade. Det har rapporterats automatiskt så vi kan
          titta på det — du behöver inte göra något.
        </Text>
        <Pressable style={s.btn} onPress={this.reset} accessibilityRole="button" accessibilityLabel="Försök igen">
          <Text style={s.btnText}>Försök igen</Text>
        </Pressable>
        {Platform.OS === 'web' ? (
          <Pressable style={s.btnSecondary} onPress={this.reloadWeb} accessibilityRole="button" accessibilityLabel="Ladda om sidan">
            <Text style={s.btnSecondaryText}>Ladda om sidan</Text>
          </Pressable>
        ) : (
          <Text style={s.hint}>Hjälper det inte? Prova att stänga och starta om appen.</Text>
        )}
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f5f3ff', gap: 12 },
  emoji: { fontSize: 48 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  body: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 21 },
  btn: { marginTop: 8, backgroundColor: '#4f46e5', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: { paddingVertical: 10, paddingHorizontal: 20 },
  btnSecondaryText: { color: '#4f46e5', fontSize: 15, fontWeight: '600' },
  hint: { marginTop: 4, fontSize: 13, color: '#9ca3af', textAlign: 'center' },
});
