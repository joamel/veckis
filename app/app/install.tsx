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
import { install as str } from '../src/lib/svenska';

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
          <Text style={s.title}>{str.installed.title}</Text>
          <Text style={s.body}>{str.installed.body}</Text>
          <Pressable style={s.primaryBtn} onPress={() => router.replace('/(tabs)/schedule')}>
            <Text style={s.primaryBtnText}>{str.installed.openApp}</Text>
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
        <Text style={s.title}>{str.hero.title}</Text>
        <Text style={s.tagline}>{str.hero.tagline}</Text>
      </View>

      {/* Android: APK + PWA-install om Chromium */}
      {(target === 'android-chrome' || target === 'android-other') && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{str.android.cardTitle}</Text>
          <Text style={s.cardBody}>{str.android.cardBody}</Text>

          <View style={s.optionBox}>
            <View style={s.optionHeader}>
              <Ionicons name="logo-android" size={22} color="#10b981" />
              <Text style={s.optionTitle}>{str.android.apk.title}</Text>
            </View>
            <Text style={s.optionBody}>
              {str.android.apk.body}
            </Text>
            <Pressable style={s.primaryBtn} onPress={() => { window.location.href = APK_URL; }}>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>{str.android.apk.download}</Text>
            </Pressable>
          </View>

          {target === 'android-chrome' && (
            <View style={[s.optionBox, { marginTop: 12 }]}>
              <View style={s.optionHeader}>
                <Ionicons name="globe-outline" size={22} color="#b96a45" />
                <Text style={s.optionTitle}>{str.android.pwa.title}</Text>
              </View>
              <Text style={s.optionBody}>
                {str.android.pwa.body}
              </Text>
              {deferredPrompt ? (
                <Pressable style={s.secondaryBtn} onPress={triggerPwaInstall}>
                  <Ionicons name="add-circle-outline" size={18} color="#b96a45" />
                  <Text style={s.secondaryBtnText}>{str.android.pwa.install}</Text>
                </Pressable>
              ) : (
                <Text style={s.hint}>
                  {str.android.pwa.hintPrefix}<Text style={s.bold}>"{str.android.pwa.hintInstall}"</Text>{str.android.pwa.hintOr}<Text style={s.bold}>"{str.android.pwa.hintAddHome}"</Text>{str.android.pwa.hintSuffix}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* iOS Safari: bara manuell PWA-install */}
      {(target === 'ios-safari' || target === 'ios-other') && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{str.ios.cardTitle}</Text>
          <Text style={s.cardBody}>
            {str.ios.cardBody}
          </Text>
          {target === 'ios-other' && (
            <View style={s.warningBox}>
              <Ionicons name="warning-outline" size={18} color="#b45309" />
              <Text style={s.warningText}>
                {str.ios.warningPrefix}<Text style={s.bold}>{str.ios.warningSafari}</Text>{str.ios.warningSuffix}
              </Text>
            </View>
          )}
          <View style={s.stepRow}>
            <Text style={s.stepNum}>1.</Text>
            <Text style={s.stepText}>
              {str.ios.step1Prefix}<Ionicons name="share-outline" size={18} color="#4e7a5e" />{' '}
              <Text style={s.bold}>{str.ios.step1Bold}</Text>{str.ios.step1Suffix}
            </Text>
          </View>
          <View style={s.stepRow}>
            <Text style={s.stepNum}>2.</Text>
            <Text style={s.stepText}>
              {str.ios.step2Prefix}<Text style={s.bold}>"{str.ios.step2Bold}"</Text>{str.ios.step2Suffix}
            </Text>
          </View>
          <View style={s.stepRow}>
            <Text style={s.stepNum}>3.</Text>
            <Text style={s.stepText}>
              {str.ios.step3}
            </Text>
          </View>
        </View>
      )}

      {/* Desktop Chromium: PWA-install via address-bar */}
      {target === 'desktop-chromium' && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{str.desktop.cardTitle}</Text>
          <Text style={s.cardBody}>{str.desktop.cardBody}</Text>
          {deferredPrompt ? (
            <Pressable style={s.primaryBtn} onPress={triggerPwaInstall}>
              <Ionicons name="desktop-outline" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>{str.desktop.install}</Text>
            </Pressable>
          ) : (
            <Text style={s.hint}>
              {str.desktop.hintPrefix}<Ionicons name="download-outline" size={16} color="#4e7a5e" />{str.desktop.hintMiddle}<Text style={s.bold}>"{str.desktop.hintBold}"</Text>{str.desktop.hintSuffix}
            </Text>
          )}
        </View>
      )}

      {/* Firefox / Safari desktop: PWA stöds inte. Säg det rakt ut. */}
      {(target === 'desktop-firefox' || target === 'desktop-safari') && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{str.unsupportedDesktop.cardTitle(target === 'desktop-firefox' ? str.unsupportedDesktop.firefoxName : str.unsupportedDesktop.safariName)}</Text>
          <Text style={s.cardBody}>
            {str.unsupportedDesktop.cardBodyPrefix}<Text style={s.bold}>"{str.unsupportedDesktop.cardBodyBold}"</Text>{str.unsupportedDesktop.cardBodySuffix}
          </Text>
          <Text style={s.hint}>
            {str.unsupportedDesktop.hintPrefix}<Text style={s.bold}>{str.unsupportedDesktop.hintChrome}</Text>{str.unsupportedDesktop.hintComma}<Text style={s.bold}>{str.unsupportedDesktop.hintEdge}</Text>{str.unsupportedDesktop.hintOr}<Text style={s.bold}>{str.unsupportedDesktop.hintBrave}</Text>{str.unsupportedDesktop.hintSuffix}
          </Text>
        </View>
      )}

      {/* Fallback för okända plattformar */}
      {(target === 'desktop-other' || target === 'unknown') && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{str.fallback.cardTitle}</Text>
          <Text style={s.cardBody}>
            {str.fallback.cardBody}
          </Text>
          <Pressable style={s.secondaryBtn} onPress={() => { window.location.href = APK_URL; }}>
            <Ionicons name="logo-android" size={18} color="#b96a45" />
            <Text style={s.secondaryBtnText}>{str.fallback.downloadApk}</Text>
          </Pressable>
        </View>
      )}

      <Pressable style={s.linkBtn} onPress={() => router.replace('/(auth)/sign-in')}>
        <Text style={s.linkBtnText}>{str.openWebAppLink}</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 24, paddingBottom: 60, backgroundColor: '#faf1e9', minHeight: '100%' },
  hero: { alignItems: 'center', marginTop: 24, marginBottom: 32 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#b96a45', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 32, fontWeight: '700', color: '#292524', textAlign: 'center' },
  tagline: { fontSize: 15, color: '#78716c', textAlign: 'center', marginTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2, maxWidth: 560, alignSelf: 'stretch', width: '100%' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#292524', marginBottom: 6 },
  cardBody: { fontSize: 14, color: '#44403c', lineHeight: 20, marginBottom: 12 },
  optionBox: { padding: 14, borderRadius: 12, backgroundColor: '#faf8f3', borderLeftWidth: 3, borderLeftColor: '#e2bda1' },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  optionTitle: { fontSize: 15, fontWeight: '700', color: '#292524' },
  optionBody: { fontSize: 13, color: '#78716c', marginBottom: 10, lineHeight: 18 },
  primaryBtn: { backgroundColor: '#b96a45', borderRadius: 10, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#faf1e9', borderRadius: 10, padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4, borderWidth: 1, borderColor: '#e2bda1' },
  secondaryBtnText: { color: '#b96a45', fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 13, color: '#78716c', lineHeight: 20, fontStyle: 'italic' },
  bold: { fontWeight: '700', color: '#292524', fontStyle: 'normal' },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' },
  stepNum: { fontSize: 14, fontWeight: '700', color: '#b96a45', width: 20 },
  stepText: { flex: 1, fontSize: 14, color: '#44403c', lineHeight: 20 },
  warningBox: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 8, backgroundColor: '#fef3c7', alignItems: 'flex-start', marginBottom: 12 },
  warningText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },
  body: { fontSize: 14, color: '#44403c', textAlign: 'center', marginTop: 8, marginBottom: 16 },
  linkBtn: { padding: 12, alignSelf: 'center' },
  linkBtnText: { fontSize: 14, color: '#b96a45', fontWeight: '600' },
});
