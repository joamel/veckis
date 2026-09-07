import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
// "Ny version tillgänglig"-hantering.
// - Web (PWA): triggas av SW:s controllerchange-/updatefound-event. Kräver
//   fortsatt ett klick (en sidladdning är billig/förväntad UX på webben).
// - Native: en OTA byts nu in TYST nästa gång appen återupptas från
//   bakgrunden (AppState 'active' efter att ha varit backgroundad) — inget
//   klick, ingen banner. Tidigare krävde en oranje banner ett manuellt
//   "Starta om"-tryck, vilket dels kändes oprofessionellt i produktion,
//   dels renderades UTANFÖR säkert område (ingen top-inset) så knappen
//   kunde hamna delvis under skärmskåran/statusfältet på vissa enheter.
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { components as str, common } from '../lib/svenska';

function WebVersionBanner() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(c, insets.top), [c, insets.top]);
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
    <View style={s.banner}>
      <Ionicons name="sparkles-outline" size={16} color="#fff" />
      <Text style={s.text}>{str.versionBanner.webText}</Text>
      <Pressable style={s.btn} onPress={() => window.location.reload()}>
        <Text style={s.btnText}>{str.versionBanner.webAction}</Text>
      </Pressable>
      <Pressable onPress={() => setVisible(false)} hitSlop={8} accessibilityLabel={common.actions.close}>
        <Ionicons name="close" size={16} color={c.accent200} />
      </Pressable>
    </View>
  );
}

/** Ingen UI — byter tyst till den nedladdade OTA:n nästa gång appen kommer
 *  tillbaka i förgrunden (aldrig mitt i en pågående session). */
function NativeAutoUpdate() {
  const { isUpdateAvailable } = Updates.useUpdates();
  const pendingRef = useRef(false);
  useEffect(() => { pendingRef.current = isUpdateAvailable; }, [isUpdateAvailable]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && pendingRef.current) void Updates.reloadAsync();
    });
    return () => sub.remove();
  }, []);
  return null;
}

export function VersionBanner() {
  if (Platform.OS as any === 'web') return <WebVersionBanner />;
  return <NativeAutoUpdate />;
}

const makeStyles = (c: Palette, insetTop: number) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.accent,
    paddingHorizontal: 14,
    paddingTop: insetTop + 10,
    paddingBottom: 10,
    zIndex: 9999,
  },
  text: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  btn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
