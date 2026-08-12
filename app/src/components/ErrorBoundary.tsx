import { Component, type ReactNode } from 'react';
import { Appearance, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { paletteFor, type Palette } from '../lib/theme';
import { reportClientError } from '../lib/errorReport';
import { components as str } from '../lib/svenska';

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
    // Class-komponent → ingen hook; läs OS-schemat direkt (statisk fallback-skärm).
    const c = paletteFor(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
    const s = makeStyles(c);
    return (
      <View style={s.container}>
        <Text style={s.emoji}>😵</Text>
        <Text style={s.title}>{str.errorBoundary.title}</Text>
        <Text style={s.body}>
          {str.errorBoundary.body}
        </Text>
        <Pressable style={s.btn} onPress={this.reset} accessibilityRole="button" accessibilityLabel={str.errorBoundary.retry}>
          <Text style={s.btnText}>{str.errorBoundary.retry}</Text>
        </Pressable>
        {Platform.OS === 'web' ? (
          <Pressable style={s.btnSecondary} onPress={this.reloadWeb} accessibilityRole="button" accessibilityLabel={str.errorBoundary.reloadPage}>
            <Text style={s.btnSecondaryText}>{str.errorBoundary.reloadPage}</Text>
          </Pressable>
        ) : (
          <Text style={s.hint}>{str.errorBoundary.hint}</Text>
        )}
      </View>
    );
  }
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: c.accentTint, gap: 12 },
  emoji: { fontSize: 48 },
  title: { fontSize: 22, fontWeight: '700', color: c.text },
  body: { fontSize: 15, color: c.textMuted, textAlign: 'center', lineHeight: 21 },
  btn: { marginTop: 8, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondary: { paddingVertical: 10, paddingHorizontal: 20 },
  btnSecondaryText: { color: c.primary, fontSize: 15, fontWeight: '600' },
  hint: { marginTop: 4, fontSize: 13, color: c.textFaint, textAlign: 'center' },
});
