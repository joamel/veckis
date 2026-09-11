import { useMemo, useRef } from 'react';
import { useTheme } from '../src/context/ThemeContext';
import type { Palette } from '../src/lib/theme';
// Kontosida — namn, byt namn, ta bort konto, logga ut. Egen route med
// tillbaka-pil. Avatar-tap på Profil-flikens header öppnar denna vy.
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/expo';
import { useApiClient } from '../src/api/client';
import { useHousehold } from '../src/context/HouseholdContext';
import { useToast } from '../src/context/ToastContext';
import { useConfirm } from '../src/context/ConfirmContext';
import { account as str } from '../src/lib/svenska';
import { DraggableBottomSheet } from '../src/components/DraggableBottomSheet';
import { useSheetLift } from '../src/hooks/useSheetLift';

// Clerks konto-portal (2FA m.m.) ligger på olika domäner per instans: prod
// (pk_live) på accounts.handlis.app, dev på .accounts.dev. Env-styrt så länken
// inte pekar på fel instans.
const CLERK_PORTAL_BASE = (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '').startsWith('pk_live')
  ? 'https://accounts.handlis.app'
  : 'https://new-oarfish-48.accounts.dev';

export default function AccountScreen() {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
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
  const displayName = myMember?.displayName ?? user?.firstName ?? user?.emailAddresses[0]?.emailAddress.split('@')[0] ?? str.defaultName;
  const email = user?.emailAddresses[0]?.emailAddress ?? '';

  // Mät-och-lyft i stället för KeyboardAvoidingView: den krympte arket och
  // lämnade ett tomrum när tangentbordet stängdes.
  const { sheetLift, onFocusInput } = useSheetLift();
  const renameRef = useRef<TextInput>(null);
  const curPwRef = useRef<TextInput>(null);
  const newPwRef = useRef<TextInput>(null);
  const confirmPwRef = useRef<TextInput>(null);
  const deleteRef = useRef<TextInput>(null);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Radera konto kräver en extra, medveten säkerhetsåtgärd (inte bara en
  // confirm()-dialog) eftersom det är permanent och oåterkalleligt: en
  // ihakad checkbox OCH en exakt inskriven bekräftelseord, samma mönster
  // som redan finns för att radera ett HUSHÅLL (settings.tsx).
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [deleteAgree, setDeleteAgree] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const canDeleteAccount = deleteAgree && deleteConfirmText === str.deleteConfirm.word;

  // Lösenord: lösenordsfria konton (email-code) kan lägga TILL ett; de som redan
  // har ett kan ÄNDRA det (kräver nuvarande). user.passwordEnabled avgör vilket.
  const hasPassword = user?.passwordEnabled ?? false;
  const [showPassword, setShowPassword] = useState(false);
  const [pwVisible, setPwVisible] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const pwMatches = newPw.length > 0 && newPw === confirmPw;
  const canSavePw = newPw.length >= 8 && pwMatches && (!hasPassword || curPw.length > 0);

  function closePassword() {
    setShowPassword(false);
    setPwVisible(false);
    setCurPw(''); setNewPw(''); setConfirmPw('');
  }

  async function handleSavePassword() {
    if (!user || !canSavePw) return;
    setSavingPw(true);
    try {
      await user.updatePassword(hasPassword ? { newPassword: newPw, currentPassword: curPw } : { newPassword: newPw });
      showToast(hasPassword ? str.toasts.passwordUpdated : str.toasts.passwordAdded, 'success');
      closePassword();
    } catch (e) {
      showError(e, str.toasts.errorPassword);
    } finally {
      setSavingPw(false);
    }
  }

  async function openPortal(path: string) {
    const url = `${CLERK_PORTAL_BASE}${path}`;
    try {
      if (Platform.OS as any === 'web') {
        window.open(url, '_blank', 'noopener');
      } else {
        const WebBrowser = await import('expo-web-browser');
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (e) {
      showError(e, str.toasts.errorPortal);
    }
  }

  async function handleSaveName() {
    if (!householdId || !myMemberId || !renameValue.trim()) return;
    setSaving(true);
    try {
      await client.updateMember(householdId, myMemberId, { displayName: renameValue.trim() });
      await refresh();
      setShowRename(false);
      showToast(str.toasts.nameUpdated, 'success');
    } catch (e) {
      showError(e, str.toasts.errorUpdateName);
    } finally {
      setSaving(false);
    }
  }

  async function doDeleteAccount() {
    setDeleting(true);
    try {
      await client.deleteAccount();
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch (e) {
      setDeleting(false);
      showError(e, str.toasts.errorDelete);
    }
  }

  function handleDeleteAccount() {
    setDeleteAgree(false);
    setDeleteConfirmText('');
    setShowDeleteSheet(true);
  }

  function handleSignOut() {
    confirm({
      title: str.signOutConfirm.title,
      message: str.signOutConfirm.message,
      buttons: [
        { label: str.signOutConfirm.confirm, style: 'destructive', onPress: () => signOut() },
        { label: str.signOutConfirm.cancel, style: 'cancel' },
      ],
    });
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel={str.backA11y}>
          <Ionicons name="arrow-back" size={24} color={c.text} />
        </Pressable>
        <Text style={s.headerTitle}>{str.title}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.avatarCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={s.name}>{displayName}</Text>
          {email ? (
            <Text style={[s.email, { minWidth: email.length * 9 + 6, textAlign: 'center' }]}>{email}</Text>
          ) : null}
        </View>

        <Text style={s.sectionLabel}>{str.sections.profile}</Text>
        <View style={s.group}>
          <Pressable style={s.row} onPress={() => { setRenameValue(displayName); setShowRename(true); }}>
            <Ionicons name="create-outline" size={18} color={c.primary} />
            <Text style={s.rowText}>{str.rows.rename}</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
          </Pressable>
        </View>

        <Text style={s.sectionLabel}>{str.sections.security}</Text>
        <View style={s.group}>
          <Pressable style={s.row} onPress={() => setShowPassword(true)}>
            <Ionicons name="key-outline" size={18} color={c.primary} />
            <Text style={s.rowText}>{hasPassword ? str.rows.changePassword : str.rows.addPassword}</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
          </Pressable>
          <Pressable style={[s.row, s.rowBorder]} onPress={() => openPortal('/user/security')}>
            <Ionicons name="shield-checkmark-outline" size={18} color={c.primary} />
            <Text style={s.rowText}>{str.rows.twoFactor}</Text>
            <Ionicons name="open-outline" size={16} color={c.textFaint} />
          </Pressable>
          {/* Radera konto hör hemma bland de andra säkerhetskänsliga
              åtgärderna (samma sektion som 2FA), inte som en egen "session"-
              rad — men röd/danger-färgad så den ändå syns som allvarlig. */}
          <Pressable style={[s.row, s.rowBorder]} onPress={handleDeleteAccount} disabled={deleting}>
            <Ionicons name="trash-outline" size={18} color={c.danger} />
            <Text style={[s.rowText, { color: c.danger }]}>{str.rows.delete}</Text>
            {deleting ? <ActivityIndicator size="small" color={c.danger} /> : <Ionicons name="chevron-forward" size={16} color={c.dangerBorder} />}
          </Pressable>
        </View>

        {/* Logga ut — egen, röd (tydligt en notify-värd åtgärd) rad längst ned. */}
        <View style={[s.group, { marginTop: 24 }]}>
          <Pressable style={s.row} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={18} color={c.danger} />
            <Text style={[s.rowText, { color: c.danger }]}>{str.rows.signOut}</Text>
            <Ionicons name="chevron-forward" size={16} color={c.dangerBorder} />
          </Pressable>
        </View>
      </ScrollView>

      {/* Byt namn-modal */}
      <DraggableBottomSheet visible={showRename} onRequestClose={() => setShowRename(false)} liftOffset={sheetLift} sheetStyle={s.sheetDraggable}>
        <Text style={s.sheetTitle}>{str.renameModal.title}</Text>
        <TextInput
          ref={renameRef}
          onFocus={onFocusInput(renameRef)}
          style={s.input}
          placeholder={str.renameModal.placeholder}
          placeholderTextColor={c.textFaint}
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
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{str.renameModal.save}</Text>}
        </Pressable>
      </DraggableBottomSheet>

      {/* Lösenord-modal: lägg till (lösenordsfritt konto) eller ändra */}
      <DraggableBottomSheet visible={showPassword} onRequestClose={closePassword} liftOffset={sheetLift} sheetStyle={s.sheetDraggable}>
        <Text style={s.sheetTitle}>{hasPassword ? str.passwordModal.changeTitle : str.passwordModal.addTitle}</Text>
        <Text style={s.sheetSubtitle}>{hasPassword ? str.security.changeSubtitle : str.security.addSubtitle}</Text>
        {hasPassword && (
          <TextInput
            ref={curPwRef}
            onFocus={onFocusInput(curPwRef)}
            style={s.input}
            placeholder={str.passwordModal.currentPlaceholder}
            placeholderTextColor={c.textFaint}
            secureTextEntry={!pwVisible}
            value={curPw}
            onChangeText={setCurPw}
          />
        )}
        <View style={s.pwWrap}>
          <TextInput
            ref={newPwRef}
            onFocus={onFocusInput(newPwRef)}
            style={[s.input, s.pwInput]}
            placeholder={str.passwordModal.newPlaceholder}
            placeholderTextColor={c.textFaint}
            secureTextEntry={!pwVisible}
            value={newPw}
            onChangeText={setNewPw}
            textContentType="newPassword"
            autoComplete="new-password"
          />
          <Pressable
            style={s.pwEye}
            onPress={() => setPwVisible(v => !v)}
            hitSlop={8}
            accessibilityLabel={pwVisible ? str.passwordModal.hidePassword : str.passwordModal.showPassword}
          >
            <Ionicons name={pwVisible ? 'eye-off-outline' : 'eye-outline'} size={22} color={c.textFaint} />
          </Pressable>
        </View>
        <TextInput
          ref={confirmPwRef}
          onFocus={onFocusInput(confirmPwRef)}
          style={[s.input, confirmPw.length > 0 && !pwMatches && s.inputError]}
          placeholder={str.passwordModal.confirmPlaceholder}
          placeholderTextColor={c.textFaint}
          secureTextEntry={!pwVisible}
          value={confirmPw}
          onChangeText={setConfirmPw}
          textContentType="newPassword"
          autoComplete="new-password"
        />
        {confirmPw.length > 0 && !pwMatches && (
          <Text style={s.errorText}>{str.passwordModal.mismatch}</Text>
        )}
        <Pressable
          style={[s.primaryBtn, (!canSavePw || savingPw) && { opacity: 0.4 }]}
          onPress={handleSavePassword}
          disabled={!canSavePw || savingPw}
        >
          {savingPw ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{str.passwordModal.save}</Text>}
        </Pressable>
      </DraggableBottomSheet>

      {/* Radera konto — kräver ihakad checkbox + exakt inskrivet ord innan
          knappen ens går att trycka. Permanent och oåterkalleligt. */}
      <DraggableBottomSheet
        visible={showDeleteSheet}
        onRequestClose={() => setShowDeleteSheet(false)}
        liftOffset={sheetLift}
        sheetStyle={s.sheet}
      >
        <Text style={s.sheetTitle}>{str.deleteConfirm.title}</Text>
        <Text style={s.sheetSubtitle}>{str.deleteConfirm.intro}</Text>
        <Pressable style={s.agreeRow} onPress={() => setDeleteAgree(v => !v)}>
          <Ionicons name={deleteAgree ? 'checkbox' : 'square-outline'} size={22} color={deleteAgree ? c.danger : c.textFaint} />
          <Text style={s.agreeText}>{str.deleteConfirm.agree}</Text>
        </Pressable>
        <Text style={s.sheetSubtitle}>{str.deleteConfirm.typeIntro(str.deleteConfirm.word)}</Text>
        <TextInput
          ref={deleteRef}
          onFocus={onFocusInput(deleteRef)}
          style={s.input}
          placeholder={str.deleteConfirm.word}
          placeholderTextColor={c.textFaint}
          value={deleteConfirmText}
          onChangeText={setDeleteConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
        />
        <Pressable
          style={[s.dangerBtn, (!canDeleteAccount || deleting) && { opacity: 0.4 }]}
          onPress={() => { setShowDeleteSheet(false); doDeleteAccount(); }}
          disabled={!canDeleteAccount || deleting}
        >
          {deleting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{str.deleteConfirm.confirm}</Text>}
        </Pressable>
      </DraggableBottomSheet>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.surface, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.surfaceSubtle },
  headerTitle: { fontSize: 16, fontWeight: '700', color: c.text },
  scroll: { padding: 16, paddingBottom: 40 },
  avatarCard: { alignItems: 'center', paddingVertical: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { fontSize: 32, fontWeight: '700', color: '#fff' },
  name: { fontSize: 20, fontWeight: '700', color: c.text },
  email: { fontSize: 14, color: c.textMuted, marginTop: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: c.textFaint, letterSpacing: 0.8, marginTop: 12, marginBottom: 8, paddingHorizontal: 4 },
  group: { backgroundColor: c.surface, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: c.border, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.surfaceSubtle },
  rowText: { flex: 1, fontSize: 15, color: c.text, fontWeight: '500' },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 14 },
  sheetDraggable: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: c.text },
  sheetSubtitle: { fontSize: 13, color: c.textMuted, lineHeight: 19, marginTop: -6 },
  input: { color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 14, fontSize: 16, backgroundColor: c.inputBg },
  pwWrap: { position: 'relative', justifyContent: 'center' },
  pwInput: { paddingRight: 48 },
  pwEye: { position: 'absolute', right: 6, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 8 },
  inputError: { borderColor: c.danger },
  errorText: { color: c.danger, fontSize: 13, marginTop: -8, marginLeft: 4 },
  primaryBtn: { backgroundColor: c.primary, borderRadius: 10, padding: 16, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  agreeText: { flex: 1, fontSize: 14, color: c.text, lineHeight: 20 },
  dangerBtn: { backgroundColor: c.danger, borderRadius: 10, padding: 16, alignItems: 'center' },
});
