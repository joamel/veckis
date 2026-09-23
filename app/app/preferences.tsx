import { useMemo } from 'react';
import { useTheme } from '../src/context/ThemeContext';
import type { Palette } from '../src/lib/theme';
// Inställningar för appen — egen route med tillbaka-pil. Innehåller saker
// man sällan ändrar (notiser, 2FA, juridik, support) och som inte hör hemma
// på Profil-fliken där fokus är hushållet + dess medlemmar.
import { useState, useEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { formateraLyftspår, senasteLyftspår } from '../src/lib/lyftdiagnostik';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { NotificationsModal } from '../src/components/NotificationsModal';
import { TIP_FLAGS } from '../src/lib/onboardingTips';
import * as SecureStore from '../src/lib/secureStorage';
import { useToast } from '../src/context/ToastContext';
import { HAPTIC_CHECKOUT_KEY, SOUND_CHECKOUT_KEY } from '../src/hooks/useCheckHaptic';
import { LANDING_TABS, DEFAULT_LANDING_TAB, getLandingTab, setLandingTab, type LandingTabKey } from '../src/lib/landingTab';
import { preferences as str } from '../src/lib/svenska';
import { useDesign } from '../src/context/DesignContext';
import { useBottomGap } from '../src/hooks/useBottomGap';
import { nyFont, type NyPalett } from '../src/lib/nyDesign';
import { NyHeader } from '../src/components/nydesign/NyHeader';

export default function PreferencesScreen() {
  const { colors: c, ny } = useTheme();
  const { nyDesign } = useDesign();
  // Kant-i-kant: sista raden får inte hamna under systemraden.
  const bottomGap = useBottomGap();
  const s = useMemo(() => makeStyles(c, nyDesign, ny), [c, nyDesign, ny]);
  const router = useRouter();
  const { showToast, showError } = useToast();
  const [showNotifModal, setShowNotifModal] = useState(false);
  // Läses vid render: raden uppdateras nästa gång skärmen öppnas, vilket
  // räcker — man tittar på den EFTER att ha provat en modal.
  const lyftrad = formateraLyftspår(senasteLyftspår());
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [landingTab, setLandingTabState] = useState<LandingTabKey>(DEFAULT_LANDING_TAB);

  useEffect(() => {
    SecureStore.getItemAsync(HAPTIC_CHECKOUT_KEY).then(v => {
      setHapticEnabled(v !== '0');
    }).catch(() => {});
    SecureStore.getItemAsync(SOUND_CHECKOUT_KEY).then(v => {
      setSoundEnabled(v !== '0');
    }).catch(() => {});
    getLandingTab().then(setLandingTabState);
  }, []);

  async function handleResetTips() {
    await Promise.all(TIP_FLAGS.map(k => SecureStore.deleteItemAsync(k).catch(() => {})));
    showToast(str.toasts.tipsReset, 'neutral');
  }

  function handleContactSupport() {
    const version = Constants.expoConfig?.version ?? str.support.unknownVersion;
    const subject = encodeURIComponent(str.support.subject);
    const body = encodeURIComponent(str.support.body(version, Platform.OS));
    const url = `mailto:support@handlis.app?subject=${subject}&body=${body}`;
    if (Platform.OS as any === 'web') {
      window.location.href = url;
    } else {
      const { Linking } = require('react-native');
      Linking.openURL(url).catch((e: unknown) => showError(e, str.toasts.errorMailApp));
    }
  }

  return (
    <SafeAreaView style={s.container} edges={nyDesign ? ['top', 'left', 'right'] : undefined}>
      {nyDesign ? (
        <NyHeader title={str.title} onBack={() => router.back()} backLabel={str.backA11y} />
      ) : (
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel={str.backA11y}>
          <Ionicons name="arrow-back" size={24} color={c.text} />
        </Pressable>
        <Text style={s.headerTitle}>{str.title}</Text>
        <View style={{ width: 24 }} />
      </View>
      )}

      <ScrollView style={s.innehall} contentContainerStyle={[s.scroll, { paddingBottom: bottomGap + 24 }]}>
        <Text style={s.sectionLabel}>{str.sections.notifications}</Text>
        <View style={s.group}>
          <Pressable style={s.row} onPress={() => setShowNotifModal(true)}>
            {nyDesign ? (
              <View style={[s.nyRund, s.nyRundMork]}><Ionicons name="notifications-outline" size={18} color={ny.lime} /></View>
            ) : (
              <Ionicons name="notifications-outline" size={18} color={c.primary} />
            )}
            <Text style={s.rowText}>{str.rows.notifications}</Text>
            <Ionicons name="chevron-forward" size={16} color={nyDesign ? ny.kontur : c.textFaint} />
          </Pressable>
        </View>

        <Text style={s.sectionLabel}>{str.sections.app}</Text>
        <View style={s.group}>
          <Pressable style={s.row} onPress={async () => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            await SecureStore.setItemAsync(SOUND_CHECKOUT_KEY, next ? '1' : '0').catch(() => {});
          }}>
            {nyDesign ? (
              <View style={[s.nyRund, s.nyRundLjus]}><Ionicons name="musical-note-outline" size={18} color={ny.padYta} /></View>
            ) : (
              <Ionicons name="musical-note-outline" size={18} color={c.accent} />
            )}
            <Text style={s.rowText}>{str.rows.sound}</Text>
            <Ionicons
              name={soundEnabled ? 'toggle' : 'toggle-outline'}
              size={22}
              color={nyDesign ? (soundEnabled ? ny.padYta : ny.kontur) : (soundEnabled ? c.accent : c.textFaint)}
            />
          </Pressable>
          <Pressable style={[s.row, s.rowBorder]} onPress={async () => {
            const next = !hapticEnabled;
            setHapticEnabled(next);
            await SecureStore.setItemAsync(HAPTIC_CHECKOUT_KEY, next ? '1' : '0').catch(() => {});
          }}>
            {nyDesign ? (
              <View style={[s.nyRund, s.nyRundLjus]}><Ionicons name="phone-portrait-outline" size={18} color={ny.padYta} /></View>
            ) : (
              <Ionicons name="phone-portrait-outline" size={18} color={c.accent} />
            )}
            <Text style={s.rowText}>{str.rows.haptics}</Text>
            <Ionicons
              name={hapticEnabled ? 'toggle' : 'toggle-outline'}
              size={22}
              color={nyDesign ? (hapticEnabled ? ny.padYta : ny.kontur) : (hapticEnabled ? c.accent : c.textFaint)}
            />
          </Pressable>
          <Pressable style={[s.row, s.rowBorder]} onPress={handleResetTips}>
            {nyDesign ? (
              <View style={[s.nyRund, s.nyRundLjus]}><Ionicons name="bulb-outline" size={18} color={ny.padYta} /></View>
            ) : (
              <Ionicons name="bulb-outline" size={18} color={c.accent} />
            )}
            <Text style={s.rowText}>{str.rows.onboardingTips}</Text>
            <Ionicons name="refresh-outline" size={18} color={nyDesign ? ny.kontur : c.textFaint} />
          </Pressable>
          {/* Favorit-landningssida: vilken flik appen öppnar på */}
          <View style={[s.row, s.rowBorder, { flexWrap: 'wrap' }]}>
            {nyDesign ? (
              <View style={[s.nyRund, s.nyRundLjus]}><Ionicons name="home-outline" size={18} color={ny.padYta} /></View>
            ) : (
              <Ionicons name="home-outline" size={18} color={c.accent} />
            )}
            <Text style={s.rowText}>{str.landing.label}</Text>
            <View style={s.landingChips}>
              {LANDING_TABS.map(t => {
                const active = landingTab === t.key;
                return (
                  <Pressable
                    key={t.key}
                    style={[s.landingChip, active && s.landingChipActive]}
                    onPress={() => { setLandingTabState(t.key); setLandingTab(t.key).catch(() => {}); }}
                  >
                    <Ionicons name={t.icon as never} size={13} color={nyDesign ? (active ? ny.lime : ny.chipText) : (active ? '#fff' : c.textMuted)} />
                    <Text style={[s.landingChipText, active && s.landingChipTextActive]}>{str.landing.tabs[t.labelKey]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <Text style={s.sectionLabel}>{str.sections.about}</Text>
        <View style={s.group}>
          <Pressable style={s.row} onPress={handleContactSupport}>
            {nyDesign ? (
              <View style={[s.nyRund, s.nyRundMork]}><Ionicons name="mail-outline" size={18} color={ny.lime} /></View>
            ) : (
              <Ionicons name="mail-outline" size={18} color={c.primary} />
            )}
            <Text style={s.rowText}>{str.rows.contactSupport}</Text>
            <Ionicons name="open-outline" size={16} color={nyDesign ? ny.kontur : c.textFaint} />
          </Pressable>
          <Pressable style={[s.row, s.rowBorder]} onPress={() => router.push('/privacy' as never)}>
            {nyDesign ? (
              <View style={[s.nyRund, s.nyRundLjus]}><Ionicons name="shield-outline" size={18} color={ny.padYta} /></View>
            ) : (
              <Ionicons name="shield-outline" size={18} color={c.textMuted} />
            )}
            <Text style={s.rowText}>{str.rows.privacyPolicy}</Text>
            <Ionicons name="chevron-forward" size={16} color={nyDesign ? ny.kontur : c.textFaint} />
          </Pressable>
          <Pressable style={[s.row, s.rowBorder]} onPress={() => router.push('/terms' as never)}>
            {nyDesign ? (
              <View style={[s.nyRund, s.nyRundLjus]}><Ionicons name="document-text-outline" size={18} color={ny.padYta} /></View>
            ) : (
              <Ionicons name="document-text-outline" size={18} color={c.textMuted} />
            )}
            <Text style={s.rowText}>{str.rows.terms}</Text>
            <Ionicons name="chevron-forward" size={16} color={nyDesign ? ny.kontur : c.textFaint} />
          </Pressable>
        </View>

        {/* Diagnostik för att felsöka OTA-uppdateringar (2026-09-07: flera
            runda av "fixen syns inte" som visade sig svåra att felsöka utan
            att kunna se vilken kanal/update-id den installerade appen faktiskt
            kör). Ren text, inget UI-beroende — trygg att lämna kvar. */}
        <Text style={s.versionFooter}>
          v{Constants.expoConfig?.version ?? '?'} · runtime {Updates.runtimeVersion ?? '?'} · {Platform.OS} · kanal: {Updates.channel ?? '(inbyggd, ingen OTA)'}
          {Updates.isEmbeddedLaunch ? ' · inbyggd bundle' : ` · update ${Updates.updateId?.slice(0, 8) ?? '?'}`}
        </Text>
        {/* Senaste tangentbordslyftet. Samma skäl som raden ovan: lyftet går
            bara att felsöka på en riktig telefon, och siffrorna som avgör det
            syns annars ingenstans. Visas först när något faktiskt mätts. */}
        {lyftrad ? <Text style={s.versionFooter}>{lyftrad}</Text> : null}
      </ScrollView>

      <NotificationsModal visible={showNotifModal} onClose={() => setShowNotifModal(false)} />
    </SafeAreaView>
  );
}

// nyD: den nya designen (beta) skriver över de stilar som skiljer.
const makeStyles = (c: Palette, nyD: boolean, ny: NyPalett) => StyleSheet.create({
  container: { flex: 1, backgroundColor: nyD ? ny.skog : c.background },
  innehall: nyD ? { backgroundColor: ny.bakgrund } : {},
  // Runda ikonbrickor, samma mönster som i Hushållet.
  nyRund: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  nyRundMork: { backgroundColor: ny.valdYta },
  nyRundLjus: { backgroundColor: ny.bricka },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  headerTitle: { fontSize: 16, fontWeight: '700', color: c.text },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: nyD
    ? { fontFamily: nyFont.fet, fontSize: 13, letterSpacing: 0.6, color: ny.padYta, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 }
    : { fontSize: 11, fontWeight: '700', color: c.textFaint, letterSpacing: 0.8, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 },
  group: { backgroundColor: c.surface, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: c.border, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1, paddingHorizontal: 14, ...(nyD ? { backgroundColor: ny.kort, borderRadius: 18, borderLeftWidth: 0, shadowOpacity: 0, elevation: 0 } : {}) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: nyD ? 10 : 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: nyD ? ny.bricka : c.surfaceSubtle },
  rowText: nyD
    ? { flex: 1, fontFamily: nyFont.fet, fontSize: 16, letterSpacing: -0.2, color: ny.text }
    : { flex: 1, fontSize: 15, color: c.text, fontWeight: '500' },
  versionFooter: { fontSize: 11, color: nyD ? ny.textDampad : c.textFaint, textAlign: 'center', marginTop: 16 },
  landingChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: '100%', marginTop: 4, paddingLeft: nyD ? 50 : 30 },
  landingChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: nyD ? ny.bricka : c.surfaceSubtle },
  landingChipActive: { backgroundColor: nyD ? ny.valdYta : c.primary },
  landingChipText: { fontSize: 12, fontWeight: '600', color: nyD ? ny.chipText : c.textMuted },
  landingChipTextActive: { color: nyD ? ny.lime : '#fff' },
});
