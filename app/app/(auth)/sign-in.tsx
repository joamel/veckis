import { useOAuth, useSignIn } from '@clerk/clerk-expo';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailSignIn() {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      await setActive({ session: result.createdSessionId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Inloggning misslyckades';
      Alert.alert('Fel', msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    try {
      const { createdSessionId, setActive: setOAuthActive } = await startOAuthFlow({
        redirectUrl: Linking.createURL('/(tabs)/shopping', { scheme: 'veckis' }),
      });
      if (createdSessionId && setOAuthActive) {
        await setOAuthActive({ session: createdSessionId });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google-inloggning misslyckades';
      Alert.alert('Fel', msg);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Veckis</Text>
      <Text style={styles.subtitle}>Logga in på ditt hushåll</Text>

      <TextInput
        style={styles.input}
        placeholder="E-post"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Lösenord"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable style={styles.button} onPress={handleEmailSignIn} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Logga in</Text>
        )}
      </Pressable>

      <Pressable style={[styles.button, styles.googleButton]} onPress={handleGoogleSignIn}>
        <Text style={styles.buttonText}>Fortsätt med Google</Text>
      </Pressable>

      <Pressable onPress={() => router.push('/(auth)/sign-up')}>
        <Text style={styles.link}>Inget konto? Skapa ett</Text>
      </Pressable>
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
  title: { fontSize: 36, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 32 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  googleButton: { backgroundColor: '#ea4335' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#4f46e5', marginTop: 8 },
});
