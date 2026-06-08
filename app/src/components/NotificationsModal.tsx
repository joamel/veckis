import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient, type NotificationPreferences } from '../api/client';
import { useToast } from '../context/ToastContext';
import { registerForPush } from '../lib/registerPush';

const TYPES: { key: keyof NotificationPreferences; title: string; desc: string }[] = [
  { key: 'activityReminder', title: 'Påminnelse innan aktivitet', desc: 'Innan en aktivitet startar' },
  { key: 'choreOverdue', title: 'Förfallen syssla', desc: 'När en syssla inte hunnit bli klar' },
  { key: 'listCleared', title: 'Inköpslista rensad', desc: 'När någon rensar en aktiv lista' },
  { key: 'newMember', title: 'Ny medlem', desc: 'När någon går med i hushållet' },
];

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
      showError(e, 'Kunde inte spara notisinställningen');
    }
  }

  async function activateOnDevice() {
    setActivating(true);
    setDeviceStatus(null);
    const res = await registerForPush(client);
    setActivating(false);
    if (res.status === 'ok') setDeviceStatus('Den här enheten är registrerad för notiser.');
    else if (res.status === 'denied') setDeviceStatus('Notiser är avstängda i telefonens inställningar — slå på dem för Veckis där.');
    else if (res.status === 'unsupported') setDeviceStatus('Push kräver en fysisk enhet (funkar inte i emulator).');
    else setDeviceStatus(`Kunde inte registrera: ${res.error}`);
  }

  async function sendTest() {
    setTesting(true);
    try {
      const r = await client.sendTestPush();
      if (r.tokens === 0) {
        showToast('Ingen enhet registrerad — tryck "Aktivera på den här enheten" först', 'error');
      } else if (r.errors.length > 0) {
        showToast(`Skickat till ${r.tokens} enhet(er), men fel: ${r.errors[0]}`, 'error');
      } else {
        showToast(`Testnotis skickad till ${r.tokens} enhet(er)`, 'success');
      }
    } catch (e) {
      showError(e, 'Kunde inte skicka testnotis');
    } finally {
      setTesting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={s.header}>
          <Text style={s.title}>Notiser</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Stäng">
            <Ionicons name="close" size={24} color="#6b7280" />
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
                    trackColor={{ true: '#4f46e5', false: '#d1d5db' }}
                    accessibilityLabel={title}
                  />
                </View>
              ))}
            </View>
          ) : (
            <ActivityIndicator color="#4f46e5" style={{ marginTop: 24 }} />
          )}

          <Text style={s.sectionLabel}>DEN HÄR ENHETEN</Text>
          <Pressable style={s.btn} onPress={activateOnDevice} disabled={activating}>
            {activating
              ? <ActivityIndicator color="#4f46e5" size="small" />
              : <><Ionicons name="phone-portrait-outline" size={18} color="#4f46e5" /><Text style={s.btnText}>Aktivera på den här enheten</Text></>}
          </Pressable>
          <Pressable style={[s.btn, s.btnTest]} onPress={sendTest} disabled={testing}>
            {testing
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Ionicons name="paper-plane-outline" size={18} color="#fff" /><Text style={[s.btnText, { color: '#fff' }]}>Skicka testnotis</Text></>}
          </Pressable>
          {deviceStatus && <Text style={s.statusText}>{deviceStatus}</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#f3f4f6', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', alignSelf: 'center', marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rowDesc: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8, marginTop: 22, marginBottom: 8, marginLeft: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, marginBottom: 10 },
  btnText: { fontSize: 15, fontWeight: '600', color: '#4f46e5' },
  btnTest: { backgroundColor: '#4f46e5' },
  statusText: { fontSize: 13, color: '#6b7280', marginTop: 4, marginHorizontal: 4, lineHeight: 19 },
});
