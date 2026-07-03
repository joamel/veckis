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
import { auth as str } from '../../src/lib/svenska';

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
  const router = useRouter();
  const confirm = useConfirm();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Tre inloggnings-lägen — 'email-code' är default (säkrare än lösen för
  // medianvändaren som inte aktiverar 2FA, och eliminerar lösen-återanvändnings-
  // attacken). Lösen + Google finns kvar som alternativ.
  // - 'email-code' (default): lösenordsfri 6-siffrig kod till e-post
  // - 'password': klassisk e-post + lösen
  // - 'reset': glömt-lösen-flow via 'reset_password_email_code'
  const [mode, setMode] = useState<'password' | 'email-code' | 'reset'>('email-code');
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
      const msg = err instanceof Error ? err.message : str.errors.signInFailed;
      confirm({ title: str.errors.title, message: msg, buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }

  /** Skicka kod till mail. Används av både 'email-code' och 'reset'. */
  async function handleSendCode() {
    if (!isLoaded || !email.trim()) {
      confirm({ title: str.errors.emailMissing.title, message: str.errors.emailMissing.message, buttons: [{ label: 'OK' }] });
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
          throw new Error(str.errors.codeSignInUnavailable);
        }
        await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
      } else {
        await signIn.create({ strategy, identifier: email });
      }
      setCodeSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : str.errors.sendCodeFailed;
      confirm({ title: str.errors.title, message: msg, buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }

  /** Verifiera koden. För 'email-code' → in i appen direkt. För 'reset' → kräver nytt lösenord. */
  async function handleVerifyCode() {
    if (!isLoaded) return;
    if (mode === 'reset' && resetNewPassword.length < 8) {
      confirm({ title: str.errors.passwordTooShort.title, message: str.errors.passwordTooShort.message, buttons: [{ label: 'OK' }] });
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
      const msg = err instanceof Error ? err.message : str.errors.verifyFailed;
      confirm({ title: str.errors.title, message: msg, buttons: [{ label: 'OK' }] });
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
      const msg = err instanceof Error ? err.message : str.errors.googleFailed;
      confirm({ title: str.errors.title, message: msg, buttons: [{ label: 'OK' }] });
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>{str.appName}</Text>
      <Text style={styles.subtitle}>
        {mode === 'reset' ? str.signIn.subtitle.reset
          : mode === 'email-code' ? str.signIn.subtitle.emailCode
          : str.signIn.subtitle.password}
      </Text>

      <InstallBanner />

      {mode === 'password' && (
        <>
          <TextInput
            style={styles.input}
            placeholder={str.placeholders.email}
            placeholderTextColor="#a8a29e"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder={str.placeholders.password}
            placeholderTextColor="#a8a29e"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Pressable style={styles.button} onPress={handleEmailSignIn} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{str.signIn.buttons.signIn}</Text>}
          </Pressable>

          <View style={styles.altRow}>
            <Pressable onPress={() => switchMode('reset')} hitSlop={6}>
              <Text style={styles.linkSmall}>{str.signIn.links.forgotPassword}</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => switchMode('email-code')}>
            <Text style={styles.link}>{str.signIn.links.backToCodeSignIn}</Text>
          </Pressable>
        </>
      )}

      {(mode === 'email-code' || mode === 'reset') && (
        <>
          {!codeSent ? (
            <>
              <Text style={styles.helpText}>
                {mode === 'email-code'
                  ? str.signIn.helpText.emailCode
                  : str.signIn.helpText.reset}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={str.placeholders.email}
                placeholderTextColor="#a8a29e"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <Pressable style={styles.button} onPress={handleSendCode} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{str.signIn.buttons.sendCode}</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.helpText}>{str.signIn.helpText.codeSentTo(email)}</Text>
              <TextInput
                style={styles.input}
                placeholder={str.placeholders.codeFromEmail}
                placeholderTextColor="#a8a29e"
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
              />
              {mode === 'reset' && (
                <TextInput
                  style={styles.input}
                  placeholder={str.placeholders.newPassword}
                  placeholderTextColor="#a8a29e"
                  secureTextEntry
                  value={resetNewPassword}
                  onChangeText={setResetNewPassword}
                  textContentType="newPassword"
                  autoComplete="new-password"
                />
              )}
              <Pressable style={styles.button} onPress={handleVerifyCode} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.buttonText}>{mode === 'reset' ? str.signIn.buttons.resetAndSignIn : str.signIn.buttons.signIn}</Text>}
              </Pressable>
            </>
          )}

          {mode === 'email-code' && !codeSent && (
            <>
              <Pressable style={[styles.button, styles.googleButton]} onPress={handleGoogleSignIn}>
                <Text style={styles.buttonText}>{str.signIn.buttons.continueWithGoogle}</Text>
              </Pressable>

              <View style={styles.altRow}>
                <Pressable onPress={() => switchMode('password')} hitSlop={6}>
                  <Text style={styles.linkSmall}>{str.signIn.links.signInWithPassword}</Text>
                </Pressable>
              </View>

              <Pressable onPress={() => router.push('/(auth)/sign-up')}>
                <Text style={styles.link}>{str.signIn.links.noAccount}</Text>
              </Pressable>
            </>
          )}

          {mode === 'reset' && (
            <Pressable onPress={() => switchMode('email-code')}>
              <Text style={styles.link}>{str.signIn.links.backToSignIn}</Text>
            </Pressable>
          )}
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
    backgroundColor: '#4e7a5e',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  googleButton: { backgroundColor: '#ea4335' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#4e7a5e', marginTop: 8 },
  linkSmall: { color: '#78716c', fontSize: 13 },
  altRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 8, flexWrap: 'wrap' },
  altSep: { color: '#d6d3d1', fontSize: 13 },
  helpText: { fontSize: 14, color: '#78716c', textAlign: 'center', marginBottom: 16 },
});
