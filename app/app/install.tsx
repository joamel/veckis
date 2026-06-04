// Publik landningssida för installation: APK-nedladdning för Android,
// PWA-install-prompt där browsern stödjer det, manuell instruktion för
// iOS Safari. Detekterar plattform via UA och visar bara det som är
// relevant — användaren ska inte behöva läsa fel kolumn.
//
// Inte auth-skyddad (NavigationGuard hoppar över /install). Användare
// hamnar här via en delad länk: https://veckis-web.onrender.com/install
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { detectInstallTarget, isAlreadyInstalled, type InstallTarget } from '../src/lib/installDetect';

// Senaste APK från EAS preview-build. Uppdatera när vi gör nya builds.
const APK_URL = 'https://expo.dev/artifacts/eas/boWs3BichtLKjGHtvsJ2GN.apk';

// Chromiums beforeinstallprompt-event. Sparas globalt så vi kan trigga
// PWA-prompten på knapptryck.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallScreen() {
  const router = useRouter();
  const [target, setTarget] = useState<InstallTarget>('unknown');
  const [installed, setInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setTarget(detectInstallTarget());
    setInstalled(isAlreadyInstalled());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    const installedHandler = () => setInstalled(true);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  async function triggerPwaInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  }

  // Om de redan har installerat PWA: bara öppna appen direkt.
  if (installed) {
    return (
      <View style={s.container}>
        <View style={s.card}>
          <Ionicons name="checkmark-circle" size={56} color="#10b981" />
          <Text style={s.title}>Veckis är installerat</Text>
          <Text style={s.body}>Du kör redan appen som installerad PWA. Öppna den från hemskärmen.</Text>
          <Pressable style={s.primaryBtn} onPress={() => router.replace('/(tabs)/schedule')}>
            <Text style={s.primaryBtnText}>Öppna appen</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.container}>
      <View style={s.hero}>
        <View style={s.logoCircle}>
          <Ionicons name="checkmark" size={32} color="#fff" />
        </View>
        <Text style={s.title}>Veckis</Text>
        <Text style={s.tagline}>Veckomeny, sysslor och inköp för hushållet</Text>
      </View>

      {/* Android: APK + PWA-install om Chromium */}
      {(target === 'android-chrome' || target === 'android-other') && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Android</Text>
          <Text style={s.cardBody}>Två sätt att få Veckis på din telefon:</Text>

          <View style={s.optionBox}>
            <View style={s.optionHeader}>
              <Ionicons name="logo-android" size={22} color="#10b981" />
              <Text style={s.optionTitle}>Ladda hem appen (APK)</Text>
            </View>
            <Text style={s.optionBody}>
              Hela appen med pushnotiser. Du behöver godkänna installation
              från okänd källa när Android frågar.
            </Text>
            <Pressable style={s.primaryBtn} onPress={() => { window.location.href = APK_URL; }}>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>Ladda hem APK</Text>
            </Pressable>
          </View>

          {target === 'android-chrome' && (
            <View style={[s.optionBox, { marginTop: 12 }]}>
              <View style={s.optionHeader}>
                <Ionicons name="globe-outline" size={22} color="#7c3aed" />
                <Text style={s.optionTitle}>Installera som webbapp (PWA)</Text>
              </View>
              <Text style={s.optionBody}>
                Snabbare att komma igång. Funkar offline men inga pushnotiser.
              </Text>
              {deferredPrompt ? (
                <Pressable style={s.secondaryBtn} onPress={triggerPwaInstall}>
                  <Ionicons name="add-circle-outline" size={18} color="#7c3aed" />
                  <Text style={s.secondaryBtnText}>Installera som app</Text>
                </Pressable>
              ) : (
                <Text style={s.hint}>
                  Tryck på menyn (⋮) i Chrome → <Text style={s.bold}>"Installera appen"</Text> eller <Text style={s.bold}>"Lägg till på startskärmen"</Text>.
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* iOS Safari: bara manuell PWA-install */}
      {(target === 'ios-safari' || target === 'ios-other') && (
        <View style={s.card}>
          <Text style={s.cardTitle}>iPhone / iPad</Text>
          <Text style={s.cardBody}>
            Apple tillåter inte direkt-installation från web. Du installerar Veckis
            som en webbapp via Safari:
          </Text>
          {target === 'ios-other' && (
            <View style={s.warningBox}>
              <Ionicons name="warning-outline" size={18} color="#b45309" />
              <Text style={s.warningText}>
                Öppna denna sida i <Text style={s.bold}>Safari</Text> — andra browsers (Chrome/Edge på iOS)
                kan inte installera webbappar.
              </Text>
            </View>
          )}
          <View style={s.stepRow}>
            <Text style={s.stepNum}>1.</Text>
            <Text style={s.stepText}>
              Tryck på <Ionicons name="share-outline" size={18} color="#4f46e5" />{' '}
              <Text style={s.bold}>Dela</Text>-ikonen längst ner i Safari.
            </Text>
          </View>
          <View style={s.stepRow}>
            <Text style={s.stepNum}>2.</Text>
            <Text style={s.stepText}>
              Bläddra ner och välj <Text style={s.bold}>"Lägg till på hemskärmen"</Text>.
            </Text>
          </View>
          <View style={s.stepRow}>
            <Text style={s.stepNum}>3.</Text>
            <Text style={s.stepText}>
              Bekräfta — Veckis-ikonen dyker upp på hemskärmen och fungerar som
              en vanlig app.
            </Text>
          </View>
        </View>
      )}

      {/* Desktop Chromium: PWA-install via address-bar */}
      {target === 'desktop-chromium' && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Desktop (Chrome / Edge / Brave)</Text>
          <Text style={s.cardBody}>Installera Veckis som ett separat fönster på datorn:</Text>
          {deferredPrompt ? (
            <Pressable style={s.primaryBtn} onPress={triggerPwaInstall}>
              <Ionicons name="desktop-outline" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>Installera som app</Text>
            </Pressable>
          ) : (
            <Text style={s.hint}>
              Klicka på install-ikonen <Ionicons name="download-outline" size={16} color="#4f46e5" /> i adressfältet,
              eller via menyn → <Text style={s.bold}>"Installera Veckis"</Text>.
            </Text>
          )}
        </View>
      )}

      {/* Firefox / Safari desktop: PWA stöds inte. Säg det rakt ut. */}
      {(target === 'desktop-firefox' || target === 'desktop-safari') && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{target === 'desktop-firefox' ? 'Firefox' : 'Safari'} stödjer inte PWA-install</Text>
          <Text style={s.cardBody}>
            Du kan ändå använda Veckis direkt i browsern utan installation —
            klicka bara <Text style={s.bold}>"Öppna webbappen"</Text> nedan.
          </Text>
          <Text style={s.hint}>
            För installation: öppna sidan i <Text style={s.bold}>Chrome</Text>, <Text style={s.bold}>Edge</Text> eller <Text style={s.bold}>Brave</Text>.
          </Text>
        </View>
      )}

      {/* Fallback för okända plattformar */}
      {(target === 'desktop-other' || target === 'unknown') && (
        <View style={s.card}>
          <Text style={s.cardTitle}>Använd webbappen direkt</Text>
          <Text style={s.cardBody}>
            På din enhet är det enklast att bara öppna webbappen. Du kan
            också ladda ner Android-APK om du har en Android-telefon.
          </Text>
          <Pressable style={s.secondaryBtn} onPress={() => { window.location.href = APK_URL; }}>
            <Ionicons name="logo-android" size={18} color="#7c3aed" />
            <Text style={s.secondaryBtnText}>Ladda hem Android-APK</Text>
          </Pressable>
        </View>
      )}

      <Pressable style={s.linkBtn} onPress={() => router.replace('/(auth)/sign-in')}>
        <Text style={s.linkBtnText}>Eller öppna webbappen direkt →</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 24, paddingBottom: 60, backgroundColor: '#f5f3ff', minHeight: '100%' },
  hero: { alignItems: 'center', marginTop: 24, marginBottom: 32 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 32, fontWeight: '700', color: '#111827', textAlign: 'center' },
  tagline: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2, maxWidth: 560, alignSelf: 'stretch', width: '100%' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  cardBody: { fontSize: 14, color: '#374151', lineHeight: 20, marginBottom: 12 },
  optionBox: { padding: 14, borderRadius: 12, backgroundColor: '#f9fafb', borderLeftWidth: 3, borderLeftColor: '#c4b5fd' },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  optionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  optionBody: { fontSize: 13, color: '#6b7280', marginBottom: 10, lineHeight: 18 },
  primaryBtn: { backgroundColor: '#7c3aed', borderRadius: 10, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#f5f3ff', borderRadius: 10, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4, borderWidth: 1, borderColor: '#c4b5fd' },
  secondaryBtnText: { color: '#7c3aed', fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 13, color: '#6b7280', lineHeight: 20, fontStyle: 'italic' },
  bold: { fontWeight: '700', color: '#111827', fontStyle: 'normal' },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' },
  stepNum: { fontSize: 14, fontWeight: '700', color: '#7c3aed', width: 20 },
  stepText: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
  warningBox: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 8, backgroundColor: '#fef3c7', alignItems: 'flex-start', marginBottom: 12 },
  warningText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },
  body: { fontSize: 14, color: '#374151', textAlign: 'center', marginTop: 8, marginBottom: 16 },
  linkBtn: { padding: 12, alignSelf: 'center' },
  linkBtnText: { fontSize: 14, color: '#7c3aed', fontWeight: '600' },
});
