import { useState } from 'react';
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
import { useApiClient } from '../../src/api/client';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useConfirm } from '../../src/context/ConfirmContext';
import { useUser } from '@clerk/clerk-expo';

export default function HouseholdSetupScreen() {
  const client = useApiClient();
  const { refresh } = useHousehold();
  const { user } = useUser();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const defaultName = user?.firstName ?? user?.fullName ?? user?.emailAddresses[0]?.emailAddress?.split('@')[0] ?? 'Användare';
  const [nickname, setNickname] = useState(defaultName);

  async function handleCreate() {
    if (!name.trim() || !nickname.trim()) return;
    setLoading(true);
    try {
      await client.createHousehold(name.trim(), nickname.trim());
      await refresh();
    } catch (err) {
      confirm({ title: 'Fel', message: err instanceof Error ? err.message : 'Kunde inte skapa hushåll', buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (code.trim().length !== 8 || !nickname.trim()) return;
    setLoading(true);
    try {
      await client.joinHousehold(code.trim().toUpperCase(), nickname.trim());
      await refresh();
    } catch (err) {
      confirm({ title: 'Fel', message: err instanceof Error ? err.message : 'Ogiltig eller utgången kod', buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Välkommen till Veckis</Text>
      <Text style={styles.subtitle}>Välj ett smeknamn — det syns för andra i hushållet</Text>

      <TextInput
        style={styles.input}
        placeholder="Ditt smeknamn"
        placeholderTextColor="#9ca3af"
        value={nickname}
        onChangeText={setNickname}
        autoCapitalize="words"
      />

      <Text style={[styles.subtitle, { marginTop: 16 }]}>Skapa ett nytt hushåll eller gå med i ett befintligt</Text>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'create' && styles.tabActive]}
          onPress={() => setTab('create')}
        >
          <Text style={[styles.tabText, tab === 'create' && styles.tabTextActive]}>Skapa</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'join' && styles.tabActive]}
          onPress={() => setTab('join')}
        >
          <Text style={[styles.tabText, tab === 'join' && styles.tabTextActive]}>Gå med</Text>
        </Pressable>
      </View>

      {tab === 'create' ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Hushållets namn, t.ex. Familjen Andersson"
            placeholderTextColor="#9ca3af"
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
              <Text style={styles.buttonText}>Skapa hushåll</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <View style={styles.form}>
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="XXXXXXXX"
            placeholderTextColor="#9ca3af"
            value={code}
            onChangeText={t => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            maxLength={8}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleJoin}
          />
          <Text style={styles.hint}>Ange den 8-siffriga inbjudningskoden</Text>
          <Pressable
            style={[styles.button, code.length !== 8 && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={loading || code.length !== 8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Gå med</Text>
            )}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 8, color: '#111827' },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 32 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 4,
    marginBottom: 24,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 15, fontWeight: '500', color: '#6b7280' },
  tabTextActive: { color: '#111827' },
  form: { gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#f9fafb',
  },
  codeInput: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
  },
  hint: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
