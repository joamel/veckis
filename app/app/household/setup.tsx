import { useMemo } from 'react';
import { useTheme } from '../../src/context/ThemeContext';
import type { Palette } from '../../src/lib/theme';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApiClient } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useUser } from '@clerk/clerk-expo';
import { householdSetup as str } from '../../src/lib/svenska';

export default function HouseholdSetupScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const client = useApiClient();
  const { refresh } = useHousehold();
  const { user } = useUser();
  const confirm = useConfirm();
  // Inbjudningslänk: ?code=XXXXXXXX förfyller koden och växlar till
  // "Gå med"-fliken. Persisteras tillfälligt i localStorage på web så
  // koden överlever ev. sign-in-redirect via Clerk.
  const params = useLocalSearchParams<{ code?: string }>();
  const [tab, setTab] = useState<'create' | 'join'>(params.code ? 'join' : 'create');
  const [name, setName] = useState('');
  const [code, setCode] = useState((params.code ?? '').toUpperCase().slice(0, 8));
  const [loading, setLoading] = useState(false);

  // Cache + restore: om användaren klickat invite-länk innan inlogg, sparar vi
  // koden i localStorage. Den hämtas tillbaka när hen landar här efter sign-in.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (params.code) {
      try { window.localStorage.setItem('pending_invite_code', String(params.code).toUpperCase()); } catch { /* best-effort */ }
      return;
    }
    try {
      const stored = window.localStorage.getItem('pending_invite_code');
      if (stored && stored.length === 8) {
        setCode(stored);
        setTab('join');
      }
    } catch { /* best-effort */ }
  }, [params.code]);

  const defaultName = user?.firstName ?? user?.fullName ?? user?.emailAddresses[0]?.emailAddress?.split('@')[0] ?? str.defaultName;
  const [nickname, setNickname] = useState(defaultName);

  async function handleCreate() {
    if (!name.trim() || !nickname.trim()) return;
    setLoading(true);
    try {
      await client.createHousehold(name.trim(), nickname.trim());
      await refresh();
    } catch (err) {
      confirm({ title: str.errors.title, message: err instanceof Error ? err.message : str.errors.couldNotCreate, buttons: [{ label: str.errors.ok }] });
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (code.trim().length !== 8 || !nickname.trim()) return;
    setLoading(true);
    try {
      await client.joinHousehold(code.trim().toUpperCase(), nickname.trim());
      if (Platform.OS === 'web') {
        try { window.localStorage.removeItem('pending_invite_code'); } catch { /* best-effort */ }
      }
      await refresh();
    } catch (err) {
      confirm({ title: str.errors.title, message: err instanceof Error ? err.message : str.errors.invalidCode, buttons: [{ label: str.errors.ok }] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>{str.title}</Text>
      <Text style={styles.subtitle}>{str.subtitle}</Text>

      <TextInput
        style={styles.input}
        placeholder={str.namePlaceholder}
        placeholderTextColor={c.textFaint}
        value={nickname}
        onChangeText={setNickname}
        autoCapitalize="words"
      />

      <Text style={[styles.subtitle, { marginTop: 16 }]}>{str.intro}</Text>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'create' && styles.tabActive]}
          onPress={() => setTab('create')}
        >
          <Text style={[styles.tabText, tab === 'create' && styles.tabTextActive]}>{str.tabs.create}</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'join' && styles.tabActive]}
          onPress={() => setTab('join')}
        >
          <Text style={[styles.tabText, tab === 'join' && styles.tabTextActive]}>{str.tabs.join}</Text>
        </Pressable>
      </View>

      {tab === 'create' ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={str.create.namePlaceholder}
            placeholderTextColor={c.textFaint}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
          <Pressable
            style={[styles.button, !name.trim() && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={loading || !name.trim()}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{str.create.button}</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.form}>
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder={str.join.codePlaceholder}
            placeholderTextColor={c.textFaint}
            value={code}
            onChangeText={t => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            maxLength={8}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleJoin}
          />
          <Text style={styles.hint}>{str.join.hint}</Text>
          <Pressable
            style={[styles.button, code.length !== 8 && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={loading || code.length !== 8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{str.join.button}</Text>
            )}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: c.surface,
  },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 8, color: c.text },
  subtitle: { fontSize: 15, color: c.textMuted, textAlign: 'center', marginBottom: 32 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: c.surfaceSubtle,
    borderRadius: 10,
    padding: 4,
    marginBottom: 24,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: c.inputBg, borderWidth: 1, borderColor: c.border, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 15, fontWeight: '500', color: c.textMuted },
  tabTextActive: { color: c.text, fontWeight: '700' },
  form: { gap: 12 },
  input: { color: c.text,
    borderWidth: 1,
    borderColor: c.borderLight,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: c.background,
  },
  codeInput: { color: c.text,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
  },
  hint: { fontSize: 13, color: c.textFaint, textAlign: 'center' },
  button: {
    backgroundColor: c.primary,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
