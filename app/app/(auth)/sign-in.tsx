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
  // Tre inloggnings-lägen:
  // - 'password' (default): klassisk e-post + lösenord
  // - 'email-code': lösenordsfri inlogg via 6-siffrig kod skickad till e-post
  //   (Clerk-strategi 'email_code'; samma infra som verifierings-/reset-kod)
  // - 'reset': glömt-lösenord-flow via 'reset_password_email_code'
  const [mode, setMode] = useState<'password' | 'email-code' | 'reset'>('password');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');

  function switchMode(next: 'password' | 'email-code' | 'reset') {
    setMode(next);
    setCodeSent(false);
    setCode('');
    setResetNewPassword('');
  }

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

  /** Skicka kod till mail. Används av både 'email-code' och 'reset'. */
  async function handleSendCode() {
    if (!isLoaded || !email.trim()) {
      confirm({ title: 'E-post saknas', message: 'Fyll i din e-postadress först.', buttons: [{ label: 'OK' }] });
      return;
    }
    setLoading(true);
    try {
      const strategy = mode === 'reset' ? 'reset_password_email_code' : 'email_code';
      if (mode === 'email-code') {
        // För passwordless email_code måste vi först resolva användaren via
        // identifier och sedan prepareFirstFactor med rätt emailAddressId.
        const attempt = await signIn.create({ identifier: email });
        const factor = attempt.supportedFirstFactors?.find(f => f.strategy === 'email_code');
        if (!factor || !('emailAddressId' in factor)) {
          throw new Error('Inloggning med kod är inte tillgänglig för detta konto');
        }
        await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
      } else {
        await signIn.create({ strategy, identifier: email });
      }
      setCodeSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Kunde inte skicka kod';
      confirm({ title: 'Fel', message: msg, buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }

  /** Verifiera koden. För 'email-code' → in i appen direkt. För 'reset' → kräver nytt lösenord. */
  async function handleVerifyCode() {
    if (!isLoaded) return;
    if (mode === 'reset' && resetNewPassword.length < 8) {
      confirm({ title: 'Lösenord för kort', message: 'Lösenordet måste vara minst 8 tecken.', buttons: [{ label: 'OK' }] });
      return;
    }
    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor(
        mode === 'reset'
          ? { strategy: 'reset_password_email_code', code, password: resetNewPassword }
          : { strategy: 'email_code', code },
      );
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verifiering misslyckades';
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
        {mode === 'reset' ? 'Återställ lösenord'
          : mode === 'email-code' ? 'Logga in med kod'
          : 'Logga in på ditt hushåll'}
      </Text>

      <InstallBanner />

      {mode === 'password' && (
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
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Logga in</Text>}
          </Pressable>

          <View style={styles.altRow}>
            <Pressable onPress={() => switchMode('email-code')} hitSlop={6}>
              <Text style={styles.linkSmall}>Logga in med kod via e-post</Text>
            </Pressable>
            <Text style={styles.altSep}>·</Text>
            <Pressable onPress={() => switchMode('reset')} hitSlop={6}>
              <Text style={styles.linkSmall}>Glömt lösenord?</Text>
            </Pressable>
          </View>

          <Pressable style={[styles.button, styles.googleButton]} onPress={handleGoogleSignIn}>
            <Text style={styles.buttonText}>Fortsätt med Google</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/(auth)/sign-up')}>
            <Text style={styles.link}>Inget konto? Skapa ett</Text>
          </Pressable>
        </>
      )}

      {(mode === 'email-code' || mode === 'reset') && (
        <>
          {!codeSent ? (
            <>
              <Text style={styles.helpText}>
                {mode === 'email-code'
                  ? 'Skriv din e-post så skickar vi en engångskod.'
                  : 'Skriv din e-post så skickar vi en återställningskod.'}
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
              <Pressable style={styles.button} onPress={handleSendCode} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Skicka kod</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.helpText}>Vi har skickat en kod till {email}.</Text>
              <TextInput
                style={styles.input}
                placeholder="Kod från mailet"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
              />
              {mode === 'reset' && (
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
              )}
              <Pressable style={styles.button} onPress={handleVerifyCode} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.buttonText}>{mode === 'reset' ? 'Återställ + logga in' : 'Logga in'}</Text>}
              </Pressable>
            </>
          )}
          <Pressable onPress={() => switchMode('password')}>
            <Text style={styles.link}>← Tillbaka till inloggning</Text>
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
  linkSmall: { color: '#6b7280', fontSize: 13 },
  altRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 8, flexWrap: 'wrap' },
  altSep: { color: '#d1d5db', fontSize: 13 },
  helpText: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 16 },
});
