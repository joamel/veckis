// "Ny version tillgänglig"-banner. Triggas av SW:s controllerchange-/updatefound-
// event som patch-index-html.mjs registrerar i <head>. Bannern ligger högst upp
// i app-trädet och visas bara på web (PWA) — native får uppdateringar via OTA
// som hanteras av Expo Updates.
//
// Klick på 'Ladda om' = window.location.reload(). Då plockas nya bundle:n.
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function VersionBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    // Om SW redan flaggade innan mount:
    if ((window as { __veckisNewVersion?: boolean }).__veckisNewVersion) {
      setVisible(true);
    }
    const handler = () => setVisible(true);
    window.addEventListener('veckis-new-version', handler);
    return () => window.removeEventListener('veckis-new-version', handler);
  }, []);

  if (!visible || Platform.OS !== 'web') return null;

  return (
    <View style={s.banner}>
      <Ionicons name="sparkles-outline" size={16} color="#fff" />
      <Text style={s.text}>Ny version av Veckis tillgänglig</Text>
      <Pressable style={s.btn} onPress={() => window.location.reload()}>
        <Text style={s.btnText}>Ladda om</Text>
      </Pressable>
      <Pressable onPress={() => setVisible(false)} hitSlop={8} accessibilityLabel="Stäng">
        <Ionicons name="close" size={16} color="#ddd6fe" />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#7c3aed',
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: 9999,
  },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  btn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
