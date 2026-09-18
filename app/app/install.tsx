import { useMemo } from 'react';
import { useTheme } from '../src/context/ThemeContext';
import type { Palette } from '../src/lib/theme';
import { nyFont, nyLjus as ny } from '../src/lib/nyDesign';
// Publik landningssida för installation: PWA-install-prompt där browsern
// stödjer det, manuell instruktion för iOS Safari. Detekterar plattform via
// UA och visar bara det som är relevant — användaren ska inte behöva läsa
// fel kolumn.
//
// Inte auth-skyddad (NavigationGuard hoppar över /install). Användare
// hamnar här via en delad länk: https://handlis.app/install
//
// Följer sign-in.tsx-mönstret (appens enda andra helt publika helskärm):
// mörkgrönt skog-huvud med ordmärket i Outfit, en ljus "kort"-yta med
// rundade överkanter under. Fast varumärkespalett (skog & lime), oberoende
// av besökarens tema — precis som inloggningen ska den här sidan alltid se
// ut som Handlis. c/theme.ts används bara kvar för varnings-tonerna
// (warningTint/warningText), som inte är kärn-brand.
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { detectInstallTarget, isAlreadyInstalled, type InstallTarget } from '../src/lib/installDetect';
import { install as str } from '../src/lib/svenska';

// Chromiums beforeinstallprompt-event. Sparas globalt så vi kan trigga
// PWA-prompten på knapptryck.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallScreen() {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const [target, setTarget] = useState<InstallTarget>('unknown');
  const [installed, setInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS as any !== 'web') return;
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
        <View style={s.hero}>
          <View style={s.logoCircle}>
            <Ionicons name="checkmark" size={32} color={ny.skog} />
          </View>
          <Text style={s.title}>{str.installed.title}</Text>
        </View>
        <View style={s.sheet}>
          <Text style={s.installedBody}>{str.installed.body}</Text>
          <Pressable style={s.primaryBtn} onPress={() => router.replace('/')}>
            <Text style={s.primaryBtnText}>{str.installed.openApp}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scrollContent}>
        <View style={s.hero}>
          <View style={s.logoCircle}>
            <Ionicons name="checkmark" size={32} color={ny.skog} />
          </View>
          <Text style={s.title}>{str.hero.title}</Text>
          <Text style={s.subtitle}>{str.hero.tagline}</Text>
        </View>

        <View style={s.sheet}>
          {/* Android: "kommer snart" + PWA-install om Chromium */}
          {(target === 'android-chrome' || target === 'android-other') && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{str.android.cardTitle}</Text>
              <Text style={s.sectionBody}>{str.android.cardBody}</Text>

              <View style={s.optionBox}>
                <View style={s.optionHeader}>
                  <Ionicons name="logo-android" size={22} color={ny.skog} />
                  <Text style={s.optionTitle}>{str.android.comingSoon.title}</Text>
                </View>
                <Text style={s.optionBody}>
                  {str.android.comingSoon.body}
                </Text>
              </View>

              {target === 'android-chrome' && (
                <View style={[s.optionBox, { marginTop: 12 }]}>
                  <View style={s.optionHeader}>
                    <Ionicons name="globe-outline" size={22} color={ny.skog} />
                    <Text style={s.optionTitle}>{str.android.pwa.title}</Text>
                  </View>
                  <Text style={s.optionBody}>
                    {str.android.pwa.body}
                  </Text>
                  {deferredPrompt ? (
                    <Pressable style={s.primaryBtn} onPress={triggerPwaInstall}>
                      <Ionicons name="add-circle-outline" size={18} color={ny.skog} />
                      <Text style={s.primaryBtnText}>{str.android.pwa.install}</Text>
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
            <View style={s.section}>
              <Text style={s.sectionTitle}>{str.ios.cardTitle}</Text>
              <Text style={s.sectionBody}>
                {str.ios.cardBody}
              </Text>
              {target === 'ios-other' && (
                <View style={s.warningBox}>
                  <Ionicons name="warning-outline" size={18} color={c.warningText} />
                  <Text style={s.warningText}>
                    {str.ios.warningPrefix}<Text style={s.bold}>{str.ios.warningSafari}</Text>{str.ios.warningSuffix}
                  </Text>
                </View>
              )}
              <View style={s.steps}>
                <View style={s.stepRow}>
                  <Text style={s.stepNum}>1.</Text>
                  <Text style={s.stepText}>
                    {str.ios.step1Prefix}<Ionicons name="share-outline" size={18} color={ny.skog} />{' '}
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
              <Text style={s.hint}>{str.androidComingSoon}</Text>
            </View>
          )}

          {/* Desktop Chromium: PWA-install via address-bar */}
          {target === 'desktop-chromium' && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{str.desktop.cardTitle}</Text>
              <Text style={s.sectionBody}>{str.desktop.cardBody}</Text>
              {deferredPrompt ? (
                <Pressable style={s.primaryBtn} onPress={triggerPwaInstall}>
                  <Ionicons name="desktop-outline" size={18} color={ny.skog} />
                  <Text style={s.primaryBtnText}>{str.desktop.install}</Text>
                </Pressable>
              ) : (
                <Text style={s.hint}>
                  {str.desktop.hintPrefix}<Ionicons name="download-outline" size={16} color={ny.skog} />{str.desktop.hintMiddle}<Text style={s.bold}>"{str.desktop.hintBold}"</Text>{str.desktop.hintSuffix}
                </Text>
              )}
              <Text style={s.hint}>{str.androidComingSoon}</Text>
            </View>
          )}

          {/* Firefox / Safari desktop: PWA stöds inte. Säg det rakt ut. */}
          {(target === 'desktop-firefox' || target === 'desktop-safari') && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{str.unsupportedDesktop.cardTitle(target === 'desktop-firefox' ? str.unsupportedDesktop.firefoxName : str.unsupportedDesktop.safariName)}</Text>
              <Text style={s.sectionBody}>
                {str.unsupportedDesktop.cardBodyPrefix}<Text style={s.bold}>"{str.unsupportedDesktop.cardBodyBold}"</Text>{str.unsupportedDesktop.cardBodySuffix}
              </Text>
              <Text style={s.hint}>
                {str.unsupportedDesktop.hintPrefix}<Text style={s.bold}>{str.unsupportedDesktop.hintChrome}</Text>{str.unsupportedDesktop.hintComma}<Text style={s.bold}>{str.unsupportedDesktop.hintEdge}</Text>{str.unsupportedDesktop.hintOr}<Text style={s.bold}>{str.unsupportedDesktop.hintBrave}</Text>{str.unsupportedDesktop.hintSuffix}
              </Text>
              <Text style={s.hint}>{str.androidComingSoon}</Text>
            </View>
          )}

          {/* Fallback för okända plattformar */}
          {(target === 'desktop-other' || target === 'unknown') && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{str.fallback.cardTitle}</Text>
              <Text style={s.sectionBody}>
                {str.fallback.cardBody}
              </Text>
            </View>
          )}

          <Pressable style={s.linkBtn} onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={s.linkBtnText}>{str.openWebAppLink}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: ny.skog },
  scrollContent: { flexGrow: 1 },
  hero: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 40, paddingBottom: 28 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: ny.lime, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 34, fontFamily: nyFont.fet, letterSpacing: -0.8, color: ny.rubrikLjus, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 15, color: ny.underrubrik, textAlign: 'center', maxWidth: 320 },
  sheet: { flexGrow: 1, backgroundColor: ny.kort, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40, alignItems: 'center' },
  section: { alignItems: 'center', width: '100%', maxWidth: 440 },
  sectionTitle: { fontFamily: nyFont.fet, fontWeight: 'normal', fontSize: 22, letterSpacing: -0.4, color: ny.padYta, textAlign: 'center', marginBottom: 8 },
  sectionBody: { fontSize: 14, color: ny.textDampad, lineHeight: 20, textAlign: 'center', marginBottom: 16 },
  optionBox: { width: '100%', padding: 16, borderRadius: 14, backgroundColor: ny.ljus, borderWidth: 1, borderColor: ny.kontur, alignItems: 'center' },
  optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 },
  optionTitle: { fontFamily: nyFont.halvfet, fontSize: 16, color: ny.text, textAlign: 'center' },
  optionBody: { fontSize: 13, color: ny.textDampad, marginBottom: 10, lineHeight: 18, textAlign: 'center' },
  primaryBtn: { backgroundColor: ny.lime, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4, width: '100%' },
  primaryBtnText: { fontFamily: nyFont.halvfet, color: ny.skog, fontSize: 16 },
  hint: { fontSize: 13, color: ny.textDampad, lineHeight: 20, fontStyle: 'italic', textAlign: 'center', marginTop: 12 },
  bold: { fontFamily: nyFont.halvfet, color: ny.text, fontStyle: 'normal' },
  steps: { width: '100%', marginTop: 4 },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' },
  stepNum: { fontFamily: nyFont.halvfet, fontSize: 14, color: ny.padYta, width: 20 },
  stepText: { flex: 1, fontSize: 14, color: ny.textDampad, lineHeight: 20 },
  warningBox: { width: '100%', flexDirection: 'row', gap: 8, padding: 10, borderRadius: 8, backgroundColor: c.warningTint, alignItems: 'flex-start', marginBottom: 12 },
  warningText: { flex: 1, fontSize: 13, color: c.warningText, lineHeight: 18 },
  installedBody: { fontSize: 14, color: ny.textDampad, textAlign: 'center', marginBottom: 20 },
  linkBtn: { marginTop: 24, alignSelf: 'center', padding: 12 },
  linkBtnText: { fontFamily: nyFont.halvfet, fontSize: 14, color: ny.padYta, textDecorationLine: 'underline' },
});
