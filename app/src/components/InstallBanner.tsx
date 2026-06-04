// Subtil banner som föreslår att installera Veckis som app, visas över
// sign-in-skärmen. En per plattform — vi tystar Chromes egna prompt genom
// att fånga beforeinstallprompt så det blir INTE dubbla erbjudanden:
//
// - Chromium (Android Chrome, desktop Chrome/Edge/Brave): "Installera appen"-
//   knapp som triggar deferredPrompt.prompt() direkt.
// - iOS Safari: hint "Tryck Dela → Lägg till på hemskärmen" (Apple visar
//   ingen automatisk prompt).
// - iOS i annan browser: liten varning om att öppna i Safari.
// - Firefox/Safari desktop, native, eller redan-installerad PWA: visas inte.
//
// Dismissable; en dismiss-flag i localStorage tystar i 7 dagar så användaren
// inte tjafsas med varje sign-in.
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { detectInstallTarget, isAlreadyInstalled, type InstallTarget } from '../lib/installDetect';

const DISMISS_KEY = 'install_banner_dismissed_at';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000; // 7 dagar

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function recentlyDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_MS;
  } catch { return false; }
}

function rememberDismiss() {
  try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
}

export function InstallBanner() {
  const [target, setTarget] = useState<InstallTarget>('unknown');
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setTarget(detectInstallTarget());
    setInstalled(isAlreadyInstalled());
    setDismissed(recentlyDismissed());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (Platform.OS !== 'web') return null;
  if (installed || dismissed) return null;

  async function trigger() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  }

  function dismiss() {
    rememberDismiss();
    setDismissed(true);
  }

  // Chromium: tryckbar knapp om vi har deferredPrompt, annars är browsern
  // inte beredd att erbjuda installation (kanske för få besök ännu) — visa
  // ingen banner då, undviker en knapp som inte gör något.
  if ((target === 'android-chrome' || target === 'desktop-chromium') && deferredPrompt) {
    return (
      <View style={s.banner}>
        <Ionicons name="download-outline" size={20} color="#7c3aed" />
        <Text style={s.text}>Installera Veckis som app</Text>
        <Pressable style={s.actionBtn} onPress={trigger}>
          <Text style={s.actionText}>Installera</Text>
        </Pressable>
        <Pressable onPress={dismiss} hitSlop={8} style={s.closeBtn} accessibilityLabel="Stäng">
          <Ionicons name="close" size={16} color="#9ca3af" />
        </Pressable>
      </View>
    );
  }

  // iOS Safari: ingen automatisk prompt — användaren behöver veta att den
  // går att installera via Dela-menyn. Visa hint.
  if (target === 'ios-safari') {
    return (
      <View style={s.banner}>
        <Ionicons name="phone-portrait-outline" size={20} color="#7c3aed" />
        <Text style={s.text}>
          Tryck <Ionicons name="share-outline" size={14} color="#4f46e5" /> Dela → <Text style={s.bold}>"Lägg till på hemskärmen"</Text> för app-känsla.
        </Text>
        <Pressable onPress={dismiss} hitSlop={8} style={s.closeBtn} accessibilityLabel="Stäng">
          <Ionicons name="close" size={16} color="#9ca3af" />
        </Pressable>
      </View>
    );
  }

  // iOS Chrome/Edge/Firefox: kan inte installera, visa liten varning.
  if (target === 'ios-other') {
    return (
      <View style={[s.banner, s.bannerWarn]}>
        <Ionicons name="information-circle-outline" size={20} color="#b45309" />
        <Text style={[s.text, { color: '#92400e' }]}>
          Öppna i <Text style={s.bold}>Safari</Text> för att installera som app.
        </Text>
        <Pressable onPress={dismiss} hitSlop={8} style={s.closeBtn} accessibilityLabel="Stäng">
          <Ionicons name="close" size={16} color="#b45309" />
        </Pressable>
      </View>
    );
  }

  // Andra plattformar (Firefox/Safari desktop, andra Android utan Chromium):
  // PWA-install fungerar inte — visa inget istället för att lura med ett
  // erbjudande som inte går att uppfylla.
  return null;
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f5f3ff',
    borderLeftWidth: 3,
    borderLeftColor: '#7c3aed',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  bannerWarn: { backgroundColor: '#fef3c7', borderLeftColor: '#f59e0b' },
  text: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 18 },
  bold: { fontWeight: '700', color: '#111827' },
  actionBtn: { backgroundColor: '#7c3aed', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  actionText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  closeBtn: { padding: 4 },
});
