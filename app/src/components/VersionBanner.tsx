import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
import type { NyPalett } from '../lib/nyDesign';
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
  const { colors: c, ny } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(c, ny, insets.top), [c, ny, insets.top]);
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
      <Ionicons name="sparkles-outline" size={16} color={ny.lime} />
      <Text style={s.text}>{str.versionBanner.webText}</Text>
      <Pressable style={s.btn} onPress={() => window.location.reload()}>
        <Text style={s.btnText}>{str.versionBanner.webAction}</Text>
      </Pressable>
      <Pressable onPress={() => setVisible(false)} hitSlop={8} accessibilityLabel={common.actions.close}>
        <Ionicons name="close" size={16} color={ny.underrubrik} />
      </Pressable>
    </View>
  );
}

// Så länge efter att appen kommit fram en nyss nedladdad OTA får laddas in
// direkt. Senare än så kan användaren ha börjat skriva — då väntar den till
// nästa gång appen kommer fram.
const RELOAD_WINDOW_MS = 5000;

/** Ingen UI. Kollar efter OTA vid start OCH varje gång appen kommer fram, och
 *  byter in den tyst.
 *
 *  Förut lyssnade den bara på `isUpdateAvailable`, som sätts av kollen vid
 *  kallstart — och ingenting annat. En app som bara växlades till och från
 *  kollade aldrig igen, och även efter en kallstart var uppdateringen bara
 *  "tillgänglig", inte nedladdad, så reloadAsync startade om till samma
 *  bundle. Därav "starta om telefonen tre gånger". */
function NativeAutoUpdate() {
  const downloadedRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    async function checkAndFetch(activatedAt: number) {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (!fetched.isNew) return;
        downloadedRef.current = true;
        if (Date.now() - activatedAt < RELOAD_WINDOW_MS) await Updates.reloadAsync();
      } catch {
        // Offline eller EAS nere — nästa gång appen kommer fram försöker vi igen.
      } finally {
        busyRef.current = false;
      }
    }

    void checkAndFetch(Date.now());
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      if (downloadedRef.current) { void Updates.reloadAsync(); return; }
      void checkAndFetch(Date.now());
    });
    return () => sub.remove();
  }, []);
  return null;
}

export function VersionBanner() {
  if (Platform.OS as any === 'web') return <WebVersionBanner />;
  return <NativeAutoUpdate />;
}

const makeStyles = (c: Palette, ny: NyPalett, insetTop: number) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: ny.skog,
    paddingHorizontal: 14,
    paddingTop: insetTop + 10,
    paddingBottom: 10,
    zIndex: 9999,
  },
  text: { flex: 1, color: ny.rubrikLjus, fontSize: 13, fontWeight: '600' },
  btn: { backgroundColor: ny.lime, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  btnText: { color: ny.skog, fontSize: 13, fontWeight: '700' },
});
