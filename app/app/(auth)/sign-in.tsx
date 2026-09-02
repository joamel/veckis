import { useMemo } from 'react';
import { useTheme } from '../../src/context/ThemeContext';
import type { Palette } from '../../src/lib/theme';
import { useSignIn, useSignUp } from '@clerk/expo/legacy'; // v2-kompatibelt API (create/setActive) på v4-kärnan
import { useSignInWithGoogle } from '@clerk/expo/google';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';

const LOGO = require('../../assets/icon.png');
const GOOGLE_G = require('../../assets/google-g.png');

// Krävs för att OAuth-webbläsarsessionen ska slutföras och lämna tillbaka
// resultatet till appen. Utan detta hänger Google-login på "spinner" efter att
// man valt konto (webbläsaren stängs aldrig / promisen resolvar aldrig).
WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { signIn, setActive, isLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
  const confirm = useConfirm();

  // Värm upp webbläsaren (Android) för stabilare OAuth-flöde. Bara native —
  // warmUpAsync/coolDownAsync finns inte på web och kastar där.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);


  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
  // Enhetligt mejlflöde: samma e-postkod loggar in ETT befintligt konto eller
  // skapar ett NYTT (lösenordsfritt). isNewAccount avgör vilket Clerk-anrop
  // verifieringssteget kör.
  const [isNewAccount, setIsNewAccount] = useState(false);

  function switchMode(next: 'password' | 'email-code' | 'reset') {
    setMode(next);
    setCodeSent(false);
    setCode('');
    setResetNewPassword('');
    setIsNewAccount(false);
  }

  /** Clerk-fel för "hittade inget konto med den identifieraren". */
  function isIdentifierNotFound(e: unknown): boolean {
    return typeof e === 'object' && e !== null && 'errors' in e
      && Array.isArray((e as { errors?: unknown }).errors)
      && (e as { errors: { code?: string }[] }).errors.some(x => x?.code === 'form_identifier_not_found');
  }

  async function handleEmailSignIn() {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      reportClientError('PASSWORD_SIGNIN_RESULT', { email, status: result.status });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      } else {
        // Icke-complete → visa vad som saknas i stället för tyst setActive(null)
        // (som förr bara "laddade men gjorde inget"). Vanligast: 2FA på kontot.
        const needs2fa = result.status === 'needs_second_factor';
        confirm({
          title: str.errors.title,
          message: needs2fa
            ? 'Kontot har tvåstegsverifiering på. Logga in med Google, eller stäng av 2FA på kontot.'
            : `Inloggningen slutfördes inte (status: ${result.status ?? 'okänd'}).`,
          buttons: [{ label: 'OK' }],
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : str.errors.signInFailed;
      confirm({ title: str.errors.title, message: msg, buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }

  /** Skicka kod till mail. Används av både 'email-code' och 'reset'. */
  async function handleSendCode() {
    if (!isLoaded || !signUpLoaded || !email.trim()) {
      confirm({ title: str.errors.emailMissing.title, message: str.errors.emailMissing.message, buttons: [{ label: 'OK' }] });
      return;
    }
    setLoading(true);
    try {
      if (mode === 'reset') {
        await signIn.create({ strategy: 'reset_password_email_code', identifier: email });
        setCodeSent(true);
        return;
      }
      // Enhetligt mejlflöde. Försök först logga in ett BEFINTLIGT konto med
      // passwordless email_code; hittas inget konto skapar vi ett NYTT och
      // verifierar med samma sorts kod. Användaren ser ingen skillnad.
      try {
        const attempt = await signIn.create({ identifier: email });
        const factor = attempt.supportedFirstFactors?.find(f => f.strategy === 'email_code');
        if (!factor || !('emailAddressId' in factor)) {
          throw new Error(str.errors.codeSignInUnavailable);
        }
        await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
        setIsNewAccount(false);
      } catch (e) {
        if (!isIdentifierNotFound(e)) throw e;
        // Nytt konto → skapa lösenordsfritt och skicka verifieringskod.
        await signUp.create({ emailAddress: email });
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setIsNewAccount(true);
      }
      setCodeSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : str.errors.sendCodeFailed;
      confirm({ title: str.errors.title, message: msg, buttons: [{ label: 'OK' }] });
    } finally {
      setLoading(false);
    }
  }

  /** Verifiera koden. Nytt konto → signUp-verifiering; befintligt → signIn.
   *  'reset' → sätter nytt lösenord. Alla vägar landar i appen (setActive). */
  async function handleVerifyCode() {
    if (!isLoaded || !signUpLoaded) return;
    if (mode === 'reset' && resetNewPassword.length < 8) {
      confirm({ title: str.errors.passwordTooShort.title, message: str.errors.passwordTooShort.message, buttons: [{ label: 'OK' }] });
      return;
    }
    setLoading(true);
    try {
      if (mode === 'email-code' && isNewAccount) {
        const result = await signUp.attemptEmailAddressVerification({ code });
        if (result.status === 'complete') {
          await setActive({ session: result.createdSessionId });
        }
      } else {
        const result = await signIn.attemptFirstFactor(
          mode === 'reset'
            ? { strategy: 'reset_password_email_code', code, password: resetNewPassword }
            : { strategy: 'email_code', code },
        );
        if (result.status === 'complete') {
          await setActive({ session: result.createdSessionId });
        }
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
      // Webb: Clerks redirect-flöde
      if (Platform.OS === 'web') {
        if (!isLoaded) return;
        await signIn.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: '/sso-callback',
          redirectUrlComplete: '/',
        });
        return;
      }
      // Native: Clerks native Google Sign-In hook
      if (Platform.OS === 'web') return; // Web handled above
      setLoading(true);
      const { createdSessionId, setActive: setClerkSession } = await startGoogleAuthenticationFlow();
      if (createdSessionId && setClerkSession) {
        await setClerkSession({ session: createdSessionId });
      }
    } catch (err: any) {
      if (err?.code === 'SIGN_IN_CANCELLED' || err?.code === '-5') {
        setLoading(false);
        return;
      }
      const msg = err?.message ?? str.errors.googleFailed;
      Alert.alert(str.errors.title, msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Image source={LOGO} style={styles.logo} resizeMode="cover" />
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
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <View style={styles.pwWrap}>
            <TextInput
              style={[styles.input, styles.pwInput]}
              placeholder={str.placeholders.password}
              placeholderTextColor={c.textFaint}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              style={styles.pwEye}
              onPress={() => setShowPassword(v => !v)}
              hitSlop={8}
              accessibilityLabel={showPassword ? str.signIn.a11y.hidePassword : str.signIn.a11y.showPassword}
            >
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={c.textFaint} />
            </Pressable>
          </View>

          <Pressable style={styles.button} onPress={handleEmailSignIn} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{str.signIn.buttons.signIn}</Text>}
          </Pressable>

          <View style={styles.altRow}>
            <Pressable onPress={() => switchMode('reset')} hitSlop={6}>
              {/* Explicit bredd → Android klipper annars sista glyfen ("?"). */}
              <Text style={[styles.linkSmall, { width: str.signIn.links.forgotPassword.length * 8 + 10, textAlign: 'center' }]}>
                {str.signIn.links.forgotPassword}
              </Text>
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
                placeholderTextColor={c.textFaint}
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
                placeholderTextColor={c.textFaint}
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
              />
              {mode === 'reset' && (
                <TextInput
                  style={styles.input}
                  placeholder={str.placeholders.newPassword}
                  placeholderTextColor={c.textFaint}
                  secureTextEntry
                  value={resetNewPassword}
                  onChangeText={setResetNewPassword}
                  textContentType="newPassword"
                  autoComplete="new-password"
                />
              )}
              <Pressable style={styles.button} onPress={handleVerifyCode} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.buttonText}>{mode === 'reset' ? str.signIn.buttons.resetAndSignIn : isNewAccount ? str.signIn.buttons.createAccount : str.signIn.buttons.signIn}</Text>}
              </Pressable>
            </>
          )}

          {mode === 'email-code' && !codeSent && (
            <>
              <Pressable style={[styles.button, styles.googleButton]} onPress={handleGoogleSignIn}>
                <Image source={GOOGLE_G} style={styles.googleLogo} resizeMode="contain" />
                <Text style={styles.googleButtonText}>{str.signIn.buttons.continueWithGoogle}</Text>
              </Pressable>

              <Pressable onPress={() => switchMode('password')} hitSlop={6}>
                <Text style={styles.link}>{str.signIn.links.signInWithPassword}</Text>
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

const makeStyles = (c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: c.surface,
  },
  logo: { width: 88, height: 88, borderRadius: 20, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 40, fontFamily: 'Baloo2', color: c.primary, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: c.textMuted, textAlign: 'center', marginBottom: 32 },
  input: { color: c.text,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  pwWrap: { position: 'relative', justifyContent: 'center' },
  pwInput: { paddingRight: 48 },
  // top:0/bottom:12 centrerar knappen på själva fältet (input har marginBottom:12).
  pwEye: { position: 'absolute', right: 6, top: 0, bottom: 12, justifyContent: 'center', paddingHorizontal: 8 },
  button: {
    backgroundColor: c.primary,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  // Google-knappen följer Googles mönster: vit/neutral yta, grå ram, mörk text
  // + Google-loggan — inte en helröd knapp. Vit yta funkar mot både ljust och
  // mörkt tema.
  googleButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dadce0', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  googleLogo: { width: 18, height: 18 },
  googleButtonText: { color: '#3c4043', fontSize: 16, fontWeight: '600' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: c.primary, marginTop: 8 },
  linkSmall: { color: c.textMuted, fontSize: 13 },
  altRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 8, flexWrap: 'wrap' },
  altSep: { color: c.border, fontSize: 13 },
  helpText: { fontSize: 14, color: c.textMuted, textAlign: 'center', marginBottom: 16 },
});
