import { useMemo } from 'react';
import { useTheme } from '../../src/context/ThemeContext';
import type { Palette } from '../../src/lib/theme';
import { useClerk, useSSO } from '@clerk/expo';
import { useSignIn, useSignUp } from '@clerk/expo/legacy'; // v2-kompatibelt API (create/setActive) på v4-kärnan
import * as AuthSession from 'expo-auth-session';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { reportClientError } from '../../src/lib/errorReport';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { InstallBanner } from '../../src/components/InstallBanner';
import { auth as str } from '../../src/lib/svenska';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';

const LOGO = require('../../assets/icon.png');
const GOOGLE_G = require('../../assets/google-g.png');

// Krävs för att OAuth-webbläsarsessionen ska slutföras och lämna tillbaka
// resultatet till appen. Utan detta hänger Google-login på "spinner" efter att
// man valt konto (webbläsaren stängs aldrig / promisen resolvar aldrig).
WebBrowser.maybeCompleteAuthSession();

// Redan hanterade OAuth-sessions-id:n → processa aldrig samma djuplänk två gånger
// (skydd mot att en redan förbrukad created_session_id/nonce körs igen).
const processedSsoSessions = new Set<string>();

// Native Google Sign-In (idToken-flöde). webClientId = Clerks Google Web-client.
// Skapar sessionen i native-clientens kontext (som e-post) → persisterar över
// omstart, till skillnad från WebBrowser/useSSO-flödet (session på browser-client).
if (Platform.OS !== 'web') {
  GoogleSignin.configure({ webClientId: '630229510172-97lh1jsdohiel0mgg0vec6r09gc77d6d.apps.googleusercontent.com' });
}

export default function SignInScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { signIn, setActive, isLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();
  const clerk = useClerk();
  const confirm = useConfirm();

  // Värm upp webbläsaren (Android) för stabilare OAuth-flöde. Bara native —
  // warmUpAsync/coolDownAsync finns inte på web och kastar där.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);

  // Android-fallback för Google-OAuth: Clerks redirect (handlis://…) öppnar ofta
  // appen i en NY task i stället för att lämna tillbaka till Custom Tab-sessionen,
  // så startSSOFlow ger 'dismiss' UTAN session. Men redirekten når appen som en
  // djuplänk med created_session_id + rotating_token_nonce. Vi roterar token
  // (syncar den nyskapade sessionen till klienten) och aktiverar den manuellt.
  const completeSsoFromUrl = useCallback(async (url: string | null) => {
    if (!url || !url.includes('created_session_id')) return;
    const qs = url.split('?')[1] ?? '';
    const pick = (key: string) => {
      const m = qs.match(new RegExp(`(?:^|&)${key}=([^&]*)`));
      return m ? decodeURIComponent(m[1]) : null;
    };
    const createdSessionId = pick('created_session_id');
    const nonce = pick('rotating_token_nonce');
    if (!createdSessionId || processedSsoSessions.has(createdSessionId)) return;
    processedSsoSessions.add(createdSessionId);
    try {
      const cl = () => (clerk.client as unknown as { id?: string; sessions?: unknown[] } | undefined);
      reportClientError('DIAG sso start', { hasNonce: !!nonce, sid: createdSessionId.slice(0, 10) });
      if (nonce) await clerk.client.reload({ rotatingTokenNonce: nonce });
      reportClientError('DIAG sso postReload', { clientId: cl()?.id ?? null, sessions: cl()?.sessions?.length ?? -1 });
      await clerk.setActive({ session: createdSessionId });
      reportClientError('DIAG sso postSetActive', { clientId: cl()?.id ?? null, sessions: cl()?.sessions?.length ?? -1, sessionId: clerk.session?.id ?? null });
      // OBS: plain client.reload() här var SKADLIG — den hämtade den gamla tomma
      // native-clienten och skrev över den bra (session-bärande). Borttagen.
      // Persistens av 3IjpnY sköts av clerkClientSync (fångar nonce-reload-svarets
      // Authorization-token) — DIAG i den verifierar.
      await clerk.session?.getToken({ skipCache: true }).catch(() => {});
      reportClientError('DIAG sso postPersist', { clientId: cl()?.id ?? null, sessions: cl()?.sessions?.length ?? -1 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : str.errors.googleFailed;
      confirm({ title: str.errors.title, message: msg, buttons: [{ label: 'OK' }] });
    }
  }, [clerk, confirm]);

  useEffect(() => {
    if (Platform.OS === 'web') return; // web slutför via /sso-callback, inte djuplänk
    // ENBART live 'url'-events (den faktiska OAuth-redirekten under flödet, alltid
    // färsk). Vi läser INTE Linking.getInitialURL() — den kan returnera en GAMMAL
    // handlis://?created_session_id=…-URL från en tidigare Google-inloggning, som
    // då kördes vid VARJE appstart → setActive med död session + förbrukad nonce →
    // blockerade ALL inloggning (lösen + Google). Den buggen tas bort här.
    const sub = Linking.addEventListener('url', ({ url }) => { void completeSsoFromUrl(url); });
    return () => sub.remove();
  }, [completeSsoFromUrl]);

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
      // Webb och native kräver OLIKA OAuth-flöden.
      if (Platform.OS === 'web') {
        // Webb: Clerks redirect-flöde → tillbaka till /sso-callback som slutför
        // sessionen. (native-useSSO/WebBrowser fungerar inte korrekt på webben.)
        if (!isLoaded) return;
        await signIn.authenticateWithRedirect({
          strategy: 'oauth_google',
          redirectUrl: '/sso-callback',
          redirectUrlComplete: '/',
        });
        return;
      }
      // Native: Google Sign-In → idToken → Clerk. Sessionen skapas i native-
      // clientens kontext (som e-post) → persisterar över omstart. Ersätter
      // WebBrowser/useSSO-flödet vars session hamnade på en browser-client.
      if (!isLoaded) return;
      await GoogleSignin.hasPlayServices();
      const info = await GoogleSignin.signIn();
      const idToken = (info as { data?: { idToken?: string | null }; idToken?: string | null }).data?.idToken
        ?? (info as { idToken?: string | null }).idToken ?? null;
      reportClientError('DIAG gidt', { hasIdToken: !!idToken });
      if (!idToken) return; // användaren avbröt eller ingen token
      // Clerks One Tap-metod hanterar sign-in ELLER sign-up + rätt client-kontext.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ck = clerk as any;
      const res = await ck.authenticateWithGoogleOneTap({ token: idToken });
      reportClientError('DIAG gidt clerk', { obj: res?.object ?? null, status: res?.status ?? null, sid: res?.createdSessionId ?? null, keys: res ? Object.keys(res).slice(0, 12) : null });
      // authenticateWithGoogleOneTap returnerar en signIn/signUp — slutför via callbacken.
      if (typeof ck.handleGoogleOneTapCallback === 'function') {
        await ck.handleGoogleOneTapCallback(res, {});
      } else if (res?.createdSessionId) {
        await setActive({ session: res.createdSessionId });
      }
      reportClientError('DIAG gidt done', { sessionId: clerk.session?.id ?? null });
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
