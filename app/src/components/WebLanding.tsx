import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { landing as str } from '../lib/svenska';

// Publik landningssida på handlis.app. Renderas bara på webben för utloggade
// besökare (se app/index.tsx + NavigationGuard). Marknadsförings-front +
// uppfyller Googles OAuth-verifiering ("home page must be public + explain the
// app"). Fast varumärkespalett (grön/terrakotta) oberoende av besökarens tema
// så sidan alltid ser ut som Handlis.
const LOGO = require('../../assets/icon.png');
const BOARD = require('../../assets/koncept-board.webp'); // krittavle-illustration (1536x850, 3 boxar)
const BOARD_RATIO = 1536 / 850;

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
  slate:     '#1c1c1c',
  chalk:     '#f2ede1',
  chalkMute: '#a9b6a5',
  chalkTerra:'#e6c9a8',
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

      {/* Krittavla — appens kärn-loop (ovanför funktioner). Mobil = swipe-karusell. */}
      <View style={s.board}>
        <View style={s.boardInner}>
          <Text style={s.boardHeading}>{str.flow.heading}</Text>
          <View style={s.boardUnderline} />
          {narrow ? (
            <BoardPager s={s} />
          ) : (
            <Image
              source={BOARD}
              style={s.boardImg}
              resizeMode="contain"
              accessibilityLabel={str.flow.alt}
            />
          )}
          <Text style={s.boardCaption}>{str.flow.caption}</Text>
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

// Horisontell pager (mobil): hela krittavlan (pilarna intakta) som snappar en box
// i taget. Swipe på touch + ‹ ›-knappar på desktop. Bilden är w*3 bred (3 boxar),
// pagingEnabled snappar per w = en box.
function BoardPager({ s }: { s: ReturnType<typeof makeStyles> }) {
  const [w, setW] = useState(0);
  const [page, setPage] = useState(0);
  const ref = useRef<ScrollView>(null);
  const go = (dir: number) => {
    const next = Math.max(0, Math.min(2, page + dir));
    ref.current?.scrollTo({ x: next * w, animated: true });
    setPage(next);
  };
  return (
    <View style={s.pagerOuter}>
      <View style={s.pagerWrap} onLayout={e => setW(e.nativeEvent.layout.width)}>
        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={e => { if (w) setPage(Math.round(e.nativeEvent.contentOffset.x / w)); }}
        >
          {w > 0 && (
            <Image
              source={BOARD}
              style={{ width: w * 3, height: (w * 3) / BOARD_RATIO }}
              resizeMode="cover"
              accessibilityLabel={str.flow.alt}
            />
          )}
        </ScrollView>
        {page > 0 && (
          <Pressable style={[s.pagerNav, s.pagerPrev]} onPress={() => go(-1)} accessibilityLabel="Föregående">
            <Ionicons name="chevron-back" size={22} color={BRAND.chalkTerra} />
          </Pressable>
        )}
        {page < 2 && (
          <Pressable style={[s.pagerNav, s.pagerNext]} onPress={() => go(1)} accessibilityLabel="Nästa">
            <Ionicons name="chevron-forward" size={22} color={BRAND.chalkTerra} />
          </Pressable>
        )}
      </View>
      <View style={s.dots}>
        {[0, 1, 2].map(i => <View key={i} style={[s.dot, page === i && s.dotActive]} />)}
      </View>
    </View>
  );
}

const makeStyles = (narrow: boolean) => StyleSheet.create({
  nav: { backgroundColor: BRAND.creme, borderBottomWidth: 1, borderBottomColor: BRAND.line },
  navInner: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navLogo: { width: 34, height: 34, borderRadius: 9 },
  navName: { fontSize: 22, fontFamily: 'Baloo2', color: BRAND.greenDark, letterSpacing: -0.3 },
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
  sectionInner: { width: '100%', maxWidth: 1040, alignSelf: 'center' },
  sectionHeading: { fontSize: narrow ? 24 : 32, fontWeight: '800', color: BRAND.greenDark, textAlign: 'center', letterSpacing: -0.4, marginBottom: narrow ? 28 : 44 },

  featureGrid: { flexDirection: narrow ? 'column' : 'row', gap: 20, justifyContent: 'center' },
  featureCard: { flex: narrow ? undefined : 1, backgroundColor: BRAND.card, borderRadius: 18, padding: 26, borderWidth: 1, borderColor: BRAND.line },
  featureTitle: { fontSize: 19, fontWeight: '800', color: BRAND.terraDark, marginBottom: 10 },
  featureBody: { fontSize: 15, lineHeight: 23, color: BRAND.inkMuted },

  // Krittavla-sektion (ljus beige bakgrund så den svarta tavlan blir ett kort)
  board: { backgroundColor: BRAND.beige, paddingHorizontal: 20, paddingVertical: narrow ? 44 : 72 },
  boardInner: { width: '100%', maxWidth: 1000, alignSelf: 'center', alignItems: 'center' },
  boardHeading: { fontSize: narrow ? 24 : 32, fontWeight: '800', color: BRAND.greenDark, textAlign: 'center', letterSpacing: -0.2 },
  boardUnderline: { width: 90, height: 3, borderRadius: 2, backgroundColor: BRAND.terra, marginTop: 14, marginBottom: narrow ? 26 : 36 },
  boardImg: { width: '100%', maxWidth: 960, aspectRatio: BOARD_RATIO, borderRadius: 14, alignSelf: 'center' },
  boardCaption: { fontSize: narrow ? 15 : 16, lineHeight: 24, color: BRAND.inkMuted, textAlign: 'center', marginTop: narrow ? 22 : 30, maxWidth: 560 },
  pagerOuter: { width: '100%', maxWidth: 380, alignSelf: 'center' },
  pagerWrap: { width: '100%', borderRadius: 14, overflow: 'hidden', position: 'relative' },
  pagerNav: { position: 'absolute', top: '50%', marginTop: -21, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1.5, borderColor: 'rgba(230,201,168,0.6)', alignItems: 'center', justifyContent: 'center' },
  pagerPrev: { left: 6 },
  pagerNext: { right: 6 },
  dots: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.18)' },
  dotActive: { width: 20, backgroundColor: BRAND.terra },

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
