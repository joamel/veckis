import { useSignUp } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useConfirm } from '../../src/context/ConfirmContext';
import { auth as str } from '../../src/lib/svenska';

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const confirm = useConfirm();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);

  // Klient-side-validering innan Clerk-anropet, så användaren får ett tydligt
  // svar (matchande lösenord, minimi-längd) istället för ett kryptiskt
  // Clerk-meddelande som "Password is not strong enough".
  const passwordsMatch = password.length > 0 && password === passwordConfirm;
  const passwordLongEnough = password.length >= 8;
  const canSubmit = email.includes('@') && passwordLongEnough && passwordsMatch;

  async function handleSignUp() {
    if (!isLoaded) return;
    if (!passwordsMatch) {
      confirm({ title: str.errors.passwordsDontMatch.title, message: str.errors.passwordsDontMatch.message, buttons: [{ label: 'OK' }] });
      return;
    }
    if (!passwordLongEnough) {
      confirm({ title: str.errors.passwordTooShort.title, message: str.errors.passwordTooShort.message, buttons: [{ label: 'OK' }] });
      return;
    }
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : str.errors.signUpFailed;
      confirm({ title: str.errors.title, message: msg, buttons: [{ label: 'OK' }] });
    }
  }

  async function handleVerify() {
    if (!isLoaded) return;
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      await setActive({ session: result.createdSessionId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : str.errors.verifyFailed;
      confirm({ title: str.errors.title, message: msg, buttons: [{ label: 'OK' }] });
    }
  }

  if (pendingVerification) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{str.signUp.verifyTitle}</Text>
        <Text style={styles.subtitle}>{str.signUp.codeSentTo(email)}</Text>
        <TextInput
          style={styles.input}
          placeholder={str.placeholders.verificationCode}
          placeholderTextColor="#a8a29e"
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
        />
        <Pressable style={styles.button} onPress={handleVerify}>
          <Text style={styles.buttonText}>{str.signUp.buttons.verify}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>{str.signUp.title}</Text>
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
        placeholder={str.placeholders.signUpPassword}
        placeholderTextColor="#a8a29e"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        textContentType="newPassword"
        autoComplete="new-password"
      />
      <TextInput
        style={[styles.input, passwordConfirm.length > 0 && !passwordsMatch && styles.inputError]}
        placeholder={str.placeholders.confirmPassword}
        placeholderTextColor="#a8a29e"
        secureTextEntry
        value={passwordConfirm}
        onChangeText={setPasswordConfirm}
        textContentType="newPassword"
        autoComplete="new-password"
      />
      {passwordConfirm.length > 0 && !passwordsMatch && (
        <Text style={styles.errorText}>{str.errors.passwordsMismatchInline}</Text>
      )}
      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={handleSignUp}
        disabled={!canSubmit}
      >
        <Text style={styles.buttonText}>{str.signUp.buttons.createAccount}</Text>
      </Pressable>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>{str.signUp.links.alreadyHaveAccount}</Text>
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
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 },
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
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  inputError: { borderColor: '#ef4444' },
  errorText: { color: '#ef4444', fontSize: 13, marginTop: -8, marginBottom: 12, marginLeft: 4 },
  link: { textAlign: 'center', color: '#4e7a5e', marginTop: 8 },
});
