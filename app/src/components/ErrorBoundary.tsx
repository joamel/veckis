import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={s.container}>
        <Text style={s.emoji}>😵</Text>
        <Text style={s.title}>Något gick fel</Text>
        <Text style={s.body}>
          Ett oväntat fel inträffade. Försök igen — felet har rapporterats så vi kan fixa det.
        </Text>
        <Pressable style={s.btn} onPress={this.reset} accessibilityRole="button" accessibilityLabel="Försök igen">
          <Text style={s.btnText}>Försök igen</Text>
        </Pressable>
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
});
