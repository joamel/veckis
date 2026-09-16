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
import { ThemeModeToggle } from '../../src/components/ThemeModeToggle';
import { auth as str } from '../../src/lib/svenska';
import { reportClientError } from '../../src/lib/errorReport';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ny, nyFont } from '../../src/lib/nyDesign';

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
  const insets = useSafeAreaInsets();

  // Värm upp webbläsaren (Android) för stabilare OAuth-flöde. Bara native —
  // warmUpAsync/coolDownAsync finns inte på web och kastar där.
  useEffect(() => {
    if (Platform.OS as any === 'web') return;
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
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
      } else {
        // Icke-complete → visa vad som saknas i stället för tyst setActive(null)
        // (som förr bara "laddade men gjorde inget"). Vanligast: 2FA på kontot.
        const needs2fa = result.status === 'needs_second_factor';
        reportClientError('DIAG: Email/lösen-inlogg ej complete', {
          status: result.status ?? null,
          supportedFirstFactors: (result as any).supportedFirstFactors ?? null,
          supportedSecondFactors: (result as any).supportedSecondFactors ?? null,
        });
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
      if (Platform.OS as any === 'web') {
        if (!isLoaded) return;
        await signIn.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: '/sso-callback',
          redirectUrlComplete: '/',
        });
        return;
      }
      // Native: Clerks native Google Sign-In hook
      if (Platform.OS as any === 'web') return; // Web handled above
      setLoading(true);
      const { createdSessionId, setActive: setClerkSession } = await startGoogleAuthenticationFlow();
      if (createdSessionId && setClerkSession) {
        await setClerkSession({ session: createdSessionId });
      } else {
        // DIAG: Credential Manager stängde städat men Clerk returnerade ingen
        // session — inget fel kastas i det läget (se @clerk/expo/google-källan),
        // så utan denna logg är felet osynligt i både app och Railway-loggar.
        reportClientError('DIAG: Google native flow gav ingen session', {
          hadCreatedSessionId: !!createdSessionId, hadSetActive: !!setClerkSession,
        });
      }
    } catch (err: any) {
      // DIAG: logga ALLTID, även "avbrutet"-fel — Android Credential Manager
      // kan kasta cancellation-formade fel även vid riktiga konfig-/auth-fel,
      // och den tidigare koden svalde dem helt tyst utan någon logg alls.
      reportClientError('DIAG: Google native flow error', {
        code: err?.code ?? null, message: err?.message ?? null, name: err?.name ?? null,
        clerkErrors: err?.errors ?? null, // ClerkAPIResponseError: longMessage/meta brukar avslöja tillåtna värden
      });
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
      behavior={Platform.OS as any === 'ios' ? 'padding' : undefined}
    >
      {/* Samma anatomi som appens ark: mörkgrönt huvud med logga, ordmärke
          och slogan, ljusgrön kropp med formuläret. Huvudet växer och skjuter ned kroppen, så den ljusgröna ytan bara
          blir så hög som formuläret. Tema-växlaren ligger överst, utanför den
          centrerade loggan. */}
      <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
        <ThemeModeToggle />
        <View style={styles.heroCenter}>
          <Image source={LOGO} style={styles.logo} resizeMode="cover" />
          <Text style={styles.title}>{str.appName}</Text>
          <Text style={styles.subtitle}>{str.tagline}</Text>
          <Text style={styles.subtitleSub}>{str.taglineSub}</Text>
        </View>
      </View>

      <View style={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.bodyTitle}>
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
              placeholderTextColor={ny.textDampad}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <View style={styles.pwWrap}>
              <TextInput
                style={[styles.input, styles.pwInput]}
                placeholder={str.placeholders.password}
                placeholderTextColor={ny.textDampad}
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
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={ny.textDampad} />
              </Pressable>
            </View>

            <Pressable style={styles.button} onPress={handleEmailSignIn} disabled={loading}>
              {loading ? <ActivityIndicator color={ny.skog} /> : <Text style={styles.buttonText}>{str.signIn.buttons.signIn}</Text>}
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
                  placeholderTextColor={ny.textDampad}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                <Pressable style={styles.button} onPress={handleSendCode} disabled={loading}>
                  {loading ? <ActivityIndicator color={ny.skog} /> : <Text style={styles.buttonText}>{str.signIn.buttons.sendCode}</Text>}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.helpText}>{str.signIn.helpText.codeSentTo(email)}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={str.placeholders.codeFromEmail}
                  placeholderTextColor={ny.textDampad}
                  keyboardType="number-pad"
                  value={code}
                  onChangeText={setCode}
                />
                {mode === 'reset' && (
                  <TextInput
                    style={styles.input}
                    placeholder={str.placeholders.newPassword}
                    placeholderTextColor={ny.textDampad}
                    secureTextEntry
                    value={resetNewPassword}
                    onChangeText={setResetNewPassword}
                    textContentType="newPassword"
                    autoComplete="new-password"
                  />
                )}
                <Pressable style={styles.button} onPress={handleVerifyCode} disabled={loading}>
                  {loading ? <ActivityIndicator color={ny.skog} />
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
      </View>
    </KeyboardAvoidingView>
  );
}

// Inloggningen är appens första intryck och följer den nya designen: mörkgrönt
// huvud med ordmärket i Outfit, ljusgrön kropp, lime huvudknapp med mörkgrön
// text. Designen har bara ljust läge än, så paletten `c` används inte här.
const makeStyles = (_c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: ny.skog },
  hero: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingBottom: 28 },
  heroCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  body: {
    backgroundColor: ny.kort,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  logo: { width: 88, height: 88, borderRadius: 22, marginTop: 8, marginBottom: 16 },
  // Outfit bär vikten i typsnittet — en fontWeight till ger reservtypsnitt.
  title: { fontSize: 40, fontFamily: nyFont.fet, letterSpacing: -1, color: ny.rubrikLjus, textAlign: 'center', alignSelf: 'stretch', marginBottom: 6 },
  subtitle: { fontSize: 16, color: ny.underrubrik, textAlign: 'center', alignSelf: 'stretch' },
  // Andra raden: mindre och svagare, så de tre orden förblir sloganen.
  subtitleSub: { fontSize: 14, color: ny.flikInaktiv, textAlign: 'center', alignSelf: 'stretch', marginTop: 4 },
  bodyTitle: { fontFamily: nyFont.fet, fontSize: 22, letterSpacing: -0.4, color: ny.skog, textAlign: 'center', marginBottom: 12 },
  input: {
    color: ny.text,
    backgroundColor: ny.ljus,
    borderWidth: 1,
    borderColor: ny.kontur,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  pwWrap: { position: 'relative', justifyContent: 'center' },
  pwInput: { paddingRight: 48 },
  // top:0/bottom:12 centrerar knappen på själva fältet (input har marginBottom:12).
  pwEye: { position: 'absolute', right: 6, top: 0, bottom: 12, justifyContent: 'center', paddingHorizontal: 8 },
  button: {
    backgroundColor: ny.lime,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  // Google-knappen följer Googles mönster: vit/neutral yta, grå ram, mörk text
  // + Google-loggan — inte en helröd knapp.
  googleButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dadce0', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  googleLogo: { width: 18, height: 18 },
  googleButtonText: { color: '#3c4043', fontSize: 16, fontWeight: '600' },
  buttonText: { color: ny.skog, fontSize: 16, fontFamily: nyFont.halvfet },
  link: { textAlign: 'center', color: ny.skog, fontWeight: '600', marginTop: 8 },
  linkSmall: { color: ny.textDampad, fontSize: 13 },
  altRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 8, flexWrap: 'wrap' },
  helpText: { fontSize: 14, color: ny.textDampad, textAlign: 'center', marginBottom: 16 },
});
