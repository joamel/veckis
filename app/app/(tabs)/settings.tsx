import { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Clipboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useHouseholdSocket } from '../../src/hooks/useHouseholdSocket';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { NotificationsModal } from '../../src/components/NotificationsModal';
import type { InviteCode } from '@veckis/shared';
import type { HouseholdWithMembers } from '../../src/api/client';

export default function SettingsScreen() {
  const { signOut, getToken } = useAuth();
  const { user, isSignedIn } = useUser();
  const client = useApiClient();
  const { householdId, householdName, memberRole, allMemberships, setActiveHouseholdId, refresh } = useHousehold();
  const { showToast: showGlobalToast, showError } = useToast();
  const [invite, setInvite] = useState<InviteCode | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);

  // Admin edit mode
  const [editMode, setEditMode] = useState(false);
  const editModeRef = useRef(false);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  useFocusEffect(useCallback(() => {
    return () => {
      // Read the latest value from a ref instead of calling the toast inside a
      // setState updater (that fires during render → "Cannot update a component
      // while rendering a different component").
      if (editModeRef.current) showGlobalToast('Redigeringsläget avslutat', 'neutral');
      setEditMode(false);
    };
  }, [showGlobalToast]));

  // Household editing
  const [showEditHouseholdModal, setShowEditHouseholdModal] = useState(false);
  const [editingHouseholdName, setEditingHouseholdName] = useState(householdName || '');
  const [loadingHouseholdEdit, setLoadingHouseholdEdit] = useState(false);

  // Delete household confirmation
  const [showDeleteHouseholdModal, setShowDeleteHouseholdModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [loadingDeleteHousehold, setLoadingDeleteHousehold] = useState(false);

  // Edit member
  const [showEditMemberModal, setShowEditMemberModal] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState('');
  const [loadingMemberEdit, setLoadingMemberEdit] = useState(false);

  useHouseholdSocket(householdId, getToken, (msg) => {
    if (msg.type === 'household_updated') {
      setHousehold(h => h && h.id === msg.data.id ? { ...h, name: msg.data.name } : h);
    } else if (msg.type === 'member_added') {
      setHousehold(h => h && h.id === msg.data.householdId
        ? { ...h, members: h.members.some(m => m.id === msg.data.id) ? h.members : [...h.members, msg.data as never] }
        : h);
    } else if (msg.type === 'member_updated') {
      setHousehold(h => h && h.id === msg.data.householdId
        ? { ...h, members: h.members.map(m => m.id === msg.data.id ? { ...m, ...msg.data } as never : m) }
        : h);
    } else if (msg.type === 'member_deleted') {
      setHousehold(h => h ? { ...h, members: h.members.filter(m => m.id !== msg.data.id) } : h);
    }
  });

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

  // Toast
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState<'success' | 'neutral'>('success');

  function showToast(msg: string, variant: 'success' | 'neutral' = 'success') {
    setToastMessage(msg);
    setToastVariant(variant);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }

  useEffect(() => {
    if (householdId) {
      setLoadingHousehold(true);
      client.getHousehold(householdId)
        .then(setHousehold)
        .catch(() => setHousehold(null))
        .finally(() => setLoadingHousehold(false));
    }
  }, [householdId]);

  // Notifications — managed in a dedicated modal
  const [showNotifModal, setShowNotifModal] = useState(false);

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
    } catch (e) {
      showError(e, 'Kunde inte skapa inbjudningskod');
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
      showToast('Hushållets namn uppdaterat');
    } catch (e) {
      showError(e, 'Kunde inte uppdatera hushållets namn');
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
      showToast('Smeknamnet har uppdaterats');
    } catch (e) {
      showError(e, 'Kunde inte uppdatera smeknamnet');
    } finally {
      setLoadingMemberEdit(false);
    }
  }

  // Remove member
  async function handleToggleAdmin(memberId: string, memberName: string, currentRole: 'admin' | 'member') {
    if (!householdId) return;
    const promote = currentRole !== 'admin';
    Alert.alert(
      promote ? 'Gör till admin' : 'Ta bort admin-rättigheter',
      promote
        ? `Vill du ge ${memberName} admin-rättigheter? Admins kan redigera hushållet och hantera medlemmar.`
        : `Vill du ta bort admin-rättigheterna från ${memberName}?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: promote ? 'Gör till admin' : 'Ta bort',
          style: promote ? 'default' : 'destructive',
          onPress: async () => {
            try {
              const updated = await client.updateMember(householdId, memberId, { role: promote ? 'admin' : 'member' });
              setHousehold(h => h ? { ...h, members: h.members.map(m => m.id === memberId ? { ...m, role: updated.role } : m) } : null);
              showToast(promote ? `${memberName} är nu admin` : `${memberName} är inte längre admin`);
            } catch (e) {
              showError(e, 'Kunde inte ändra roll');
            }
          },
        },
      ],
    );
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    if (!householdId) return;

    // Surface what the member is responsible for so they aren't silently orphaned.
    let warning = '';
    try {
      const { chores, activities } = await client.getMemberAssignments(householdId, memberId);
      const parts: string[] = [];
      if (chores > 0) parts.push(`${chores} ${chores === 1 ? 'syssla' : 'sysslor'}`);
      if (activities > 0) parts.push(`${activities} ${activities === 1 ? 'aktivitet' : 'aktiviteter'}`);
      if (parts.length > 0) {
        warning = `\n\n${memberName} har ${parts.join(' och ')} tilldelade. De blir utan ansvarig om du tar bort ${memberName}.`;
      }
    } catch {
      // Non-fatal — fall back to a plain confirmation.
    }

    Alert.alert('Ta bort medlem', `Är du säker på att du vill ta bort ${memberName}?${warning}`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Ta bort ändå',
        style: 'destructive',
        onPress: async () => {
          try {
            await client.removeMember(householdId, memberId);
            setHousehold(h => h ? { ...h, members: h.members.filter(m => m.id !== memberId) } : null);
            showToast(`${memberName} borttagen`);
          } catch (e) {
            showError(e, 'Kunde inte ta bort medlem');
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
      showToast(`${localProfileName} tillagd som lokal profil`);
    } catch (e) {
      showError(e, 'Kunde inte skapa lokal profil');
    } finally {
      setLoadingLocalProfile(false);
    }
  }

  // Delete household
  async function handleDeleteHousehold() {
    if (!householdId || !isAdmin) return;
    setLoadingDeleteHousehold(true);
    try {
      await client.deleteHousehold(householdId);
      await refresh();
      setShowDeleteHouseholdModal(false);
      setDeleteConfirmText('');
      showToast('Hushållet borttaget');
    } catch (e) {
      showError(e, 'Kunde inte ta bort hushållet');
    } finally {
      setLoadingDeleteHousehold(false);
    }
  }

  // Create household
  async function handleCreateHousehold() {
    if (!newHouseholdName.trim()) return;
    setLoadingCreateHousehold(true);
    try {
      const created = await client.createHousehold(newHouseholdName, displayName);
      await refresh();
      await setActiveHouseholdId(created.id);
      setShowCreateHouseholdModal(false);
      setNewHouseholdName('');
      showToast(`"${newHouseholdName}" skapat`);
    } catch (e) {
      showError(e, 'Kunde inte skapa hushållet');
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
      showToast('Ansluten till hushållet');
    } catch (err: any) {
      if (err?.message?.toLowerCase().includes('already')) {
        Alert.alert('Redan med', 'Du är redan medlem i det hushållet.');
      } else {
        showError(err, 'Kunde inte ansluta till hushållet. Kontrollera koden.');
      }
    } finally {
      setLoadingJoinHousehold(false);
    }
  }

  // Switch household
  async function handleSwitchHousehold(id: string) {
    if (id === householdId) return;
    const targetName = allMemberships.find(m => m.householdId === id)?.household.name ?? 'hushållet';
    Alert.alert(
      'Byt hushåll',
      `Vill du byta till "${targetName}"?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Byt',
          onPress: async () => {
            await setActiveHouseholdId(id);
            setInvite(null);
          },
        },
      ]
    );
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
      <ScreenHeader title="Inställningar" />
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Konto */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>KONTO</Text>
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.userInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.userName}>{displayName}</Text>
                {isAdmin && (
                  <View style={styles.adminBadge}>
                    <Ionicons name="shield-checkmark" size={11} color="#4f46e5" />
                    <Text style={styles.adminBadgeText}>Admin</Text>
                  </View>
                )}
              </View>
              {email && <Text style={styles.userEmail}>{email}</Text>}
            </View>
          </View>
        </View>

        {/* Hushållet */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>HUSHÅLLET</Text>
            <Pressable onPress={() => setEditMode(v => !v)} hitSlop={8}>
              <Text style={[styles.editModeBtn, editMode && styles.editModeBtnActive]}>
                {editMode ? 'Klar' : 'Redigera'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            <View style={styles.householdIcon}>
              <Ionicons name="home-outline" size={20} color="#4f46e5" />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{householdName ?? 'Okänt hushåll'}</Text>
              <Text style={styles.userEmail}>Aktivt hushåll</Text>
            </View>
            {editMode && isAdmin && (
              <View style={styles.cardActions}>
                <Pressable
                  style={styles.memberActionBtn}
                  onPress={() => { setEditingHouseholdName(householdName || ''); setShowEditHouseholdModal(true); }}
                >
                  <Ionicons name="pencil-outline" size={16} color="#4f46e5" />
                </Pressable>
                <Pressable
                  style={styles.memberActionBtn}
                  onPress={() => { setDeleteConfirmText(''); setShowDeleteHouseholdModal(true); }}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.membersBox}>
            <View style={styles.membersHeader}>
              <Text style={styles.membersTitle}>Medlemmar</Text>
              {editMode && isAdmin && (
                <Pressable style={styles.addMemberBtn} onPress={() => setShowCreateLocalModal(true)}>
                  <Ionicons name="add-circle-outline" size={15} color="#4f46e5" />
                  <Text style={styles.addMemberBtnText}>Lokal profil</Text>
                </Pressable>
              )}
            </View>
            {loadingHousehold && <ActivityIndicator size="small" color="#4f46e5" style={{ marginVertical: 8 }} />}
            {householdMembers.map((member, idx) => (
              <View
                key={member.id}
                style={[styles.memberRow, idx === householdMembers.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.displayName}</Text>
                  <Text style={styles.memberEmail}>
                    {member.clerkUserId ? (member.role === 'admin' ? 'Admin' : 'Konto-medlem') : 'Lokal profil'}
                  </Text>
                </View>
                <View style={styles.memberActions}>
                  {editMode && (member.clerkUserId === clerkUserId || isAdmin) && (
                    <Pressable
                      onPress={() => openEditMember(member.id, member.displayName)}
                      style={styles.memberActionBtn}
                    >
                      <Ionicons name="pencil-outline" size={16} color="#4f46e5" />
                    </Pressable>
                  )}
                  {editMode && isAdmin && member.clerkUserId && member.clerkUserId !== clerkUserId && (
                    <Pressable
                      onPress={() => handleToggleAdmin(member.id, member.displayName, member.role)}
                      style={styles.memberActionBtn}
                    >
                      <Ionicons
                        name={member.role === 'admin' ? 'shield-checkmark' : 'shield-outline'}
                        size={16}
                        color={member.role === 'admin' ? '#7c3aed' : '#6b7280'}
                      />
                    </Pressable>
                  )}
                  {editMode && isAdmin && member.clerkUserId !== clerkUserId && (
                    <Pressable
                      onPress={() => handleRemoveMember(member.id, member.displayName)}
                      style={styles.memberActionBtn}
                    >
                      <Ionicons name="person-remove-outline" size={16} color="#ef4444" />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Bjud in */}
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
            {expiresStr && <Text style={styles.expiresText}>Går ut: {expiresStr}</Text>}
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

        {/* Notiser */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NOTISER</Text>
          <Pressable style={styles.notifRowBtn} onPress={() => setShowNotifModal(true)}>
            <Ionicons name="notifications-outline" size={20} color="#4f46e5" />
            <View style={styles.notifTextWrap}>
              <Text style={styles.notifTitle}>Notisinställningar</Text>
              <Text style={styles.notifDesc}>Välj vilka notiser du vill få och testa på enheten</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
          </Pressable>
        </View>

        {/* Mina hushåll */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MINA HUSHÅLL</Text>
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
            <Text style={styles.actionBtnText}>Skapa nytt hushåll</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => setShowJoinHouseholdModal(true)}>
            <Ionicons name="log-in-outline" size={18} color="#4f46e5" />
            <Text style={styles.actionBtnText}>Gå med i hushåll</Text>
          </Pressable>
        </View>

        {/* Logga ut */}
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Byt namn på hushållet</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <TextInput
              style={styles.input}
              placeholder="Hushållets namn"
              value={editingHouseholdName}
              onChangeText={setEditingHouseholdName}
              placeholderTextColor="#9ca3af"
              returnKeyType="done"
              onSubmitEditing={handleSaveHouseholdName}
            />
            <Pressable
              style={[styles.button, loadingHouseholdEdit && styles.buttonDisabled]}
              onPress={handleSaveHouseholdName}
              disabled={loadingHouseholdEdit}
            >
              {loadingHouseholdEdit
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.buttonText}>Spara</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Household Confirmation Modal */}
      <Modal visible={showDeleteHouseholdModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowDeleteHouseholdModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Ta bort hushållet</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetDesc}>
              All data i "{householdName}" (sysslor, meny, inköpslistor) raderas permanent och kan inte återställas.{'\n\n'}
              Skriv <Text style={{ fontWeight: '700', color: '#ef4444' }}>DELETE</Text> för att bekräfta.
            </Text>
            <TextInput
              style={[styles.input, styles.deleteInput]}
              placeholder="DELETE"
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              returnKeyType="done"
            />
            <Pressable
              style={[styles.deleteBtn, (deleteConfirmText !== 'DELETE' || loadingDeleteHousehold) && styles.buttonDisabled]}
              onPress={handleDeleteHousehold}
              disabled={deleteConfirmText !== 'DELETE' || loadingDeleteHousehold}
            >
              {loadingDeleteHousehold
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.deleteBtnText}>Ta bort hushållet</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Member Modal */}
      <Modal visible={showEditMemberModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowEditMemberModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }} pointerEvents="box-none">
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
              returnKeyType="done"
              onSubmitEditing={handleSaveMemberName}
            />
            <Pressable
              style={[styles.button, loadingMemberEdit && styles.buttonDisabled]}
              onPress={handleSaveMemberName}
              disabled={loadingMemberEdit}
            >
              {loadingMemberEdit
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.buttonText}>Spara</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create Local Profile Modal */}
      <Modal visible={showCreateLocalModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowCreateLocalModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Lägg till lokal profil</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetDesc}>Skapa en lokal profil för ett familjemedlem utan konto.</Text>
            <TextInput
              style={styles.input}
              placeholder="Namn"
              value={localProfileName}
              onChangeText={setLocalProfileName}
              placeholderTextColor="#9ca3af"
              returnKeyType="done"
              onSubmitEditing={handleCreateLocalProfile}
            />
            <Pressable
              style={[styles.button, loadingLocalProfile && styles.buttonDisabled]}
              onPress={handleCreateLocalProfile}
              disabled={loadingLocalProfile}
            >
              {loadingLocalProfile
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.buttonText}>Skapa profil</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create Household Modal */}
      <Modal visible={showCreateHouseholdModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowCreateHouseholdModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Skapa nytt hushåll</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.input}
              placeholder="Hushållets namn"
              value={newHouseholdName}
              onChangeText={setNewHouseholdName}
              placeholderTextColor="#9ca3af"
              returnKeyType="done"
              onSubmitEditing={handleCreateHousehold}
            />
            <Pressable
              style={[styles.button, loadingCreateHousehold && styles.buttonDisabled]}
              onPress={handleCreateHousehold}
              disabled={loadingCreateHousehold}
            >
              {loadingCreateHousehold
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.buttonText}>Skapa</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Join Household Modal */}
      <Modal visible={showJoinHouseholdModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowJoinHouseholdModal(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Gå med i hushåll</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <Text style={styles.sheetDesc}>Ange inbjudningskoden du fick från husägaren.</Text>
            <TextInput
              style={styles.input}
              placeholder="Inbjudningskod"
              value={joinCode}
              onChangeText={setJoinCode}
              placeholderTextColor="#9ca3af"
              maxLength={8}
              returnKeyType="done"
              onSubmitEditing={handleJoinHousehold}
            />
            <Pressable
              style={[styles.button, loadingJoinHousehold && styles.buttonDisabled]}
              onPress={handleJoinHousehold}
              disabled={loadingJoinHousehold}
            >
              {loadingJoinHousehold
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.buttonText}>Gå med</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      <NotificationsModal visible={showNotifModal} onClose={() => setShowNotifModal(false)} />

      <Animated.View style={[styles.toast, toastVariant === 'neutral' && styles.toastNeutral, { opacity: toastOpacity }]} pointerEvents="none">
        <Text style={styles.toastText}>{toastMessage}</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  scroll: { paddingBottom: 40 },
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8, marginBottom: 8 },
  editModeBtn: { fontSize: 13, fontWeight: '600', color: '#4f46e5' },
  editModeBtnActive: { color: '#ef4444' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#cbd5e1',
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  cardActions: { flexDirection: 'row', gap: 4 },
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  userEmail: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#eef2ff', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  adminBadgeText: { fontSize: 11, fontWeight: '600', color: '#4f46e5' },
  membersBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  membersHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  membersTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  addMemberBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addMemberBtnText: { fontSize: 12, color: '#4f46e5', fontWeight: '600' },
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
  memberActions: { flexDirection: 'row', gap: 4 },
  memberActionBtn: { padding: 7 },
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
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  inviteDesc: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  notifRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  notifTextWrap: { flex: 1 },
  notifTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  notifDesc: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
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
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  signOutText: { fontSize: 16, fontWeight: '600', color: '#ef4444' },
  toast: {
    position: 'absolute',
    bottom: 32,
    left: 24,
    right: 24,
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  toastText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  toastNeutral: { backgroundColor: '#374151' },
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
  deleteInput: { borderColor: '#fca5a5', backgroundColor: '#fff7f7' },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  deleteBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  deleteBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
