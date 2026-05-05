import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import type { InviteCode, HouseholdWithMembers } from '@veckis/shared';

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { user, isSignedIn } = useUser();
  const client = useApiClient();
  const { householdId, householdName, memberRole, allMemberships, setActiveHouseholdId, refresh } = useHousehold();
  const [invite, setInvite] = useState<InviteCode | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);

  // Household editing
  const [showEditHouseholdModal, setShowEditHouseholdModal] = useState(false);
  const [editingHouseholdName, setEditingHouseholdName] = useState(householdName || '');
  const [loadingHouseholdEdit, setLoadingHouseholdEdit] = useState(false);


  // Edit member
  const [showEditMemberModal, setShowEditMemberModal] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState('');
  const [loadingMemberEdit, setLoadingMemberEdit] = useState(false);

  // Create local profile
  const [showCreateLocalModal, setShowCreateLocalModal] = useState(false);
  const [localProfileName, setLocalProfileName] = useState('');
  const [loadingLocalProfile, setLoadingLocalProfile] = useState(false);

  // Create household
  const [showCreateHouseholdModal, setShowCreateHouseholdModal] = useState(false);
  const [newHouseholdName, setNewHouseholdName] = useState('');
  const [loadingCreateHousehold, setLoadingCreateHousehold] = useState(false);

  // Join household
  const [showJoinHouseholdModal, setShowJoinHouseholdModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [loadingJoinHousehold, setLoadingJoinHousehold] = useState(false);

  // Fetch household with members
  const [household, setHousehold] = useState<HouseholdWithMembers | null>(null);
  const [loadingHousehold, setLoadingHousehold] = useState(false);

  useEffect(() => {
    if (householdId) {
      setLoadingHousehold(true);
      client.getHousehold(householdId)
        .then(setHousehold)
        .catch(() => setHousehold(null))
        .finally(() => setLoadingHousehold(false));
    }
  }, [householdId]);

  const displayName = user?.fullName ?? user?.emailAddresses[0]?.emailAddress ?? 'Användare';
  const email = user?.emailAddresses[0]?.emailAddress;
  const clerkUserId = user?.id;
  const isAdmin = memberRole === 'admin';
  const householdMembers = household?.members ?? [];

  // Invite code
  async function generateInvite() {
    if (!householdId) return;
    setLoadingInvite(true);
    try {
      const code = await client.createInvite(householdId);
      setInvite(code);
    } catch {
      Alert.alert('Fel', 'Kunde inte skapa inbjudningskod');
    } finally {
      setLoadingInvite(false);
    }
  }

  function copyCode() {
    if (!invite) return;
    Clipboard.setString(invite.code);
    Alert.alert('Kopierat!', `Koden ${invite.code} är kopierad till urklipp`);
  }

  // Household editing
  async function handleSaveHouseholdName() {
    if (!householdId || !editingHouseholdName.trim()) return;
    setLoadingHouseholdEdit(true);
    try {
      const updated = await client.updateHousehold(householdId, editingHouseholdName);
      await refresh();
      setHousehold(h => h ? { ...h, name: updated.name } : null);
      setShowEditHouseholdModal(false);
      Alert.alert('Sparad', 'Hushållets namn har uppdaterats');
    } catch (err) {
      Alert.alert('Fel', 'Kunde inte uppdatera hushållets namn');
    } finally {
      setLoadingHouseholdEdit(false);
    }
  }

  // Member editing
  function openEditMember(memberId: string, currentName: string) {
    setEditingMemberId(memberId);
    setEditingDisplayName(currentName);
    setShowEditMemberModal(true);
  }

  async function handleSaveMemberName() {
    if (!householdId || !editingMemberId || !editingDisplayName.trim()) return;
    setLoadingMemberEdit(true);
    try {
      await client.updateMember(householdId, editingMemberId, { displayName: editingDisplayName });
      setHousehold(h => h ? {
        ...h,
        members: h.members.map(m => m.id === editingMemberId ? { ...m, displayName: editingDisplayName } : m)
      } : null);
      setShowEditMemberModal(false);
      Alert.alert('Sparad', 'Smeknamnet har uppdaterats');
    } catch (err) {
      Alert.alert('Fel', 'Kunde inte uppdatera smeknamnet');
    } finally {
      setLoadingMemberEdit(false);
    }
  }

  // Remove member
  async function handleRemoveMember(memberId: string, memberName: string) {
    if (!householdId) return;
    Alert.alert('Ta bort medlem', `Är du säker på att du vill ta bort ${memberName}?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.removeMember(householdId, memberId);
            setHousehold(h => h ? { ...h, members: h.members.filter(m => m.id !== memberId) } : null);
            Alert.alert('Borttagen', `${memberName} har tagits bort från hushållet`);
          } catch {
            Alert.alert('Fel', 'Kunde inte ta bort medlem');
          }
        },
      },
    ]);
  }

  // Create local profile
  async function handleCreateLocalProfile() {
    if (!householdId || !localProfileName.trim()) return;
    setLoadingLocalProfile(true);
    try {
      const newMember = await client.createLocalMember(householdId, localProfileName);
      setHousehold(h => h ? { ...h, members: [...h.members, newMember] } : null);
      setShowCreateLocalModal(false);
      setLocalProfileName('');
      Alert.alert('Skapad', `${localProfileName} har lagts till som lokal profil`);
    } catch (err) {
      Alert.alert('Fel', 'Kunde inte skapa lokal profil');
    } finally {
      setLoadingLocalProfile(false);
    }
  }

  // Create household
  async function handleCreateHousehold() {
    if (!newHouseholdName.trim()) return;
    setLoadingCreateHousehold(true);
    try {
      const household = await client.createHousehold(newHouseholdName);
      await refresh();
      await setActiveHouseholdId(household.id);
      setShowCreateHouseholdModal(false);
      setNewHouseholdName('');
      Alert.alert('Skapat', `Hushållet "${newHouseholdName}" har skapats`);
    } catch (err) {
      Alert.alert('Fel', 'Kunde inte skapa hushål');
    } finally {
      setLoadingCreateHousehold(false);
    }
  }

  // Join household
  async function handleJoinHousehold() {
    if (!joinCode.trim()) return;
    setLoadingJoinHousehold(true);
    try {
      await client.joinHousehold(joinCode);
      await refresh();
      setShowJoinHouseholdModal(false);
      setJoinCode('');
      Alert.alert('Ansluten', 'Du har anslutit till hushållet');
    } catch (err) {
      Alert.alert('Fel', 'Kunde inte ansluta till hushål. Kontrollera koden.');
    } finally {
      setLoadingJoinHousehold(false);
    }
  }

  // Switch household
  async function handleSwitchHousehold(householdId: string) {
    await setActiveHouseholdId(householdId);
    setInvite(null);
  }

  function handleSignOut() {
    Alert.alert('Logga ut', 'Är du säker på att du vill logga ut?', [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'Logga ut', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  const expiresAt = invite ? new Date(invite.expiresAt) : null;
  const expiresStr = expiresAt
    ? expiresAt.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>Inställningar</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>KONTO</Text>
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{displayName}</Text>
              {email && <Text style={styles.userEmail}>{email}</Text>}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>HUSHÅLLET</Text>
            {isAdmin && (
              <Pressable onPress={() => {
                setEditingHouseholdName(householdName || '');
                setShowEditHouseholdModal(true);
              }}>
                <Ionicons name="pencil-outline" size={16} color="#4f46e5" />
              </Pressable>
            )}
          </View>
          <View style={styles.card}>
            <View style={styles.householdIcon}>
              <Ionicons name="home-outline" size={20} color="#4f46e5" />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{householdName ?? 'Okänt hushåll'}</Text>
              <Text style={styles.userEmail}>Aktiv</Text>
            </View>
          </View>

          {householdMembers.length > 0 && (
            <View style={styles.membersBox}>
              <Text style={styles.membersTitle}>Medlemmar</Text>
              {householdMembers.map(member => (
                <View key={member.id} style={styles.memberRow}>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.displayName}</Text>
                    {member.clerkUserId ? (
                      <Text style={styles.memberEmail}>Konto-medlem</Text>
                    ) : (
                      <Text style={styles.memberEmail}>Lokal profil</Text>
                    )}
                  </View>
                  <View style={styles.memberActions}>
                    {(isAdmin || member.clerkUserId === clerkUserId) && (
                      <Pressable
                        onPress={() => openEditMember(member.id, member.displayName)}
                        style={styles.memberActionBtn}
                      >
                        <Ionicons name="pencil-outline" size={16} color="#4f46e5" />
                      </Pressable>
                    )}
                    {isAdmin && member.clerkUserId !== clerkUserId && (
                      <Pressable
                        onPress={() => handleRemoveMember(member.id, member.displayName)}
                        style={styles.memberActionBtn}
                      >
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {isAdmin && (
            <Pressable style={styles.addLocalBtn} onPress={() => setShowCreateLocalModal(true)}>
              <Ionicons name="add-circle-outline" size={18} color="#4f46e5" />
              <Text style={styles.addLocalBtnText}>Lägg till lokal profil</Text>
            </Pressable>
          )}
        </View>

        {allMemberships.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>MINA HUSHÅL</Text>
            {allMemberships.map(membership => (
              <Pressable
                key={membership.householdId}
                style={[styles.householdOption, membership.householdId === householdId && styles.householdOptionActive]}
                onPress={() => handleSwitchHousehold(membership.householdId)}
              >
                <Text style={styles.householdOptionName}>{membership.household.name}</Text>
                {membership.householdId === householdId && (
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                )}
              </Pressable>
            ))}
            <Pressable style={styles.actionBtn} onPress={() => setShowCreateHouseholdModal(true)}>
              <Ionicons name="add-outline" size={18} color="#4f46e5" />
              <Text style={styles.actionBtnText}>Skapa nytt hushål</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => setShowJoinHouseholdModal(true)}>
              <Ionicons name="log-in-outline" size={18} color="#4f46e5" />
              <Text style={styles.actionBtnText}>Gå med i hushål</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BJUD IN NÅGON</Text>
          <View style={styles.inviteBox}>
            <Text style={styles.inviteDesc}>
              Generera en engångskod som en annan person kan använda för att gå med i hushållet.
            </Text>
            {invite ? (
              <View style={styles.codeRow}>
                <Text style={styles.codeText}>{invite.code}</Text>
                <Pressable style={styles.copyBtn} onPress={copyCode}>
                  <Ionicons name="copy-outline" size={18} color="#4f46e5" />
                </Pressable>
              </View>
            ) : null}
            {expiresStr && (
              <Text style={styles.expiresText}>Går ut: {expiresStr}</Text>
            )}
            <Pressable
              style={[styles.inviteBtn, loadingInvite && styles.inviteBtnDisabled]}
              onPress={generateInvite}
              disabled={loadingInvite}
            >
              {loadingInvite
                ? <ActivityIndicator color="#4f46e5" size="small" />
                : <Text style={styles.inviteBtnText}>{invite ? 'Ny kod' : 'Skapa inbjudningskod'}</Text>}
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
            <Text style={styles.signOutText}>Logga ut</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Edit Household Name Modal */}
      <Modal visible={showEditHouseholdModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowEditHouseholdModal(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Redigera hushållets namn</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <TextInput
              style={styles.input}
              placeholder="Hushållets namn"
              value={editingHouseholdName}
              onChangeText={setEditingHouseholdName}
              placeholderTextColor="#9ca3af"
            />
            <Pressable
              style={[styles.button, loadingHouseholdEdit && styles.buttonDisabled]}
              onPress={handleSaveHouseholdName}
              disabled={loadingHouseholdEdit}
            >
              {loadingHouseholdEdit ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Spara</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Member Modal */}
      <Modal visible={showEditMemberModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowEditMemberModal(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Redigera smeknamn</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <TextInput
              style={styles.input}
              placeholder="Smeknamn"
              value={editingDisplayName}
              onChangeText={setEditingDisplayName}
              placeholderTextColor="#9ca3af"
            />
            <Pressable
              style={[styles.button, loadingMemberEdit && styles.buttonDisabled]}
              onPress={handleSaveMemberName}
              disabled={loadingMemberEdit}
            >
              {loadingMemberEdit ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Spara</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Create Local Profile Modal */}
      <Modal visible={showCreateLocalModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowCreateLocalModal(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Lägg till lokal profil</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <Text style={styles.sheetDesc}>Skapa en lokal profil för ett familjemedlem utan konto.</Text>
            <TextInput
              style={styles.input}
              placeholder="Namn"
              value={localProfileName}
              onChangeText={setLocalProfileName}
              placeholderTextColor="#9ca3af"
            />
            <Pressable
              style={[styles.button, loadingLocalProfile && styles.buttonDisabled]}
              onPress={handleCreateLocalProfile}
              disabled={loadingLocalProfile}
            >
              {loadingLocalProfile ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Skapa profil</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Create Household Modal */}
      <Modal visible={showCreateHouseholdModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowCreateHouseholdModal(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Skapa nytt hushål</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <TextInput
              style={styles.input}
              placeholder="Hushållets namn"
              value={newHouseholdName}
              onChangeText={setNewHouseholdName}
              placeholderTextColor="#9ca3af"
            />
            <Pressable
              style={[styles.button, loadingCreateHousehold && styles.buttonDisabled]}
              onPress={handleCreateHousehold}
              disabled={loadingCreateHousehold}
            >
              {loadingCreateHousehold ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Skapa</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Join Household Modal */}
      <Modal visible={showJoinHouseholdModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowJoinHouseholdModal(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Gå med i hushål</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <Text style={styles.sheetDesc}>Ange inbjudningskoden du fick från husägaren.</Text>
            <TextInput
              style={styles.input}
              placeholder="Inbjudningskod"
              value={joinCode}
              onChangeText={setJoinCode}
              placeholderTextColor="#9ca3af"
              maxLength={8}
            />
            <Pressable
              style={[styles.button, loadingJoinHousehold && styles.buttonDisabled]}
              onPress={handleJoinHousehold}
              disabled={loadingJoinHousehold}
            >
              {loadingJoinHousehold ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Gå med</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  scroll: { paddingBottom: 40 },
  header: {
    padding: 20,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  householdIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  userEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  membersBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  membersTitle: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 4 },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '500', color: '#111827' },
  memberEmail: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 8 },
  memberActionBtn: { padding: 6 },
  addLocalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addLocalBtnText: { fontSize: 14, fontWeight: '500', color: '#4f46e5' },
  householdOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  householdOptionActive: { borderColor: '#10b981', backgroundColor: '#f0fdf4' },
  householdOptionName: { fontSize: 14, fontWeight: '500', color: '#111827' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  actionBtnText: { fontSize: 14, fontWeight: '500', color: '#4f46e5' },
  inviteBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  inviteDesc: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingVertical: 14,
  },
  codeText: { fontSize: 28, fontWeight: '700', color: '#111827', letterSpacing: 6 },
  copyBtn: { padding: 4 },
  expiresText: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
  inviteBtn: {
    borderWidth: 1.5,
    borderColor: '#4f46e5',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  inviteBtnDisabled: { opacity: 0.4 },
  inviteBtnText: { fontSize: 15, fontWeight: '600', color: '#4f46e5' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  signOutText: { fontSize: 16, fontWeight: '600', color: '#ef4444' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flex: 1 },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
    minHeight: 300,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    marginTop: 12,
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#111827', paddingHorizontal: 20, marginBottom: 8 },
  sheetDesc: { fontSize: 14, color: '#6b7280', paddingHorizontal: 20, marginBottom: 16, lineHeight: 20 },
  sheetScroll: { paddingHorizontal: 20, gap: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#f9fafb',
    color: '#111827',
  },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
