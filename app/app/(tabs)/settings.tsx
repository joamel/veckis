import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActivityIndicator,
  Animated,
  Clipboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useHouseholdSocket } from '../../src/hooks/useHouseholdSocket';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApiClient } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useToast } from '../../src/context/ToastContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useSpotlightTip, useTipsReady } from '../../src/context/SpotlightTipContext';
import { useOnceFlag } from '../../src/hooks/useOnceFlag';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { NotificationsModal } from '../../src/components/NotificationsModal';
import { AuditLogSection } from '../../src/components/AuditLogSection';
import { ClientErrorsSection } from '../../src/components/ClientErrorsSection';
import { shareInviteLink } from '../../src/lib/inviteLink';
import type { InviteCode } from '@veckis/shared';
import type { HouseholdWithMembers } from '../../src/api/client';
import { kavBehavior } from '../../src/lib/platform';
import { settings as str, common } from '../../src/lib/svenska';

export default function SettingsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const client = useApiClient();
  const { householdId, householdName, memberRole, allMemberships, setActiveHouseholdId, refresh } = useHousehold();
  const { showToast: showGlobalToast, showError } = useToast();
  const confirm = useConfirm();
  const showTip = useSpotlightTip();
  const tipsReady = useTipsReady();
  const notifClockTip = useOnceFlag('seen-notif-clock-tip');
  const notifClockTipShownRef = useRef(false);
  const notifClockBtnRef = useRef<View>(null);
  const adminTip = useOnceFlag('seen-admin-tip');
  const adminTipShownRef = useRef(false);
  const adminEditBtnRef = useRef<View>(null);
  const [invite, setInvite] = useState<InviteCode | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [showAdminLogs, setShowAdminLogs] = useState(false);

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
      title: str.tips.notifications.title,
      message: str.tips.notifications.message,
      targetRef: notifClockBtnRef,
    });
    if (shown) { notifClockTipShownRef.current = true; notifClockTip.markSeen(); }
  }, [tipsReady, notifClockTip.seen, notifClockTip.markSeen, showTip]));

  useFocusEffect(useCallback(() => {
    return () => {
      // Read the latest value from a ref instead of calling the toast inside a
      // setState updater (that fires during render → "Cannot update a component
      // while rendering a different component").
      if (editModeRef.current) showGlobalToast(str.toasts.editingDone, 'neutral');
      setEditMode(false);
    };
  }, [showGlobalToast]));

  const [exporting, setExporting] = useState(false);

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
  // sysslor) för att visa sekundära handlingar — byt namn/logga ut
  // resp. byt aktivt hushåll.
  const [expandedHouseholds, setExpandedHouseholds] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [loadingJoinHousehold, setLoadingJoinHousehold] = useState(false);

  // Fetch household with members
  const [household, setHousehold] = useState<HouseholdWithMembers | null>(null);
  const [loadingHousehold, setLoadingHousehold] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const loadHousehold = useCallback(async () => {
    if (!householdId) return;
    setLoadingHousehold(true);
    try {
      const h = await client.getHousehold(householdId);
      setHousehold(h);
    } catch {
      setHousehold(null);
    } finally {
      setLoadingHousehold(false);
    }
  }, [householdId]);

  useEffect(() => { loadHousehold(); }, [loadHousehold]);

  useFocusEffect(useCallback(() => { loadHousehold(); }, [loadHousehold]));

  const onRefresh = useCallback(async () => {
    if (!householdId) return;
    setRefreshing(true);
    try {
      const h = await client.getHousehold(householdId);
      setHousehold(h);
    } catch { /* keep stale */ }
    finally { setRefreshing(false); }
  }, [householdId]);

  // Notifications — managed in a dedicated modal
  const [showNotifModal, setShowNotifModal] = useState(false);

  const displayName = user?.fullName ?? user?.emailAddresses[0]?.emailAddress ?? str.fallbackUser;
  const clerkUserId = user?.id;
  const isAdmin = memberRole === 'admin';
  const householdMembers = household?.members ?? [];

  function openMemberActions(t: { id: string; displayName: string; role: 'admin' | 'member'; clerkUserId: string | null }) {
    const isMe = t.clerkUserId === clerkUserId;
    const isLocalProfile = !t.clerkUserId;
    const isOtherAdmin = !isMe && !!t.clerkUserId && t.role === 'admin';
    const canChangeName = isMe || (isAdmin && isLocalProfile);
    const canToggleAdmin = isAdmin && !isMe && !!t.clerkUserId;
    const canRemove = isAdmin && !isMe && !isOtherAdmin;
    const buttons: { label: string; icon?: string; style?: 'primary' | 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (canChangeName) buttons.push({ label: str.memberActions.rename, icon: 'create-outline', onPress: () => openEditMember(t.id, t.displayName) });
    if (canToggleAdmin) buttons.push({ label: t.role === 'admin' ? str.memberActions.removeAdmin : str.memberActions.makeAdmin, icon: t.role === 'admin' ? 'shield-outline' : 'shield-checkmark', onPress: () => handleToggleAdmin(t.id, t.displayName, t.role) });
    if (canRemove) buttons.push({ label: str.memberActions.remove, icon: 'person-remove-outline', style: 'destructive', onPress: () => handleRemoveMember(t.id, t.displayName) });
    buttons.push({ label: common.actions.cancel, style: 'cancel' });
    confirm({ variant: 'action', buttons });
  }

  async function handleExportHousehold() {
    if (!householdId) return;
    setExporting(true);
    try {
      const json = await client.exportHouseholdData(householdId);
      const date = new Date().toISOString().slice(0, 10);
      await Share.share({ message: json, title: `veckis-export-${date}.json` });
    } catch (e) {
      showError(e, str.toasts.errorExport);
    } finally {
      setExporting(false);
    }
  }

  function openHouseholdActions() {
    const buttons: { label: string; icon?: string; style?: 'primary' | 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (isAdmin) buttons.push({ label: str.householdActions.rename, icon: 'create-outline', onPress: () => { setEditingHouseholdName(householdName || ''); setShowEditHouseholdModal(true); } });
    if (isAdmin) buttons.push({ label: str.householdActions.export, icon: 'download-outline', onPress: () => handleExportHousehold() });
    buttons.push({ label: str.householdActions.leave, icon: 'exit-outline', style: 'destructive', onPress: () => handleLeaveHousehold() });
    if (isAdmin) buttons.push({ label: str.householdActions.delete, icon: 'trash-outline', style: 'destructive', onPress: () => { setDeleteConfirmText(''); setShowDeleteHouseholdModal(true); } });
    buttons.push({ label: common.actions.cancel, style: 'cancel' });
    confirm({ variant: 'action', buttons });
  }

  // Admin-tip: bara för admins, efter notis-tipset. Förklarar att "Redigera"
  // låser upp admin-åtgärder (byt hushållsnamn, hantera medlemmar, dela ut
  // admin, ta bort hushållet).
  useFocusEffect(useCallback(() => {
    if (!tipsReady) return;
    if (adminTip.seen !== false || adminTipShownRef.current) return;
    if (!isAdmin) return;
    if (notifClockTip.seen !== true) return;
    const shown = showTip({
      title: str.tips.admin.title,
      message: str.tips.admin.message,
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
      showError(e, str.toasts.errorInvite);
    } finally {
      setLoadingInvite(false);
    }
  }

  function copyCode() {
    if (!invite) return;
    Clipboard.setString(invite.code);
    showGlobalToast(str.toasts.inviteCodeCopied(invite.code), 'success');
  }

  async function shareInvite() {
    if (!invite || !householdName) return;
    try {
      const res = await shareInviteLink(householdName, invite.code);
      if (res.outcome === 'copied') {
        showGlobalToast(str.toasts.inviteLinkCopied, 'success');
      }
    } catch (e) {
      showError(e, str.toasts.errorShareLink);
    }
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
      showToast(str.toasts.householdNameUpdated);
    } catch (e) {
      showError(e, str.toasts.errorUpdateHouseholdName);
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
      showToast(str.toasts.memberNameUpdated);
    } catch (e) {
      showError(e, str.toasts.errorUpdateMemberName);
    } finally {
      setLoadingMemberEdit(false);
    }
  }

  // Remove member
  async function handleToggleAdmin(memberId: string, memberName: string, currentRole: 'admin' | 'member') {
    if (!householdId) return;
    const promote = currentRole !== 'admin';
    confirm({
      title: promote ? str.confirmTitles.promoteAdmin : str.confirmTitles.demoteAdmin,
      message: promote
        ? str.messages.promoteAdmin(memberName)
        : str.messages.demoteAdmin(memberName),
      buttons: [
        {
          label: promote ? str.memberActions.makeAdmin : str.buttons.remove,
          style: promote ? 'primary' : 'destructive',
          onPress: async () => {
            try {
              const updated = await client.updateMember(householdId, memberId, { role: promote ? 'admin' : 'member' });
              setHousehold(h => h ? { ...h, members: h.members.map(m => m.id === memberId ? { ...m, role: updated.role } : m) } : null);
              showToast(promote ? str.toasts.memberPromoted(memberName) : str.toasts.memberDemoted(memberName));
            } catch (e) {
              showError(e, str.toasts.errorChangeRole);
            }
          },
        },
        { label: common.actions.cancel, style: 'cancel' },
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
      if (chores > 0) parts.push(str.messages.choreCount(chores));
      if (activities > 0) parts.push(str.messages.activityCount(activities));
      if (parts.length > 0) {
        warning = str.messages.removeMemberWarning(memberName, parts.join(' och '));
      }
    } catch {
      // Non-fatal — fall back to a plain confirmation.
    }

    confirm({
      title: str.confirmTitles.removeMember,
      message: `${str.messages.removeMemberConfirm(memberName)}${warning}`,
      buttons: [
        {
          label: str.buttons.removeAnyway,
          style: 'destructive',
          onPress: async () => {
            try {
              await client.removeMember(householdId, memberId);
              setHousehold(h => h ? { ...h, members: h.members.filter(m => m.id !== memberId) } : null);
              showToast(str.toasts.memberRemoved(memberName));
            } catch (e) {
              showError(e, str.toasts.errorRemoveMember);
            }
          },
        },
        { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }

  // Create local profile
  async function handleCreateLocalProfile() {
    if (!householdId || !localProfileName.trim()) return;
    setLoadingLocalProfile(true);
    try {
      const newMember = await client.createLocalMember(householdId, localProfileName);
      // Dedup: backend broadcastar 'member_added' parallellt med att vi
      // får response — om socket-eventet hann före är medlemmen redan i
      // listan, och en blind push skulle ge dubblett.
      setHousehold(h => h
        ? { ...h, members: h.members.some(m => m.id === newMember.id) ? h.members : [...h.members, newMember] }
        : null);
      setShowCreateLocalModal(false);
      setLocalProfileName('');
      showToast(str.toasts.localProfileAdded(localProfileName));
    } catch (e) {
      showError(e, str.toasts.errorCreateLocalProfile);
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
      showToast(str.toasts.householdDeleted);
    } catch (e) {
      showError(e, str.toasts.errorDeleteHousehold);
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
      showToast(str.toasts.householdCreated(newHouseholdName));
    } catch (e) {
      showError(e, str.toasts.errorCreate);
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
      showToast(str.toasts.householdJoined);
    } catch (err: any) {
      if (err?.message?.toLowerCase().includes('already')) {
        confirm({ title: str.toasts.alreadyMember.title, message: str.toasts.alreadyMember.message, buttons: [{ label: common.actions.ok }] });
      } else {
        showError(err, str.toasts.errorJoin);
      }
    } finally {
      setLoadingJoinHousehold(false);
    }
  }

  // Switch household
  async function handleSwitchHousehold(id: string) {
    if (id === householdId) return;
    const targetName = allMemberships.find(m => m.householdId === id)?.household.name ?? str.household.fallbackName;
    confirm({
      title: str.confirmTitles.switchHousehold,
      message: str.messages.switchHousehold(targetName),
      buttons: [
        {
          label: str.buttons.switchHousehold,
          onPress: async () => {
            await setActiveHouseholdId(id);
            setInvite(null);
          },
        },
        { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }

  function handleLeaveHousehold() {
    if (!householdId || !householdName) return;
    confirm({
      title: str.messages.leaveHouseholdTitle(householdName),
      message: str.messages.leaveHousehold,
      buttons: [
        { label: str.buttons.leaveHousehold, style: 'destructive', onPress: async () => {
          try {
            await client.leaveHousehold(householdId);
            await refresh();
          } catch (e) {
            showError(e, str.toasts.errorLeaveHousehold);
          }
        }},
        { label: common.actions.cancel, style: 'cancel' },
      ],
    });
  }

  const expiresAt = invite ? new Date(invite.expiresAt) : null;
  const expiresStr = expiresAt
    ? expiresAt.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader
        title={str.title}
        actionNode={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={() => router.push('/account' as never)}
              hitSlop={6}
              accessibilityLabel={str.a11y.account}
              style={styles.headerAvatar}
            >
              <Text style={styles.headerAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
              {isAdmin && <View style={styles.headerAvatarAdminDot} />}
            </Pressable>
            {isAdmin && (
              <Pressable
                style={styles.headerIconBtn}
                onPress={() => setShowAdminLogs(true)}
                accessibilityLabel={str.a11y.adminLogs}
              >
                <Ionicons name="bar-chart-outline" size={20} color="#4e7a5e" />
              </Pressable>
            )}
            <Pressable
              ref={notifClockBtnRef}
              style={styles.headerIconBtn}
              onPress={() => router.push('/preferences' as never)}
              accessibilityLabel={str.a11y.notifications}
            >
              <Ionicons name="settings-outline" size={20} color="#4e7a5e" />
            </Pressable>
          </View>
        }
      />

      {/* Admin-loggar — aktivitetslogg + klientfel som fullskärmsvy */}
      <Modal visible={showAdminLogs} animationType="slide" onRequestClose={() => setShowAdminLogs(false)}>
        <SafeAreaView style={styles.adminLogsContainer}>
          <View style={styles.adminLogsHeader}>
            <Pressable onPress={() => setShowAdminLogs(false)} hitSlop={10} accessibilityLabel={str.a11y.close}>
              <Ionicons name="arrow-back" size={24} color="#292524" />
            </Pressable>
            <Text style={styles.adminLogsTitle}>{str.sections.adminLogs}</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={styles.adminLogsBody} showsVerticalScrollIndicator={false}>
            {householdId && <AuditLogSection householdId={householdId} />}
            <ClientErrorsSection />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4e7a5e" />}
      >
        {/* Hushållet */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>{str.sections.household}</Text>
            <Pressable ref={adminEditBtnRef} onPress={() => setEditMode(v => !v)} hitSlop={8}>
              <Text style={[styles.editModeBtn, editMode && styles.editModeBtnActive]}>
                {editMode ? common.actions.done : common.actions.manage}
              </Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.card}
            onPress={() => { if (allMemberships.length > 1) setExpandedHouseholds(v => !v); }}
            accessibilityRole="button"
            accessibilityLabel={allMemberships.length > 1 ? str.a11y.switchActiveHousehold : str.household.active}
          >
            <View style={styles.householdIcon}>
              <Ionicons name="home-outline" size={20} color="#4e7a5e" />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{householdName ?? str.household.unknown}</Text>
              <Text style={styles.userEmail}>
                {allMemberships.length > 1
                  ? str.household.switchHint(allMemberships.length)
                  : str.household.active}
              </Text>
            </View>
            {editMode ? (
              <Pressable
                style={styles.memberActionBtn}
                onPress={(e) => { e.stopPropagation?.(); openHouseholdActions(); }}
                accessibilityLabel={str.a11y.householdOptions}
              >
                <Ionicons name="create-outline" size={16} color="#4e7a5e" />
              </Pressable>
            ) : allMemberships.length > 1 ? (
              <Ionicons name={expandedHouseholds ? 'chevron-up' : 'chevron-down'} size={18} color="#a8a29e" />
            ) : null}
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
                      color={active ? '#10b981' : '#78716c'}
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
              <Text style={styles.membersTitle}>{str.sections.members}</Text>
              {editMode && isAdmin && (
                <Pressable style={styles.addMemberBtn} onPress={() => setShowCreateLocalModal(true)}>
                  <Ionicons name="add-circle-outline" size={15} color="#4e7a5e" />
                  <Text style={styles.addMemberBtnText}>{str.member.localProfile}</Text>
                </Pressable>
              )}
            </View>
            {loadingHousehold && <ActivityIndicator size="small" color="#4e7a5e" style={{ marginVertical: 8 }} />}
            {householdMembers.map((member, idx) => (
              <View
                key={member.id}
                style={[styles.memberRow, idx === householdMembers.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {member.displayName}
                    {member.clerkUserId === clerkUserId && <Text style={styles.memberYou}>  {str.member.you}</Text>}
                  </Text>
                  <Text style={styles.memberEmail}>
                    {member.clerkUserId && member.role === 'admin' && (
                      <Text style={styles.memberAdminBadge}><Ionicons name="shield-checkmark" size={11} color="#b96a45" />{'  '}</Text>
                    )}
                    {member.clerkUserId ? (member.role === 'admin' ? str.member.admin : str.member.accountMember) : str.member.localProfile}
                  </Text>
                </View>
                <View style={styles.memberActions}>
                  {editMode && (member.clerkUserId === clerkUserId || isAdmin) && (
                    <Pressable
                      onPress={() => openMemberActions({
                        id: member.id,
                        displayName: member.displayName,
                        role: member.role,
                        clerkUserId: member.clerkUserId ?? null,
                      })}
                      style={styles.memberActionBtn}
                      accessibilityLabel={str.a11y.editMember(member.displayName)}
                    >
                      <Ionicons name="create-outline" size={16} color="#4e7a5e" />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>

        </View>

        {/* Bjud in */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{str.sections.invite}</Text>
          <View style={styles.inviteBox}>
            <Text style={styles.inviteDesc}>
              {str.invite.description}
            </Text>
            {invite ? (
              <>
                <View style={styles.codeRow}>
                  <Text style={styles.codeText}>{invite.code}</Text>
                  <Pressable style={styles.copyBtn} onPress={copyCode}>
                    <Ionicons name="copy-outline" size={18} color="#4e7a5e" />
                  </Pressable>
                </View>
                <Pressable style={styles.shareLinkBtn} onPress={shareInvite}>
                  <Ionicons name="share-outline" size={18} color="#fff" />
                  <Text style={styles.shareLinkBtnText}>{str.invite.shareLink}</Text>
                </Pressable>
              </>
            ) : null}
            {expiresStr && <Text style={styles.expiresText}>{str.invite.expires(expiresStr)}</Text>}
            <Pressable
              style={[styles.inviteBtn, loadingInvite && styles.inviteBtnDisabled]}
              onPress={generateInvite}
              disabled={loadingInvite}
            >
              {loadingInvite
                ? <ActivityIndicator color="#4e7a5e" size="small" />
                : <Text style={styles.inviteBtnText}>{invite ? str.invite.regenerate : str.invite.generate}</Text>}
            </Pressable>
          </View>
        </View>

        {/* Andra hushåll: skapa nytt eller gå med via kod */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{str.sections.other}</Text>
          <View style={styles.linkBox}>
            <Pressable style={styles.linkRow} onPress={() => setShowCreateHouseholdModal(true)}>
              <Ionicons name="add-circle-outline" size={18} color="#4e7a5e" />
              <Text style={styles.linkRowText}>{str.otherHousehold.create}</Text>
              <Ionicons name="chevron-forward" size={16} color="#d6d3d1" />
            </Pressable>
            <Pressable style={[styles.linkRow, styles.linkRowBorder]} onPress={() => setShowJoinHouseholdModal(true)}>
              <Ionicons name="log-in-outline" size={18} color="#4e7a5e" />
              <Text style={styles.linkRowText}>{str.otherHousehold.join}</Text>
              <Ionicons name="chevron-forward" size={16} color="#d6d3d1" />
            </Pressable>
          </View>
        </View>

      </ScrollView>

      {/* Edit Household Name Modal */}
      <Modal visible={showEditHouseholdModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowEditHouseholdModal(false)} />
        <KeyboardAvoidingView behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{str.modals.renameHousehold}</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <TextInput
              style={styles.input}
              placeholder={str.placeholders.householdName}
              value={editingHouseholdName}
              onChangeText={setEditingHouseholdName}
              placeholderTextColor="#a8a29e"
              returnKeyType="done"
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleSaveHouseholdName}
            />
            <Pressable
              style={[styles.button, loadingHouseholdEdit && styles.buttonDisabled]}
              onPress={handleSaveHouseholdName}
              disabled={loadingHouseholdEdit}
            >
              {loadingHouseholdEdit
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.buttonText}>{common.actions.save}</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Household Confirmation Modal */}
      <Modal visible={showDeleteHouseholdModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowDeleteHouseholdModal(false)} />
        <KeyboardAvoidingView behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{str.modals.deleteHousehold}</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetDesc}>
              {str.messages.deleteConfirmIntro(householdName ?? '')}{'\n\n'}
              Skriv <Text style={{ fontWeight: '700', color: '#ef4444' }}>{str.placeholders.deleteConfirm}</Text> {str.messages.deleteConfirmOutro}
            </Text>
            <TextInput
              style={[styles.input, styles.deleteInput]}
              placeholder={str.placeholders.deleteConfirm}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholderTextColor="#a8a29e"
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
                : <Text style={styles.deleteBtnText}>{str.buttons.deleteHousehold}</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Member Modal */}
      <Modal visible={showEditMemberModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowEditMemberModal(false)} />
        <KeyboardAvoidingView behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{str.modals.editMember}</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <TextInput
              style={styles.input}
              placeholder={str.placeholders.memberName}
              value={editingDisplayName}
              onChangeText={setEditingDisplayName}
              placeholderTextColor="#a8a29e"
              returnKeyType="done"
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleSaveMemberName}
            />
            <Pressable
              style={[styles.button, loadingMemberEdit && styles.buttonDisabled]}
              onPress={handleSaveMemberName}
              disabled={loadingMemberEdit}
            >
              {loadingMemberEdit
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.buttonText}>{common.actions.save}</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create Local Profile Modal */}
      <Modal visible={showCreateLocalModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowCreateLocalModal(false)} />
        <KeyboardAvoidingView behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{str.modals.addProfile}</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetDesc}>{str.messages.addProfile}</Text>
            <TextInput
              style={styles.input}
              placeholder={str.placeholders.memberName}
              value={localProfileName}
              onChangeText={setLocalProfileName}
              placeholderTextColor="#a8a29e"
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
                : <Text style={styles.buttonText}>{str.buttons.createProfile}</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Create Household Modal */}
      <Modal visible={showCreateHouseholdModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowCreateHouseholdModal(false)} />
        <KeyboardAvoidingView behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{str.modals.createHousehold}</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.input}
              placeholder={str.placeholders.householdName}
              value={newHouseholdName}
              onChangeText={setNewHouseholdName}
              placeholderTextColor="#a8a29e"
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
                : <Text style={styles.buttonText}>{common.actions.create}</Text>}
            </Pressable>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Join Household Modal */}
      <Modal visible={showJoinHouseholdModal} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setShowJoinHouseholdModal(false)} />
        <KeyboardAvoidingView behavior={kavBehavior} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end' }}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{str.modals.joinHousehold}</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll}>
            <Text style={styles.sheetDesc}>{str.messages.joinHint}</Text>
            <TextInput
              style={styles.input}
              placeholder={str.placeholders.inviteCode}
              value={joinCode}
              onChangeText={setJoinCode}
              placeholderTextColor="#a8a29e"
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
                : <Text style={styles.buttonText}>{str.buttons.joinHousehold}</Text>}
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
  container: { flex: 1, backgroundColor: '#faf8f3' },
  scroll: { paddingBottom: 40 },
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#a8a29e', letterSpacing: 0.8, marginBottom: 8 },
  editModeBtn: { fontSize: 13, fontWeight: '600', color: '#4e7a5e' },
  editModeBtnActive: { color: '#ef4444' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#d6d3d1',
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
    backgroundColor: '#4e7a5e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  householdIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ecf3ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { fontSize: 16, fontWeight: '600', color: '#292524' },
  userEmail: { fontSize: 13, color: '#78716c', marginTop: 2 },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#ecf3ec', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  adminBadgeText: { fontSize: 11, fontWeight: '600', color: '#4e7a5e' },
  membersBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#d6d3d1',
    padding: 14,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  membersHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  membersTitle: { fontSize: 14, fontWeight: '600', color: '#292524' },
  addMemberBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addMemberBtnText: { fontSize: 12, color: '#4e7a5e', fontWeight: '600' },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1efec',
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '500', color: '#292524' },
  memberYou: { fontSize: 13, fontWeight: '600', color: '#4e7a5e' },
  memberEmail: { fontSize: 12, color: '#a8a29e', marginTop: 2 },
  memberAdminBadge: { color: '#b96a45' },
  memberActions: { flexDirection: 'row', gap: 4 },
  memberActionBtn: { padding: 7 },
  inviteBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#d6d3d1',
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  inviteDesc: { fontSize: 14, color: '#78716c', lineHeight: 20 },
  headerIconBtn: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#ecf3ec', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#4e7a5e', alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  headerAvatarAdminDot: { position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#b96a45', borderWidth: 2, borderColor: '#fff' },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f1efec',
    borderRadius: 10,
    paddingVertical: 14,
  },
  codeText: { fontSize: 28, fontWeight: '700', color: '#292524', letterSpacing: 6 },
  copyBtn: { padding: 4 },
  expiresText: { fontSize: 12, color: '#a8a29e', textAlign: 'center' },
  inviteBtn: {
    borderWidth: 1.5,
    borderColor: '#4e7a5e',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  inviteBtnDisabled: { opacity: 0.4 },
  inviteBtnText: { fontSize: 15, fontWeight: '600', color: '#4e7a5e' },
  shareLinkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#b96a45', borderRadius: 10, paddingVertical: 12, marginTop: 4 },
  shareLinkBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  overflowPopover: { position: 'absolute', right: 0, alignItems: 'flex-end' },
  overflowPopoverInner: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4, width: 280, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 12 },
  overflowRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  overflowAction: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f1efec' },
  memberActionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  memberActionRowBorder: { borderTopWidth: 1, borderTopColor: '#f1efec' },
  memberActionRowText: { flex: 1, fontSize: 15, color: '#292524', fontWeight: '500' },
  inlineExpand: { backgroundColor: '#faf8f3', borderRadius: 12, marginTop: 6, marginHorizontal: 4, paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: '#f1efec' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  inlineRowBorder: { borderTopWidth: 1, borderTopColor: '#f1efec' },
  inlineRowText: { flex: 1, fontSize: 14, color: '#292524', fontWeight: '500' },
  linkBox: { backgroundColor: '#fff', borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#d6d3d1', paddingHorizontal: 14, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  linkRowBorder: { borderTopWidth: 1, borderTopColor: '#f1efec' },
  linkRowText: { flex: 1, fontSize: 15, color: '#292524', fontWeight: '500' },
  devBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, backgroundColor: '#f1efec', borderRadius: 12 },
  devBtnText: { fontSize: 14, fontWeight: '500', color: '#78716c' },
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
  toastNeutral: { backgroundColor: '#44403c' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e7e5e4',
    marginTop: 12,
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#292524', paddingHorizontal: 20, marginBottom: 8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12, borderTopWidth: 1, borderTopColor: '#f1efec' },
  menuRowLabel: { fontSize: 15, fontWeight: '600', color: '#292524' },
  menuRowSub: { fontSize: 12, color: '#78716c', marginTop: 2 },
  menuBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#f1efec' },
  menuBtnLast: { justifyContent: 'center', borderTopWidth: 0 },
  menuBtnText: { fontSize: 15, fontWeight: '600', color: '#292524' },
  sheetDesc: { fontSize: 14, color: '#78716c', paddingHorizontal: 20, marginBottom: 16, lineHeight: 20 },
  sheetScroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, gap: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#e7e5e4',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#faf8f3',
    color: '#292524',
  },
  deleteInput: { borderColor: '#fca5a5', backgroundColor: '#fff7f7' },
  button: {
    backgroundColor: '#4e7a5e',
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
  adminLogsContainer: { flex: 1, backgroundColor: '#faf8f3' },
  adminLogsHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1efec' },
  adminLogsTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#292524', textAlign: 'center' },
  adminLogsBody: { padding: 16, paddingBottom: 40 },
});
