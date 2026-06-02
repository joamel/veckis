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

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const router = useRouter();
  const confirm = useConfirm();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);

  async function handleSignUp() {
    if (!isLoaded) return;
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registrering misslyckades';
      confirm({ title: 'Fel', message: msg, buttons: [{ label: 'OK' }] });
    }
  }

  async function handleVerify() {
    if (!isLoaded) return;
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      await setActive({ session: result.createdSessionId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verifiering misslyckades';
      confirm({ title: 'Fel', message: msg, buttons: [{ label: 'OK' }] });
    }
  }

  if (pendingVerification) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Verifiera e-post</Text>
        <Text style={styles.subtitle}>Koden har skickats till {email}</Text>
        <TextInput
          style={styles.input}
          placeholder="Verifieringskod"
          placeholderTextColor="#9ca3af"
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
        />
        <Pressable style={styles.button} onPress={handleVerify}>
          <Text style={styles.buttonText}>Verifiera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Skapa konto</Text>
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
      <Pressable style={styles.button} onPress={handleSignUp}>
        <Text style={styles.buttonText}>Skapa konto</Text>
      </Pressable>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>Redan konto? Logga in</Text>
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
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#4f46e5', marginTop: 8 },
});
