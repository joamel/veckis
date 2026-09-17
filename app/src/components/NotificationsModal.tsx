import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useDesign } from '../context/DesignContext';
import { nyFont, type NyPalett } from '../lib/nyDesign';
import type { Palette } from '../lib/theme';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type NotificationPreferences } from '../api/client';
import { useToast } from '../context/ToastContext';
import { registerForPush } from '../lib/registerPush';
import { components as str } from '../lib/svenska';
import { DraggableBottomSheet } from './DraggableBottomSheet';
import { SHEET_HEADER_ICON } from './SheetHeader';

const TYPES: { key: keyof NotificationPreferences; title: string; desc: string }[] = (
  Object.entries(str.notificationsModal.types) as [keyof NotificationPreferences, { title: string; desc: string }][]
).map(([key, { title, desc }]) => ({ key, title, desc }));

export function NotificationsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors: c, ny } = useTheme();
  const { nyDesign } = useDesign();
  const s = useMemo(() => makeStyles(c, nyDesign, ny), [c, nyDesign, ny]);
  const client = useApiClient();
  const { showToast, showError } = useToast();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [testing, setTesting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<string | null>(null);

  useEffect(() => {
    if (visible) client.getNotificationPreferences().then(setPrefs).catch(() => {});
  }, [visible]);

  async function toggle(key: keyof NotificationPreferences, value: boolean) {
    if (!prefs) return;
    const prev = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      setPrefs(await client.updateNotificationPreferences({ [key]: value }));
    } catch (e) {
      setPrefs(prev);
      showError(e, str.notificationsModal.errorSave);
    }
  }

  async function activateOnDevice() {
    setActivating(true);
    setDeviceStatus(null);
    const res = await registerForPush(client);
    setActivating(false);
    if (res.status === 'ok') setDeviceStatus(str.notificationsModal.deviceStatus.ok);
    else if (res.status === 'denied') setDeviceStatus(str.notificationsModal.deviceStatus.denied);
    else if (res.status === 'unsupported') setDeviceStatus(str.notificationsModal.deviceStatus.unsupported);
    else setDeviceStatus(str.notificationsModal.deviceStatus.error(res.error));
  }

  async function sendTest() {
    setTesting(true);
    try {
      const r = await client.sendTestPush();
      if (r.tokens === 0) {
        showToast(str.notificationsModal.test.noDevice, 'error');
      } else if (r.errors.length > 0) {
        showToast(str.notificationsModal.test.withErrors(r.tokens, r.errors[0]), 'error');
      } else {
        showToast(str.notificationsModal.test.sent(r.tokens), 'success');
      }
    } catch (e) {
      showError(e, str.notificationsModal.test.errorSend);
    } finally {
      setTesting(false);
    }
  }

  return (
    <DraggableBottomSheet visible={visible} onRequestClose={onClose} sheetStyle={s.sheet}
      title={str.notificationsModal.title}
      headerRight={
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={str.notificationsModal.close}>
          <Ionicons name="close" size={24} color={SHEET_HEADER_ICON} />
        </Pressable>
      }
    >
        <ScrollView contentContainerStyle={s.body}>
          {prefs ? (
            <View style={s.card}>
              {TYPES.map(({ key, title, desc }, i) => (
                <View key={key} style={[s.row, i > 0 && s.rowBorder]}>
                  <View style={s.rowText}>
                    <Text style={s.rowTitle}>{title}</Text>
                    <Text style={s.rowDesc}>{desc}</Text>
                  </View>
                  <Switch
                    value={prefs[key] as boolean}
                    onValueChange={v => toggle(key, v)}
                    // Lime spar med morkgron knopp. Morkgront spar lamnade
                    // knoppen till Androids standard — en grav it knopp mot
                    // mork botten, vilket sag trasigt ut.
                    trackColor={{ true: nyDesign ? ny.lime : c.primary, false: nyDesign ? ny.kontur : c.border }}
                    thumbColor={nyDesign ? ny.skog : undefined}
                    accessibilityLabel={title}
                  />
                </View>
              ))}
            </View>
          ) : (
            <ActivityIndicator color={c.primary} style={{ marginTop: 24 }} />
          )}

          <Text style={s.sectionLabel}>{str.notificationsModal.deviceSection}</Text>
          <Pressable style={s.btn} onPress={activateOnDevice} disabled={activating}>
            {activating
              ? <ActivityIndicator color={c.primary} size="small" />
              : <><Ionicons name="phone-portrait-outline" size={18} color={nyDesign ? ny.padYta : c.primary} /><Text style={s.btnText}>{str.notificationsModal.activate}</Text></>}
          </Pressable>
          {__DEV__ && (
            <Pressable style={[s.btn, s.btnTest]} onPress={sendTest} disabled={testing}>
              {testing
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Ionicons name="paper-plane-outline" size={18} color="#fff" /><Text style={[s.btnText, { color: '#fff' }]}>{str.notificationsModal.sendTest}</Text></>}
            </Pressable>
          )}
          {deviceStatus && <Text style={s.statusText}>{deviceStatus}</Text>}
        </ScrollView>
    </DraggableBottomSheet>
  );
}

// nyD: den nya designen (beta) skriver over de stilar som skiljer.
const makeStyles = (c: Palette, nyD: boolean, ny: NyPalett) => StyleSheet.create({
  // Bakgrund, rundning, rubrik och padding kommer från DraggableBottomSheet.
  sheet: { maxHeight: '85%' },
  body: { paddingBottom: 16 },
  card: {
    backgroundColor: c.surfaceSubtle,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: c.border,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    ...(nyD ? { backgroundColor: ny.ljus, borderRadius: 18, borderLeftWidth: 0, shadowOpacity: 0, elevation: 0 } : {}),
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: nyD ? ny.kontur : c.borderLight },
  rowText: { flex: 1 },
  rowTitle: nyD
    ? { fontFamily: nyFont.halvfet, fontWeight: 'normal', fontSize: 15, color: ny.text }
    : { fontSize: 15, fontWeight: '600', color: c.text },
  rowDesc: { fontSize: 13, color: nyD ? ny.textDampad : c.textFaint, marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: nyD ? ny.textDampad : c.textFaint, letterSpacing: 0.8, marginTop: 22, marginBottom: 8, marginLeft: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: nyD ? ny.ljus : c.primaryTint, borderRadius: nyD ? 14 : 12, paddingVertical: 14, marginBottom: 10 },
  btnText: { fontSize: 15, fontWeight: '600', color: nyD ? ny.padYta : c.primary },
  btnTest: { backgroundColor: nyD ? ny.skog : c.primary },
  statusText: { fontSize: 13, color: nyD ? ny.textDampad : c.textMuted, marginTop: 4, marginHorizontal: 4, lineHeight: 19 },
});
