// Inställningar för appen — egen route med tillbaka-pil. Innehåller saker
// man sällan ändrar (notiser, 2FA, juridik, support) och som inte hör hemma
// på Profil-fliken där fokus är hushållet + dess medlemmar.
import { useState, useEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { NotificationsModal } from '../src/components/NotificationsModal';
import { useOnboardingMaster } from '../src/context/SpotlightTipContext';
import { TIP_FLAGS } from '../src/lib/onboardingTips';
import * as SecureStore from '../src/lib/secureStorage';
import { useToast } from '../src/context/ToastContext';
import { HAPTIC_CHECKOUT_KEY, SOUND_CHECKOUT_KEY } from '../src/hooks/useCheckHaptic';
import { preferences as str } from '../src/lib/svenska';

export default function PreferencesScreen() {
  const router = useRouter();
  const { skipAll, setSkipAll } = useOnboardingMaster();
  const { showToast, showError } = useToast();
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    SecureStore.getItemAsync(HAPTIC_CHECKOUT_KEY).then(v => {
      setHapticEnabled(v !== '0');
    }).catch(() => {});
    SecureStore.getItemAsync(SOUND_CHECKOUT_KEY).then(v => {
      setSoundEnabled(v !== '0');
    }).catch(() => {});
  }, []);

  async function handleResetTips() {
    await Promise.all(TIP_FLAGS.map(k => SecureStore.deleteItemAsync(k).catch(() => {})));
    if (skipAll) await setSkipAll(false);
    showToast(str.toasts.tipsReset, 'neutral');
  }

  async function openClerkPortal(path: string, errLabel: string) {
    const portalUrl = `https://new-oarfish-48.accounts.dev${path}`;
    try {
      if (Platform.OS === 'web') {
        window.open(portalUrl, '_blank', 'noopener');
      } else {
        const WebBrowser = await import('expo-web-browser');
        await WebBrowser.openBrowserAsync(portalUrl);
      }
    } catch (e) {
      showError(e, errLabel);
    }
  }

  function handleContactSupport() {
    const Constants = require('expo-constants').default;
    const version = Constants.expoConfig?.version ?? str.support.unknownVersion;
    const subject = encodeURIComponent(str.support.subject);
    const body = encodeURIComponent(str.support.body(version, Platform.OS));
    const url = `mailto:veckis.support@gmail.com?subject=${subject}&body=${body}`;
    if (Platform.OS === 'web') {
      window.location.href = url;
    } else {
      const { Linking } = require('react-native');
      Linking.openURL(url).catch((e: unknown) => showError(e, str.toasts.errorMailApp));
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel={str.backA11y}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <Text style={s.headerTitle}>{str.title}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.sectionLabel}>{str.sections.notifications}</Text>
        <View style={s.group}>
          <Pressable style={s.row} onPress={() => setShowNotifModal(true)}>
            <Ionicons name="notifications-outline" size={18} color="#4f46e5" />
            <Text style={s.rowText}>{str.rows.notifications}</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </Pressable>
        </View>

        <Text style={s.sectionLabel}>{str.sections.app}</Text>
        <View style={s.group}>
          <Pressable style={s.row} onPress={async () => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            await SecureStore.setItemAsync(SOUND_CHECKOUT_KEY, next ? '1' : '0').catch(() => {});
          }}>
            <Ionicons name="musical-note-outline" size={18} color="#7c3aed" />
            <Text style={s.rowText}>{str.rows.sound}</Text>
            <Ionicons name={soundEnabled ? 'toggle' : 'toggle-outline'} size={22} color={soundEnabled ? '#7c3aed' : '#9ca3af'} />
          </Pressable>
          <Pressable style={[s.row, s.rowBorder]} onPress={async () => {
            const next = !hapticEnabled;
            setHapticEnabled(next);
            await SecureStore.setItemAsync(HAPTIC_CHECKOUT_KEY, next ? '1' : '0').catch(() => {});
          }}>
            <Ionicons name="phone-portrait-outline" size={18} color="#7c3aed" />
            <Text style={s.rowText}>{str.rows.haptics}</Text>
            <Ionicons name={hapticEnabled ? 'toggle' : 'toggle-outline'} size={22} color={hapticEnabled ? '#7c3aed' : '#9ca3af'} />
          </Pressable>
          <Pressable style={[s.row, s.rowBorder]} onPress={() => { setSkipAll(skipAll !== true); handleResetTips(); }}>
            <Ionicons name="bulb-outline" size={18} color="#7c3aed" />
            <Text style={s.rowText}>{str.rows.onboardingTips}</Text>
            <Ionicons name={skipAll === true ? 'toggle-outline' : 'toggle'} size={22} color={skipAll === true ? '#9ca3af' : '#7c3aed'} />
          </Pressable>
        </View>

        <Text style={s.sectionLabel}>{str.sections.security}</Text>
        <View style={s.group}>
          <Pressable style={s.row} onPress={() => openClerkPortal('/user/security', str.toasts.errorSecurityPortal)}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#7c3aed" />
            <Text style={s.rowText}>{str.rows.twoFactor}</Text>
            <Ionicons name="open-outline" size={16} color="#9ca3af" />
          </Pressable>
        </View>

        <Text style={s.sectionLabel}>{str.sections.about}</Text>
        <View style={s.group}>
          <Pressable style={s.row} onPress={handleContactSupport}>
            <Ionicons name="mail-outline" size={18} color="#4f46e5" />
            <Text style={s.rowText}>{str.rows.contactSupport}</Text>
            <Ionicons name="open-outline" size={16} color="#9ca3af" />
          </Pressable>
          <Pressable style={[s.row, s.rowBorder]} onPress={() => router.push('/privacy' as never)}>
            <Ionicons name="shield-outline" size={18} color="#6b7280" />
            <Text style={s.rowText}>{str.rows.privacyPolicy}</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </Pressable>
          <Pressable style={[s.row, s.rowBorder]} onPress={() => router.push('/terms' as never)}>
            <Ionicons name="document-text-outline" size={18} color="#6b7280" />
            <Text style={s.rowText}>{str.rows.terms}</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </Pressable>
        </View>
      </ScrollView>

      <NotificationsModal visible={showNotifModal} onClose={() => setShowNotifModal(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8, marginTop: 16, marginBottom: 8, paddingHorizontal: 4 },
  group: { backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#cbd5e1', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rowText: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },
});
