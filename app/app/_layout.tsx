import { ClerkProvider, useAuth, useClerk } from '@clerk/clerk-expo';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SecureStore from '../src/lib/secureStorage';
import { reportClientError } from '../src/lib/errorReport';
import { createElement, forwardRef, useEffect, useState, type ComponentType } from 'react';
import { Platform, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useTablet } from '../src/hooks/useTablet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { HouseholdProvider, useHousehold } from '../src/context/HouseholdContext';
import { PendingRemovalProvider } from '../src/context/PendingRemovalContext';
import { ToastProvider } from '../src/context/ToastContext';
import { ConfirmProvider } from '../src/context/ConfirmContext';
import { SpotlightTipProvider, useWelcomeGate } from '../src/context/SpotlightTipContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { WelcomeModal } from '../src/components/WelcomeModal';
import { VersionBanner } from '../src/components/VersionBanner';
import { WakeupIndicator } from '../src/components/WakeupIndicator';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { installGlobalErrorHandler } from '../src/lib/errorReport';
import { getLandingTab, type LandingTabKey } from '../src/lib/landingTab';
import { AnimatedSplash } from '../src/components/AnimatedSplash';
import * as WebBrowser from 'expo-web-browser';
import { useFonts } from 'expo-font';

// Slutför en ev. väntande OAuth-webbläsarsession vid app-start. MÅSTE ligga i
// roten (körs oavsett vilken skärm appen öppnas till via djuplänken) — annars
// returnerar native Google-login utan session (createdSessionId null → snurrar).
WebBrowser.maybeCompleteAuthSession();

// Lock app text to designed size regardless of OS "larger text" setting.
// Tablet sizing is handled separately via useTablet().fs() so we don't lose tablet scaling.
// OBS: React 19 ignorerar defaultProps på funktionskomponenter, så gamla
// `Text.defaultProps.allowFontScaling = false` är en tyst no-op — texter klipps
// då mystiskt ("kg" → "k") på enheter med uppskalad OS-textstorlek. Istället
// wrappas react-native-exporten; Babels CJS-interop läser `.Text` per användning
// så gettern slår igenom i hela appen.
/* eslint-disable @typescript-eslint/no-require-imports */
const RNModule = require('react-native') as Record<string, unknown>;
for (const name of ['Text', 'TextInput'] as const) {
  const Orig = RNModule[name] as ComponentType<{ allowFontScaling?: boolean }> & { __fontScalingLocked?: boolean };
  if (!Orig || Orig.__fontScalingLocked) continue;
  // forwardRef är kritiskt: utan det droppas ref på Text/TextInput tyst, vilket
  // bryter allt som mäter (onboarding-tips) eller fokuserar (KAV, autofokus) via
  // ref. allowFontScaling sätts som default men kan överridas av explicit prop.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Wrapped = forwardRef<unknown, Record<string, unknown>>((props, ref) =>
    createElement(Orig as any, { allowFontScaling: false, ...props, ref }));
  Wrapped.displayName = name;
  (Wrapped as { __fontScalingLocked?: boolean }).__fontScalingLocked = true;
  try {
    Object.defineProperty(RNModule, name, { configurable: true, get: () => Wrapped });
  } catch {
    // Om exporten inte går att skriva över: behåll originalet (skalning på, men appen fungerar).
  }
}

// Android: expo-secure-store har en 2048-byte-gräns per värde. Clerks session-JWT
// (med claims) kan överskrida den → setItemAsync failar TYST → sessionen droppar
// och native-appen loggar ut (web opåverkad — localStorage har ingen gräns). Fix:
// chunka token:en över flera nycklar så inget enskilt värde passerar gränsen.
// Ren JS (körs i tokenCache) → OTA-fixbart, ingen native-build. Befintliga
// (ochunkade) värden läses bakåtkompatibelt.
const TOKEN_CHUNK = 1800;
const tokenCache = {
  async getToken(key: string) {
    const head = await SecureStore.getItemAsync(key);
    let result: string | null;
    if (head === null || !head.startsWith('__chunks:')) {
      result = head;
    } else {
      const n = parseInt(head.slice(9), 10);
      let out = '';
      let ok = true;
      for (let i = 0; i < n; i++) {
        const part = await SecureStore.getItemAsync(`${key}.${i}`);
        if (part === null) { ok = false; break; }
        out += part;
      }
      result = ok ? out : null;
    }
    reportClientError('DIAG: tokenCache.getToken', { key, present: result !== null, len: result?.length ?? 0 });
    return result;
  },
  async saveToken(key: string, value: string) {
    reportClientError('DIAG: tokenCache.saveToken', { key, len: value.length, willChunk: value.length > TOKEN_CHUNK });
    try {
      if (value.length <= TOKEN_CHUNK) {
        await SecureStore.setItemAsync(key, value);
        return;
      }
      const n = Math.ceil(value.length / TOKEN_CHUNK);
      for (let i = 0; i < n; i++) {
        await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * TOKEN_CHUNK, (i + 1) * TOKEN_CHUNK));
      }
      // Markören sparas SIST → getToken läser aldrig en markör utan sina chunks.
      await SecureStore.setItemAsync(key, `__chunks:${n}`);
    } catch (e) {
      reportClientError('DIAG: tokenCache.saveToken FEL', { key, len: value.length, err: e instanceof Error ? e.message : String(e) });
    }
  },
};

// DIAG (temp): vilken Clerk-instans kör appen faktiskt? pk_test = dev-instans
// (=.env läckt in), pk_live = prod. Om native råkat på pk_test men PWA på pk_live
// → instans-split → sessionen persisterar inte. Fyrar en gång vid modul-load.
reportClientError('DIAG: Clerk-instans', { pk: (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'SAKNAS').slice(0, 12) });

// DIAG (temp): avlyssna Clerks native FAPI /client-anrop och logga EXAKT vad
// servern returnerar vid omstart (sessions-antal + ev. felkod). Det avgör om
// prod tappar sessionen server-side eller om den finns men klienten tappar den.
// Patchar global.fetch (clerk-headless använder den). Native-only.
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = global as any;
  const origFetch = g.fetch;
  g.fetch = async (input: unknown, init?: { method?: string }) => {
    const res = await origFetch(input, init);
    try {
      const url = typeof input === 'string' ? input : (input as { url?: string })?.url ?? '';
      if (url.includes('clerk.') && url.includes('/client')) {
        const body = await res.clone().json().catch(() => null) as Record<string, unknown> | null;
        const client = (body?.response ?? body?.client) as { sessions?: unknown[] } | undefined;
        reportClientError('DIAG: FAPI /client-svar', {
          method: init?.method ?? 'GET',
          status: res.status,
          authHeader: res.headers.get('authorization') ? 'ja' : 'nej',
          sessions: Array.isArray(client?.sessions) ? client!.sessions!.length : -1,
          errorCode: (body?.errors as { code?: string }[] | undefined)?.[0]?.code ?? null,
          errorMsg: (body?.errors as { message?: string }[] | undefined)?.[0]?.message ?? null,
        });
      }
    } catch { /* DIAG får aldrig störa */ }
    return res;
  };
}

function StatusBarBackdrop() {
  const insets = useSafeAreaInsets();
  if (insets.top === 0) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: '#292524', zIndex: 1000 }}
    />
  );
}

function NavigationGuard() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const clerk = useClerk();
  const { householdId, isLoading: householdLoading } = useHousehold();
  const segments = useSegments();
  const router = useRouter();
  const { markWelcomeReady } = useWelcomeGate();
  const { colors: c } = useTheme();
  // Favorit-landningssida — läses innan första redirecten så användaren
  // hamnar direkt i sin valda flik istället för alltid kalendern.
  const [landingTab, setLandingTabState] = useState<LandingTabKey | null>(null);
  useEffect(() => { getLandingTab().then(setLandingTabState); }, []);
  // Visa koncept-guiden EN gång efter att användaren har signat in OCH valt
  // hushåll. Flagga sparas i SecureStore (seen-concept-walkthrough).
  const [welcomeState, setWelcomeState] = useState<'loading' | 'show' | 'done'>('loading');

  useEffect(() => {
    if (!isLoaded || householdLoading || landingTab === null) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inSetup = segments[0] === 'household';
    // Publika sidor — NavigationGuard ska inte tvinga inloggning där.
    // /install: APK-nedladdning + PWA-instruktioner.
    // /privacy, /terms: juridiska sidor som måste vara läsbara utan konto.
    // Cast:ar segments[0] till string eftersom Expo Routers auto-genererade
    // typer inte plockar upp nya filer förrän en build körts.
    const root = segments[0] as string;
    const isPublic = root === 'install' || root === 'privacy' || root === 'terms' || root === 'sso-callback' || root === 'delete-account';
    // /account + /preferences är djup-vyer öppnade från Profil-headern;
    // kräver login men ska inte redirect:as till tabs när hen är där.
    const isAuthedDeepRoute = (root === 'account' || root === 'preferences') && isSignedIn;
    // Kall-start på "/" (index-spinnern) — skicka till favorit-landningsfliken.
    const atRoot = !root || root === 'index';
    // Webb: utloggad besökare på "/" ska se den publika landningssidan (index.tsx
    // renderar <WebLanding/>), inte tvingas till login. Native behåller login-
    // redirect direkt. Krav för Googles OAuth-verifiering + marknadsföring.
    const showWebLanding = Platform.OS === 'web' && !isSignedIn && atRoot;
    if (isPublic || isAuthedDeepRoute || showWebLanding) return;

    if (!isSignedIn && !inAuthGroup) {
      // DECISIV DIAG: skiljer "servern tappade sessionen" (client.sessions tom)
      // från "guarden fyrar före hydrering" (clerk har en session men isSignedIn
      // hann inte bli true). userId/sessionId från useAuth; client.sessions =
      // vad prod-FAPI faktiskt returnerade för den lagrade client-JWT:n.
      reportClientError('DIAG: auth-guard → sign-in (utloggad)', {
        isLoaded, root, hadHousehold: !!householdId, landingTab,
        userId: userId ?? null, sessionId: sessionId ?? null,
        clerkClientSessions: clerk?.client?.sessions?.length ?? -1,
        clerkHasSession: !!clerk?.session, clerkStatus: clerk?.session?.status ?? null,
      });
      router.replace('/(auth)/sign-in');
    } else if (isSignedIn && inAuthGroup) {
      router.replace(householdId ? `/(tabs)/${landingTab}` as never : '/household/setup');
    } else if (isSignedIn && (inSetup || atRoot) && householdId) {
      router.replace(`/(tabs)/${landingTab}` as never);
    } else if (isSignedIn && !inAuthGroup && !householdId && !inSetup) {
      router.replace('/household/setup');
    }
  }, [isLoaded, isSignedIn, householdId, householdLoading, segments, landingTab]);

  // Koncept-guide — visa bara när användare är inne i appen (har hushåll, inte
  // i auth/setup) och flaggan inte är satt.
  useEffect(() => {
    if (!isSignedIn || !householdId) return;
    if (welcomeState !== 'loading') return;
    SecureStore.getItemAsync('seen-concept-walkthrough').then(v => {
      if (v === '1') {
        setWelcomeState('done');
        markWelcomeReady();
      } else {
        setWelcomeState('show');
      }
    }).catch(() => { setWelcomeState('done'); markWelcomeReady(); });
  }, [isSignedIn, householdId, welcomeState, markWelcomeReady]);

  const markWelcomeSeen = async () => {
    await SecureStore.setItemAsync('seen-concept-walkthrough', '1').catch(() => {});
    setWelcomeState('done');
    markWelcomeReady();
  };

  return (
    <>
      <VersionBanner />
      <WakeupIndicator />
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />
      <WelcomeModal visible={welcomeState === 'show'} onDone={markWelcomeSeen} />
    </>
  );
}

export default function RootLayout() {
  const { isTablet } = useTablet();
  // Brand-font (Baloo 2) för "Handlis"-ordmärket — laddas via OTA (expo-font-
  // modulen finns redan i bygget). Gate:ar tills laddad så ordmärket inte
  // flimrar in i systemfont först; faller igenom vid fel så appen aldrig fastnar.
  const [fontsLoaded, fontError] = useFonts({ Baloo2: require('../assets/fonts/Baloo2.ttf') });

  useEffect(() => { installGlobalErrorHandler(); }, []);

  // Lås telefoner till portrait; tablets får rotera fritt.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (isTablet) {
      ScreenOrientation.unlockAsync().catch(() => {});
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
  }, [isTablet]);

  // OBS: gate:a ALDRIG hela trädet på fontsLoaded här — det blockerar
  // ClerkProvider + /sso-callback-rutten medan fonten laddar, vilket bröt
  // Google-OAuth-återanropet (sessionen slutfördes aldrig → studs till login).
  // Fonten laddas ändå via useFonts; ordmärket byts från systemfont när klar.
  void fontsLoaded; void fontError;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
        <StatusBar style="light" />
        <StatusBarBackdrop />
        <ClerkProvider
          publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
          tokenCache={tokenCache}
        >
          <HouseholdProvider>
            <PendingRemovalProvider>
              <ToastProvider>
                <ConfirmProvider>
                  <SpotlightTipProvider>
                    <NavigationGuard />
                  </SpotlightTipProvider>
                </ConfirmProvider>
              </ToastProvider>
            </PendingRemovalProvider>
          </HouseholdProvider>
        </ClerkProvider>
        <AnimatedSplash />
        </ThemeProvider>
      </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
