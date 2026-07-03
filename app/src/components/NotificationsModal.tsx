import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type NotificationPreferences } from '../api/client';
import { useToast } from '../context/ToastContext';
import { registerForPush } from '../lib/registerPush';
import { components as str } from '../lib/svenska';

const TYPES: { key: keyof NotificationPreferences; title: string; desc: string }[] = (
  Object.entries(str.notificationsModal.types) as [keyof NotificationPreferences, { title: string; desc: string }][]
).map(([key, { title, desc }]) => ({ key, title, desc }));

export function NotificationsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View pointerEvents="none" style={s.overlayDim} />
      <Pressable style={s.overlay} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title}>{str.notificationsModal.title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={str.notificationsModal.close}>
            <Ionicons name="close" size={24} color="#78716c" />
          </Pressable>
        </View>

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
                    trackColor={{ true: '#4e7a5e', false: '#d6d3d1' }}
                    accessibilityLabel={title}
                  />
                </View>
              ))}
            </View>
          ) : (
            <ActivityIndicator color="#4e7a5e" style={{ marginTop: 24 }} />
          )}

          <Text style={s.sectionLabel}>{str.notificationsModal.deviceSection}</Text>
          <Pressable style={s.btn} onPress={activateOnDevice} disabled={activating}>
            {activating
              ? <ActivityIndicator color="#4e7a5e" size="small" />
              : <><Ionicons name="phone-portrait-outline" size={18} color="#4e7a5e" /><Text style={s.btnText}>{str.notificationsModal.activate}</Text></>}
          </Pressable>
          <Pressable style={[s.btn, s.btnTest]} onPress={sendTest} disabled={testing}>
            {testing
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Ionicons name="paper-plane-outline" size={18} color="#fff" /><Text style={[s.btnText, { color: '#fff' }]}>{str.notificationsModal.sendTest}</Text></>}
          </Pressable>
          {deviceStatus && <Text style={s.statusText}>{deviceStatus}</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlayDim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  overlay: { flex: 1 },
  sheet: { backgroundColor: '#faf8f3', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#d6d3d1', alignSelf: 'center', marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 20, fontWeight: '700', color: '#292524' },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#d6d3d1',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e7e5e4' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#292524' },
  rowDesc: { fontSize: 13, color: '#a8a29e', marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#a8a29e', letterSpacing: 0.8, marginTop: 22, marginBottom: 8, marginLeft: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ecf3ec', borderRadius: 12, paddingVertical: 14, marginBottom: 10 },
  btnText: { fontSize: 15, fontWeight: '600', color: '#4e7a5e' },
  btnTest: { backgroundColor: '#4e7a5e' },
  statusText: { fontSize: 13, color: '#78716c', marginTop: 4, marginHorizontal: 4, lineHeight: 19 },
});
