import { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Clipboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import { useConfirm } from '../../src/context/ConfirmContext';
import { useSpotlightTip, useOnboardingMaster, useTipsReady } from '../../src/context/SpotlightTipContext';
import { useOnceFlag } from '../../src/hooks/useOnceFlag';
import { TIP_FLAGS } from '../../src/lib/onboardingTips';
import * as SecureStore from 'expo-secure-store';
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
  const confirm = useConfirm();
  const showTip = useSpotlightTip();
  const tipsReady = useTipsReady();
  const { skipAll, setSkipAll } = useOnboardingMaster();
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const notifClockTip = useOnceFlag('seen-notif-clock-tip');
  const notifClockTipShownRef = useRef(false);
  const notifClockBtnRef = useRef<View>(null);
  const adminTip = useOnceFlag('seen-admin-tip');
  const adminTipShownRef = useRef(false);
  const adminEditBtnRef = useRef<View>(null);
  const [invite, setInvite] = useState<InviteCode | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);

  // Admin edit mode
  const [editMode, setEditMode] = useState(false);
  const editModeRef = useRef(false);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);

  // Notis-klocka-tip: visa första gången inställningar öppnas (klockan i högra
  // hörnet är nyare och inte alltid uppenbar).
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (notifClockTip.seen !== false || notifClockTipShownRef.current) return;
    const shown = showTip({
      title: 'Notisinställningar',
      message: 'Klockan högst upp till höger öppnar dina notisinställningar — slå på/av påminnelser för aktiviteter, sysslor och inköpslistor per typ.',
      targetRef: notifClockBtnRef,
    });
    if (shown) { notifClockTipShownRef.current = true; notifClockTip.markSeen(); }
  }, [tipsReady, notifClockTip.seen, notifClockTip.markSeen, showTip]));

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
  // Profil- och hushållskorten kan fällas ut inline (i samma stil som
  // sysslor) för att visa sekundära handlingar — byt nickname/logga ut
  // resp. byt aktivt hushåll. Admin-handlingar på hushållet (rename/ta
  // bort) ligger i en egen overflow-sheet, oberoende av medlems-edit.
  const [expandedAccount, setExpandedAccount] = useState(false);
  const [expandedHouseholds, setExpandedHouseholds] = useState(false);
  const [showHouseholdAdminSheet, setShowHouseholdAdminSheet] = useState(false);
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

  // Admin-tip: bara för admins, efter notis-tipset. Förklarar att "Redigera"
  // låser upp admin-åtgärder (byt hushållsnamn, hantera medlemmar, dela ut
  // admin, ta bort hushållet).
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (adminTip.seen !== false || adminTipShownRef.current) return;
    if (!isAdmin) return;
    if (notifClockTip.seen !== true) return;
    const shown = showTip({
      title: 'Admin-läge',
      message: 'Som admin kan du trycka "Redigera" för att byta hushållsnamn, hantera medlemmar, dela ut admin-rättigheter och ta bort hushållet.',
      targetRef: adminEditBtnRef,
    });
    if (shown) { adminTipShownRef.current = true; adminTip.markSeen(); }
  }, [tipsReady, isAdmin, notifClockTip.seen, adminTip.seen, adminTip.markSeen, showTip]));

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
    showGlobalToast(`Koden ${invite.code} kopierad`, 'success');
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
    confirm({
      title: promote ? 'Gör till admin' : 'Ta bort admin-rättigheter',
      message: promote
        ? `Vill du ge ${memberName} admin-rättigheter? Admins kan redigera hushållet och hantera medlemmar.`
        : `Vill du ta bort admin-rättigheterna från ${memberName}?`,
      buttons: [
        {
          label: promote ? 'Gör till admin' : 'Ta bort',
          style: promote ? 'primary' : 'destructive',
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
        { label: 'Avbryt', style: 'cancel' },
      ],
    });
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

    confirm({
      title: 'Ta bort medlem',
      message: `Är du säker på att du vill ta bort ${memberName}?${warning}`,
      buttons: [
        {
          label: 'Ta bort ändå',
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
        { label: 'Avbryt', style: 'cancel' },
      ],
    });
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
        confirm({ title: 'Redan med', message: 'Du är redan medlem i det hushållet.', buttons: [{ label: 'OK' }] });
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
    confirm({
      title: 'Byt hushåll',
      message: `Vill du byta till "${targetName}"?`,
      buttons: [
        {
          label: 'Byt',
          onPress: async () => {
            await setActiveHouseholdId(id);
            setInvite(null);
          },
        },
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

  async function handleResetTips() {
    await Promise.all(TIP_FLAGS.map(k => SecureStore.deleteItemAsync(k).catch(() => {})));
    // Slå även PÅ master-toggle om den var av — annars skulle inget visas igen.
    if (skipAll) await setSkipAll(false);
    showGlobalToast('Tips återställda — visas igen i nästa session', 'neutral');
    setShowOverflowMenu(false);
  }

  const expiresAt = invite ? new Date(invite.expiresAt) : null;
  const expiresStr = expiresAt
    ? expiresAt.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title="Profil"
        actionNode={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Pressable ref={notifClockBtnRef} style={styles.headerIconBtn} onPress={() => setShowNotifModal(true)} accessibilityLabel="Notisinställningar">
              <Ionicons name="notifications-outline" size={20} color="#4f46e5" />
            </Pressable>
            <Pressable style={styles.headerIconBtn} onPress={() => setShowOverflowMenu(true)} accessibilityLabel="Fler alternativ">
              <Ionicons name="ellipsis-vertical" size={20} color="#4f46e5" />
            </Pressable>
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Konto */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>KONTO</Text>
          <Pressable
            style={styles.card}
            onPress={() => setExpandedAccount(v => !v)}
            accessibilityRole="button"
            accessibilityLabel={expandedAccount ? 'Dölj kontoval' : 'Visa kontoval'}
          >
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
            <Ionicons name={expandedAccount ? 'chevron-up' : 'chevron-down'} size={18} color="#9ca3af" />
          </Pressable>
          {expandedAccount && (
            <View style={styles.inlineExpand}>
              {(() => {
                const me = householdMembers.find(m => m.clerkUserId === clerkUserId);
                return me ? (
                  <Pressable
                    style={styles.inlineRow}
                    onPress={() => { setExpandedAccount(false); openEditMember(me.id, me.displayName); }}
                  >
                    <Ionicons name="create-outline" size={16} color="#4f46e5" />
                    <Text style={styles.inlineRowText}>Byt nickname</Text>
                  </Pressable>
                ) : null;
              })()}
              <Pressable
                style={[styles.inlineRow, styles.inlineRowBorder]}
                onPress={() => { setExpandedAccount(false); handleSignOut(); }}
              >
                <Ionicons name="log-out-outline" size={16} color="#ef4444" />
                <Text style={[styles.inlineRowText, { color: '#ef4444' }]}>Logga ut</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Hushållet */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>HUSHÅLLET</Text>
          <Pressable
            style={styles.card}
            onPress={() => { if (allMemberships.length > 1) setExpandedHouseholds(v => !v); }}
            accessibilityRole="button"
            accessibilityLabel={allMemberships.length > 1 ? 'Byt aktivt hushåll' : 'Aktivt hushåll'}
          >
            <View style={styles.householdIcon}>
              <Ionicons name="home-outline" size={20} color="#4f46e5" />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{householdName ?? 'Okänt hushåll'}</Text>
              <Text style={styles.userEmail}>
                {allMemberships.length > 1
                  ? `${allMemberships.length} hushåll · tryck för att byta`
                  : 'Aktivt hushåll'}
              </Text>
            </View>
            {allMemberships.length > 1 && (
              <Ionicons name={expandedHouseholds ? 'chevron-up' : 'chevron-down'} size={18} color="#9ca3af" />
            )}
            {isAdmin && (
              <Pressable
                style={styles.cardOverflowBtn}
                onPress={(e) => { e.stopPropagation?.(); setShowHouseholdAdminSheet(true); }}
                hitSlop={8}
                accessibilityLabel="Hushållsalternativ"
              >
                <Ionicons name="ellipsis-vertical" size={18} color="#6b7280" />
              </Pressable>
            )}
          </Pressable>
          {expandedHouseholds && allMemberships.length > 1 && (
            <View style={styles.inlineExpand}>
              {allMemberships.map((membership, idx) => {
                const active = membership.householdId === householdId;
                return (
                  <Pressable
                    key={membership.householdId}
                    style={[styles.inlineRow, idx > 0 && styles.inlineRowBorder]}
                    onPress={() => {
                      setExpandedHouseholds(false);
                      if (!active) handleSwitchHousehold(membership.householdId);
                    }}
                  >
                    <Ionicons
                      name={active ? 'home' : 'home-outline'}
                      size={16}
                      color={active ? '#10b981' : '#6b7280'}
                    />
                    <Text style={[styles.inlineRowText, active && { color: '#10b981', fontWeight: '700' }]}>
                      {membership.household.name}
                    </Text>
                    {active && <Ionicons name="checkmark-circle" size={16} color="#10b981" />}
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.membersBox}>
            <View style={styles.membersHeader}>
              <Text style={styles.membersTitle}>Medlemmar</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {editMode && isAdmin && (
                  <Pressable style={styles.addMemberBtn} onPress={() => setShowCreateLocalModal(true)}>
                    <Ionicons name="add-circle-outline" size={15} color="#4f46e5" />
                    <Text style={styles.addMemberBtnText}>Lokal profil</Text>
                  </Pressable>
                )}
                <Pressable ref={adminEditBtnRef} onPress={() => setEditMode(v => !v)} hitSlop={8}>
                  <Text style={[styles.editModeBtn, editMode && styles.editModeBtnActive]}>
                    {editMode ? 'Klar' : 'Hantera'}
                  </Text>
                </Pressable>
              </View>
            </View>
            {loadingHousehold && <ActivityIndicator size="small" color="#4f46e5" style={{ marginVertical: 8 }} />}
            {householdMembers.map((member, idx) => (
              <View
                key={member.id}
                style={[styles.memberRow, idx === householdMembers.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {member.displayName}
                    {member.clerkUserId === clerkUserId && <Text style={styles.memberYou}>  (Du)</Text>}
                  </Text>
                  <Text style={styles.memberEmail}>
                    {member.clerkUserId && member.role === 'admin' && (
                      <Text style={styles.memberAdminBadge}><Ionicons name="shield-checkmark" size={11} color="#7c3aed" />{'  '}</Text>
                    )}
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

        {/* Andra hushåll: skapa nytt eller gå med via kod */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ANDRA HUSHÅLL</Text>
          <View style={styles.linkBox}>
            <Pressable style={styles.linkRow} onPress={() => setShowCreateHouseholdModal(true)}>
              <Ionicons name="add-circle-outline" size={18} color="#4f46e5" />
              <Text style={styles.linkRowText}>Skapa nytt hushåll</Text>
              <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
            </Pressable>
            <Pressable style={[styles.linkRow, styles.linkRowBorder]} onPress={() => setShowJoinHouseholdModal(true)}>
              <Ionicons name="log-in-outline" size={18} color="#4f46e5" />
              <Text style={styles.linkRowText}>Gå med i hushåll</Text>
              <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Hushållsadmin-overflow: rename / ta bort hushåll */}
      <Modal visible={showHouseholdAdminSheet} transparent animationType="slide" onRequestClose={() => setShowHouseholdAdminSheet(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowHouseholdAdminSheet(false)} />
        <View style={[styles.sheet, { paddingBottom: 32 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{householdName ?? 'Hushållet'}</Text>
          <Pressable
            style={styles.householdSheetRow}
            onPress={() => { setShowHouseholdAdminSheet(false); setEditingHouseholdName(householdName || ''); setShowEditHouseholdModal(true); }}
          >
            <Ionicons name="create-outline" size={18} color="#4f46e5" />
            <Text style={styles.householdSheetRowText}>Byt namn på hushållet</Text>
          </Pressable>
          <Pressable
            style={[styles.householdSheetRow, styles.householdSheetRowBorder]}
            onPress={() => { setShowHouseholdAdminSheet(false); setDeleteConfirmText(''); setShowDeleteHouseholdModal(true); }}
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
            <Text style={[styles.householdSheetRowText, { color: '#ef4444' }]}>Ta bort hushållet</Text>
          </Pressable>
        </View>
      </Modal>

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

      {/* Overflow-menyn (3-prickar) — onboarding-kontroller och plats för
          framtida utilities (byt nickname etc skulle landa här). */}
      <Modal visible={showOverflowMenu} transparent animationType="slide" onRequestClose={() => setShowOverflowMenu(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowOverflowMenu(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Mer</Text>
          <View style={styles.menuRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuRowLabel}>Visa onboarding-tips</Text>
              <Text style={styles.menuRowSub}>Slå av om du inte vill se några tips alls</Text>
            </View>
            <Switch
              value={skipAll === false}
              onValueChange={v => setSkipAll(!v)}
              trackColor={{ false: '#d1d5db', true: '#a5b4fc' }}
              thumbColor={skipAll === false ? '#4f46e5' : '#f3f4f6'}
            />
          </View>
          <Pressable style={styles.menuBtn} onPress={handleResetTips}>
            <Ionicons name="refresh-outline" size={20} color="#4f46e5" />
            <Text style={styles.menuBtnText}>Återställ alla tips</Text>
          </Pressable>
          <Pressable style={[styles.menuBtn, styles.menuBtnLast]} onPress={() => setShowOverflowMenu(false)}>
            <Text style={[styles.menuBtnText, { color: '#6b7280' }]}>Stäng</Text>
          </Pressable>
        </View>
      </Modal>

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
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
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
    borderLeftWidth: 3,
    borderLeftColor: '#cbd5e1',
    padding: 14,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
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
  memberYou: { fontSize: 13, fontWeight: '600', color: '#4f46e5' },
  memberEmail: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  memberAdminBadge: { color: '#7c3aed' },
  memberActions: { flexDirection: 'row', gap: 4 },
  memberActionBtn: { padding: 7 },
  householdSheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingVertical: 14 },
  householdSheetRowBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  householdSheetRowText: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },
  inviteBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#cbd5e1',
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  inviteDesc: { fontSize: 14, color: '#6b7280', lineHeight: 20 },
  headerIconBtn: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#eef2ff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
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
  inlineExpand: { backgroundColor: '#fafafa', borderRadius: 12, marginTop: 6, marginHorizontal: 4, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: '#f3f4f6' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  inlineRowBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  inlineRowText: { flex: 1, fontSize: 14, color: '#111827', fontWeight: '500' },
  linkBox: { backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#cbd5e1', paddingHorizontal: 14, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  linkRowBorder: { borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  linkRowText: { flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' },
  cardOverflowBtn: { padding: 6, marginLeft: 4 },
  devBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, backgroundColor: '#f3f4f6', borderRadius: 12 },
  devBtnText: { fontSize: 14, fontWeight: '500', color: '#6b7280' },
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
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  menuRowLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  menuRowSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  menuBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  menuBtnLast: { justifyContent: 'center', borderTopWidth: 0 },
  menuBtnText: { fontSize: 15, fontWeight: '600', color: '#111827' },
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
