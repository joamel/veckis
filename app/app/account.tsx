// Kontosida — namn, byt namn, ta bort konto, logga ut. Egen route med
// tillbaka-pil. Avatar-tap på Profil-flikens header öppnar denna vy.
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useApiClient } from '../src/api/client';
import { useHousehold } from '../src/context/HouseholdContext';
import { useToast } from '../src/context/ToastContext';
import { useConfirm } from '../src/context/ConfirmContext';
import { kavBehavior } from '../src/lib/platform';

export default function AccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const client = useApiClient();
  const { householdId, refresh } = useHousehold();
  const household = useHousehold();
  const { showToast, showError } = useToast();
  const confirm = useConfirm();

  // Hitta MIN medlemskap i nuvarande hushåll så vi kan ändra mitt egen namn
  const myMember = household.allMemberships.find(m => m.householdId === householdId);
  const myMemberId = myMember?.id;
  const displayName = myMember?.displayName ?? user?.firstName ?? user?.emailAddresses[0]?.emailAddress.split('@')[0] ?? 'Användare';
  const email = user?.emailAddresses[0]?.emailAddress ?? '';

  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSaveName() {
    if (!householdId || !myMemberId || !renameValue.trim()) return;
    setSaving(true);
    try {
      await client.updateMember(householdId, myMemberId, { displayName: renameValue.trim() });
      await refresh();
      setShowRename(false);
      showToast('Namnet har uppdaterats', 'success');
    } catch (e) {
      showError(e, 'Kunde inte uppdatera namnet');
    } finally {
      setSaving(false);
    }
  }

  async function doDeleteAccount() {
    setDeleting(true);
    try {
      await client.deleteAccount();
      await signOut(); // kontot är borta → logga ut, NavigationGuard tar till sign-in
    } catch (e) {
      setDeleting(false);
      showError(e, 'Kunde inte ta bort kontot');
    }
  }

  function handleDeleteAccount() {
    confirm({
      title: 'Ta bort kontot?',
      message: 'Ditt konto och alla dina hushållsmedlemskap tas bort permanent. Detta kan inte ångras.',
      buttons: [
        { label: 'Ta bort kontot', style: 'destructive', onPress: doDeleteAccount },
        { label: 'Avbryt', style: 'cancel' },
      ],
    });
  }

  function handleSignOut() {
    confirm({
      title: 'Logga ut',
      message: 'Är du säker på att du vill logga ut?',
      buttons: [
        { label: 'Logga ut', style: 'destructive', onPress: () => signOut() },
        { label: 'Avbryt', style: 'cancel' },
      ],
    });
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Tillbaka">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <Text style={s.headerTitle}>Konto</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.avatarCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={s.name}>{displayName}</Text>
          {email ? <Text style={s.email}>{email}</Text> : null}
        </View>

        <Text style={s.sectionLabel}>PROFIL</Text>
        <View style={s.group}>
          <Pressable style={s.row} onPress={() => { setRenameValue(displayName); setShowRename(true); }}>
            <Ionicons name="create-outline" size={18} color="#4f46e5" />
            <Text style={s.rowText}>Byt namn</Text>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </Pressable>
        </View>

        <Text style={s.sectionLabel}>SESSION</Text>
        <View style={s.group}>
          <Pressable style={s.row} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={18} color="#ef4444" />
            <Text style={[s.rowText, { color: '#ef4444' }]}>Logga ut</Text>
            <Ionicons name="chevron-forward" size={16} color="#fca5a5" />
          </Pressable>
          <Pressable style={[s.row, s.rowBorder]} onPress={handleDeleteAccount} disabled={deleting}>
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
            <Text style={[s.rowText, { color: '#ef4444' }]}>Ta bort kontot</Text>
            {deleting ? <ActivityIndicator size="small" color="#ef4444" /> : <Ionicons name="chevron-forward" size={16} color="#fca5a5" />}
          </Pressable>
        </View>
      </ScrollView>

      {/* Byt namn-modal */}
      <Modal visible={showRename} transparent animationType="slide" onRequestClose={() => setShowRename(false)}>
        <Pressable style={s.overlay} onPress={() => setShowRename(false)} />
        <KeyboardAvoidingView behavior={kavBehavior} style={s.kavWrap}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Byt namn</Text>
            <TextInput
              style={s.input}
              placeholder="Namn"
              placeholderTextColor="#9ca3af"
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <Pressable
              style={[s.primaryBtn, (saving || !renameValue.trim()) && { opacity: 0.4 }]}
              onPress={handleSaveName}
              disabled={saving || !renameValue.trim()}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Spara</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  scroll: { padding: 16, paddingBottom: 40 },
  avatarCard: { alignItems: 'center', paddingVertical: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },
  name: { fontSize: 20, fontWeight: '700', color: '#111827' },
  email: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8, marginTop: 12, marginBottom: 8, paddingHorizontal: 4 },
  group: { backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#cbd5e1', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rowText: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)' },
  kavWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 14 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 16, backgroundColor: '#f9fafb' },
  primaryBtn: { backgroundColor: '#4f46e5', borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
