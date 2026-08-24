import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { landing as str } from '../lib/svenska';

// Publik landningssida på handlis.app. Renderas bara på webben för utloggade
// besökare (se app/index.tsx + NavigationGuard). Marknadsförings-front +
// uppfyller Googles OAuth-verifiering ("home page must be public + explain the
// app"). Fast varumärkespalett (grön/terrakotta) oberoende av besökarens tema
// så sidan alltid ser ut som Handlis.
const LOGO = require('../../assets/icon.png');

const BRAND = {
  greenDark: '#2f5340',
  green:     '#4e7a5e',
  terra:     '#b96a45',
  terraDark: '#a55a37',
  creme:     '#faf8f3',
  beige:     '#eed7c5',
  card:      '#ffffff',
  ink:       '#292524',
  inkMuted:  '#57534e',
  light:     '#f1efec',
  lightMute: '#cdd8ce',
  line:      '#e7e1d6',
};

export function WebLanding() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const narrow = width < 760;
  const s = useMemo(() => makeStyles(narrow), [narrow]);

  const goSignIn = () => router.push('/(auth)/sign-in');
  const goInstall = () => router.push('/install');
  const year = new Date().getFullYear();

  const features = [str.features.shopping, str.features.recipes, str.features.menu];
  const steps = [str.how.step1, str.how.step2, str.how.step3];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BRAND.creme }} contentContainerStyle={{ minHeight: '100%' }}>
      {/* Topp-nav */}
      <View style={s.nav}>
        <View style={s.navInner}>
          <View style={s.navBrand}>
            <Image source={LOGO} style={s.navLogo} resizeMode="cover" />
            <Text style={s.navName}>{str.brand}</Text>
          </View>
          <Pressable onPress={goSignIn} style={s.navSignIn}>
            <Text style={s.navSignInText}>{str.nav.signIn}</Text>
          </Pressable>
        </View>
      </View>

      {/* Hero */}
      <View style={s.hero}>
        <View style={s.heroInner}>
          <Image source={LOGO} style={s.heroLogo} resizeMode="cover" />
          <Text style={s.heroTitle}>{str.hero.tagline}</Text>
          <Text style={s.heroSubtitle}>{str.hero.subtitle}</Text>
          <View style={s.heroCtas}>
            <Pressable onPress={goSignIn} style={s.ctaPrimary}>
              <Text style={s.ctaPrimaryText}>{str.hero.ctaPrimary}</Text>
            </Pressable>
            <Pressable onPress={goInstall} style={s.ctaSecondary}>
              <Text style={s.ctaSecondaryText}>{str.hero.ctaSecondary}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Funktioner */}
      <View style={s.section}>
        <View style={s.sectionInner}>
          <Text style={s.sectionHeading}>{str.features.heading}</Text>
          <View style={s.featureGrid}>
            {features.map((f, i) => (
              <View key={i} style={s.featureCard}>
                <Text style={s.featureTitle}>{f.title}</Text>
                <Text style={s.featureBody}>{f.body}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Så funkar det */}
      <View style={[s.section, s.sectionAlt]}>
        <View style={s.sectionInner}>
          <Text style={s.sectionHeading}>{str.how.heading}</Text>
          <View style={s.stepGrid}>
            {steps.map((st, i) => (
              <View key={i} style={s.step}>
                <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
                <Text style={s.stepTitle}>{st.title}</Text>
                <Text style={s.stepBody}>{st.body}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* CTA-band */}
      <View style={s.ctaBand}>
        <View style={s.ctaBandInner}>
          <Text style={s.ctaBandHeading}>{str.cta.heading}</Text>
          <Text style={s.ctaBandBody}>{str.cta.body}</Text>
          <Pressable onPress={goSignIn} style={s.ctaBandBtn}>
            <Text style={s.ctaPrimaryText}>{str.cta.button}</Text>
          </Pressable>
        </View>
      </View>

      {/* Footer */}
      <View style={s.footer}>
        <View style={s.footerInner}>
          <Text style={s.footerTagline}>{str.footer.tagline}</Text>
          <View style={s.footerLinks}>
            <Pressable onPress={() => router.push('/privacy')}><Text style={s.footerLink}>{str.footer.privacy}</Text></Pressable>
            <Pressable onPress={() => router.push('/terms')}><Text style={s.footerLink}>{str.footer.terms}</Text></Pressable>
            <Pressable onPress={goInstall}><Text style={s.footerLink}>{str.footer.install}</Text></Pressable>
          </View>
          <Text style={s.footerRights}>{str.footer.rights(year)}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const makeStyles = (narrow: boolean) => StyleSheet.create({
  nav: { backgroundColor: BRAND.creme, borderBottomWidth: 1, borderBottomColor: BRAND.line },
  navInner: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navLogo: { width: 34, height: 34, borderRadius: 9 },
  navName: { fontSize: 20, fontWeight: '800', color: BRAND.greenDark, letterSpacing: -0.3 },
  navSignIn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, backgroundColor: BRAND.green },
  navSignInText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  hero: { backgroundColor: BRAND.greenDark, paddingHorizontal: 20, paddingVertical: narrow ? 48 : 80 },
  heroInner: { width: '100%', maxWidth: 780, alignSelf: 'center', alignItems: 'center' },
  heroLogo: { width: 96, height: 96, borderRadius: 22, marginBottom: 24 },
  heroTitle: { fontSize: narrow ? 30 : 44, lineHeight: narrow ? 38 : 52, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: -0.6, maxWidth: 640 },
  heroSubtitle: { fontSize: narrow ? 16 : 18, lineHeight: narrow ? 24 : 28, color: BRAND.lightMute, textAlign: 'center', marginTop: 18, maxWidth: 560 },
  heroCtas: { flexDirection: narrow ? 'column' : 'row', gap: 12, marginTop: 32, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' },
  ctaPrimary: { backgroundColor: BRAND.terra, paddingHorizontal: 28, paddingVertical: 15, borderRadius: 12, alignItems: 'center', minWidth: narrow ? '100%' : 200 },
  ctaPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  ctaSecondary: { paddingHorizontal: 28, paddingVertical: 15, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', minWidth: narrow ? '100%' : 180 },
  ctaSecondaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  section: { paddingHorizontal: 20, paddingVertical: narrow ? 44 : 72, backgroundColor: BRAND.creme },
  sectionAlt: { backgroundColor: BRAND.beige },
  sectionInner: { width: '100%', maxWidth: 1040, alignSelf: 'center' },
  sectionHeading: { fontSize: narrow ? 24 : 32, fontWeight: '800', color: BRAND.greenDark, textAlign: 'center', letterSpacing: -0.4, marginBottom: narrow ? 28 : 44 },

  featureGrid: { flexDirection: narrow ? 'column' : 'row', gap: 20, justifyContent: 'center' },
  featureCard: { flex: narrow ? undefined : 1, backgroundColor: BRAND.card, borderRadius: 18, padding: 26, borderWidth: 1, borderColor: BRAND.line },
  featureTitle: { fontSize: 19, fontWeight: '800', color: BRAND.terraDark, marginBottom: 10 },
  featureBody: { fontSize: 15, lineHeight: 23, color: BRAND.inkMuted },

  stepGrid: { flexDirection: narrow ? 'column' : 'row', gap: 24, justifyContent: 'center' },
  step: { flex: narrow ? undefined : 1, alignItems: 'center', paddingHorizontal: 8 },
  stepNum: { width: 48, height: 48, borderRadius: 24, backgroundColor: BRAND.green, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  stepNumText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  stepTitle: { fontSize: 18, fontWeight: '800', color: BRAND.greenDark, marginBottom: 6, textAlign: 'center' },
  stepBody: { fontSize: 15, lineHeight: 22, color: BRAND.inkMuted, textAlign: 'center', maxWidth: 280 },

  ctaBand: { backgroundColor: BRAND.green, paddingHorizontal: 20, paddingVertical: narrow ? 44 : 64 },
  ctaBandInner: { width: '100%', maxWidth: 720, alignSelf: 'center', alignItems: 'center' },
  ctaBandHeading: { fontSize: narrow ? 24 : 30, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: -0.4 },
  ctaBandBody: { fontSize: 16, color: BRAND.lightMute, textAlign: 'center', marginTop: 12, marginBottom: 28 },
  ctaBandBtn: { backgroundColor: BRAND.terra, paddingHorizontal: 34, paddingVertical: 16, borderRadius: 12, alignItems: 'center', minWidth: narrow ? '100%' : 220 },

  footer: { backgroundColor: BRAND.greenDark, paddingHorizontal: 20, paddingVertical: 40 },
  footerInner: { width: '100%', maxWidth: 1040, alignSelf: 'center', alignItems: 'center' },
  footerTagline: { fontSize: 15, fontWeight: '700', color: BRAND.light, textAlign: 'center' },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 22, justifyContent: 'center', marginTop: 18 },
  footerLink: { fontSize: 14, color: BRAND.lightMute, fontWeight: '600' },
  footerRights: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 22 },
});
