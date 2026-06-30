// "Ny version tillgänglig/laddad"-banner.
// - Web (PWA): triggas av SW:s controllerchange-/updatefound-event.
// - Native: använder expo-updates useUpdates() — visas när en OTA-uppdatering
//   laddats ned och appen behöver startas om för att den ska aktiveras.
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { components as str, common } from '../lib/svenska';

function SharedBanner({ text, actionLabel, onAction, onDismiss }: {
  text: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={s.banner}>
      <Ionicons name="sparkles-outline" size={16} color="#fff" />
      <Text style={s.text}>{text}</Text>
      <Pressable style={s.btn} onPress={onAction}>
        <Text style={s.btnText}>{actionLabel}</Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={8} accessibilityLabel={common.actions.close}>
        <Ionicons name="close" size={16} color="#ddd6fe" />
      </Pressable>
    </View>
  );
}

function WebVersionBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as { __veckisNewVersion?: boolean }).__veckisNewVersion) {
      setVisible(true);
    }
    const handler = () => setVisible(true);
    window.addEventListener('veckis-new-version', handler);
    return () => window.removeEventListener('veckis-new-version', handler);
  }, []);

  if (!visible) return null;
  return (
    <SharedBanner
      text={str.versionBanner.webText}
      actionLabel={str.versionBanner.webAction}
      onAction={() => window.location.reload()}
      onDismiss={() => setVisible(false)}
    />
  );
}

function NativeVersionBanner() {
  const { isUpdateAvailable } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);

  if (!isUpdateAvailable || dismissed) return null;
  return (
    <SharedBanner
      text={str.versionBanner.nativeText}
      actionLabel={str.versionBanner.nativeAction}
      onAction={() => { void Updates.reloadAsync(); }}
      onDismiss={() => setDismissed(true)}
    />
  );
}

export function VersionBanner() {
  if (Platform.OS === 'web') return <WebVersionBanner />;
  return <NativeVersionBanner />;
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
