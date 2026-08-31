import '../src/lib/diagFetch'; // DIAG: MÅSTE ligga före clerk-expo (patchar fetch)
import { ClerkProvider, useAuth, useClerk } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { resourceCache } from '@clerk/clerk-expo/resource-cache';
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

// SESSIONS-FIX (2026-08-30): prod-instansen skapade en NY Clerk-klient vid varje
// omstart (verifierat via Clerk API: 15 sessioner = 15 unika client_id) → den
// sparade client-token:en återställde aldrig klienten → /touch → signed_out →
// utloggad varje start. Den handrullade tokenCache:n räckte inte. Vi använder nu
// Clerks OFFICIELLA tokenCache + __experimental_resourceCache som persisterar
// själva KLIENT-resursen (inte bara token:en) lokalt och hydrerar den vid start.

// DIAG (temp): vilken Clerk-instans kör appen faktiskt? pk_test = dev-instans
// (=.env läckt in), pk_live = prod. Om native råkat på pk_test men PWA på pk_live
// → instans-split → sessionen persisterar inte. Fyrar en gång vid modul-load.
reportClientError('DIAG: Clerk-instans', { pk: (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'SAKNAS').slice(0, 12) });


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
          __experimental_resourceCache={resourceCache}
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
