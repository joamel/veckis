import { useOAuth, useSignIn } from '@clerk/clerk-expo';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
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
import { useConfirm } from '../../src/context/ConfirmContext';
import { InstallBanner } from '../../src/components/InstallBanner';

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
  const router = useRouter();
  const confirm = useConfirm();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Glömt-lösenord-flow: två steg. Steg 1 = skicka kod till e-post.
  // Steg 2 = mata in kod + nytt lösenord. Båda byggda inline med Clerks
  // reset_password_email_code-strategi så vi inte behöver leda ut användaren
  // till Account Portal.
  const [resetMode, setResetMode] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetCodeSent, setResetCodeSent] = useState(false);

  async function handleEmailSignIn() {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      await setActive({ session: result.createdSessionId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Inloggning misslyckades';
      confirm({ title: 'Fel', message: msg, buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }

  async function handleSendResetCode() {
    if (!isLoaded || !email.trim()) {
      confirm({ title: 'E-post saknas', message: 'Fyll i din e-postadress först.', buttons: [{ label: 'OK' }] });
      return;
    }
    setLoading(true);
    try {
      await signIn.create({ strategy: 'reset_password_email_code', identifier: email });
      setResetCodeSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kunde inte skicka återställningskod';
      confirm({ title: 'Fel', message: msg, buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!isLoaded) return;
    if (resetNewPassword.length < 8) {
      confirm({ title: 'Lösenord för kort', message: 'Lösenordet måste vara minst 8 tecken.', buttons: [{ label: 'OK' }] });
      return;
    }
    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: resetCode,
        password: resetNewPassword,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Återställning misslyckades';
      confirm({ title: 'Fel', message: msg, buttons: [{ label: 'OK' }] });
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
      confirm({ title: 'Fel', message: msg, buttons: [{ label: 'OK' }] });
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Veckis</Text>
      <Text style={styles.subtitle}>
        {resetMode ? 'Återställ lösenord' : 'Logga in på ditt hushåll'}
      </Text>

      <InstallBanner />

      {resetMode ? (
        <>
          {!resetCodeSent ? (
            <>
              <Text style={styles.helpText}>
                Skriv din e-post så skickar vi en återställningskod.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="E-post"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <Pressable style={styles.button} onPress={handleSendResetCode} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Skicka kod</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.helpText}>Vi har skickat en kod till {email}.</Text>
              <TextInput
                style={styles.input}
                placeholder="Återställningskod"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                value={resetCode}
                onChangeText={setResetCode}
              />
              <TextInput
                style={styles.input}
                placeholder="Nytt lösenord (minst 8 tecken)"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                value={resetNewPassword}
                onChangeText={setResetNewPassword}
                textContentType="newPassword"
                autoComplete="new-password"
              />
              <Pressable style={styles.button} onPress={handleResetPassword} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Återställ + logga in</Text>}
              </Pressable>
            </>
          )}
          <Pressable onPress={() => { setResetMode(false); setResetCodeSent(false); setResetCode(''); setResetNewPassword(''); }}>
            <Text style={styles.link}>← Tillbaka till inloggning</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="E-post"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Lösenord"
            placeholderTextColor="#9ca3af"
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

          <Pressable onPress={() => setResetMode(true)} hitSlop={6}>
            <Text style={styles.linkSmall}>Glömt lösenord?</Text>
          </Pressable>

          <Pressable style={[styles.button, styles.googleButton]} onPress={handleGoogleSignIn}>
            <Text style={styles.buttonText}>Fortsätt med Google</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/(auth)/sign-up')}>
            <Text style={styles.link}>Inget konto? Skapa ett</Text>
          </Pressable>
        </>
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
  linkSmall: { textAlign: 'center', color: '#6b7280', marginTop: -4, marginBottom: 8, fontSize: 13 },
  helpText: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 16 },
});
