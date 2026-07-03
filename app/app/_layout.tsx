import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SecureStore from '../src/lib/secureStorage';
import { createElement, useEffect, useState, type ComponentType } from 'react';
import { Platform, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useTablet } from '../src/hooks/useTablet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { HouseholdProvider, useHousehold } from '../src/context/HouseholdContext';
import { MemberFilterProvider } from '../src/context/MemberFilterContext';
import { PendingRemovalProvider } from '../src/context/PendingRemovalContext';
import { ToastProvider } from '../src/context/ToastContext';
import { ConfirmProvider } from '../src/context/ConfirmContext';
import { SpotlightTipProvider, useOnboardingMaster, useWelcomeGate } from '../src/context/SpotlightTipContext';
import { WelcomeModal } from '../src/components/WelcomeModal';
import { VersionBanner } from '../src/components/VersionBanner';
import { WakeupIndicator } from '../src/components/WakeupIndicator';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { installGlobalErrorHandler } from '../src/lib/errorReport';
import { getLandingTab, type LandingTabKey } from '../src/lib/landingTab';
import { AnimatedSplash } from '../src/components/AnimatedSplash';

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
  const Wrapped = (props: Record<string, unknown>) => createElement(Orig, { allowFontScaling: false, ...props });
  Wrapped.displayName = name;
  (Wrapped as { __fontScalingLocked?: boolean }).__fontScalingLocked = true;
  try {
    Object.defineProperty(RNModule, name, { configurable: true, get: () => Wrapped });
  } catch {
    // Om exporten inte går att skriva över: behåll originalet (skalning på, men appen fungerar).
  }
}

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

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
  const { isLoaded, isSignedIn } = useAuth();
  const { householdId, isLoading: householdLoading } = useHousehold();
  const segments = useSegments();
  const router = useRouter();
  const { setSkipAll } = useOnboardingMaster();
  const { markWelcomeReady } = useWelcomeGate();
  // Favorit-landningssida — läses innan första redirecten så användaren
  // hamnar direkt i sin valda flik istället för alltid kalendern.
  const [landingTab, setLandingTabState] = useState<LandingTabKey | null>(null);
  useEffect(() => { getLandingTab().then(setLandingTabState); }, []);
  // Visa välkomst-modalen EN gång efter att användaren har signat in OCH valt
  // hushåll. Flagga sparas i SecureStore (seen-welcome-tip). Tips blockeras
  // via welcomeReady-gaten i providern tills användaren har dismissat modalen.
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
    const isPublic = root === 'install' || root === 'privacy' || root === 'terms';
    // /account + /preferences är djup-vyer öppnade från Profil-headern;
    // kräver login men ska inte redirect:as till tabs när hen är där.
    const isAuthedDeepRoute = (root === 'account' || root === 'preferences') && isSignedIn;
    if (isPublic || isAuthedDeepRoute) return;

    // Kall-start på "/" (index-spinnern) — skicka till favorit-landningsfliken.
    const atRoot = !root || root === 'index';

    if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (isSignedIn && inAuthGroup) {
      router.replace(householdId ? `/(tabs)/${landingTab}` as never : '/household/setup');
    } else if (isSignedIn && (inSetup || atRoot) && householdId) {
      router.replace(`/(tabs)/${landingTab}` as never);
    } else if (isSignedIn && !inAuthGroup && !householdId && !inSetup) {
      router.replace('/household/setup');
    }
  }, [isLoaded, isSignedIn, householdId, householdLoading, segments, landingTab]);

  // Välkomstmodal — visa bara när användare är inne i appen (har hushåll, inte
  // i auth/setup) och flaggan inte är satt.
  useEffect(() => {
    if (!isSignedIn || !householdId) return;
    if (welcomeState !== 'loading') return;
    SecureStore.getItemAsync('seen-welcome-tip').then(v => {
      if (v === '1') {
        // Flaggan satt → ingen modal, släpp gaten direkt så tips kan börja fyra.
        setWelcomeState('done');
        markWelcomeReady();
      } else {
        // Modal ska visas — gaten förblir stängd tills användaren dismissar.
        setWelcomeState('show');
      }
    }).catch(() => { setWelcomeState('done'); markWelcomeReady(); });
  }, [isSignedIn, householdId, welcomeState, markWelcomeReady]);

  const markWelcomeSeen = async () => {
    await SecureStore.setItemAsync('seen-welcome-tip', '1').catch(() => {});
    setWelcomeState('done');
    markWelcomeReady();
  };

  return (
    <>
      <VersionBanner />
      <WakeupIndicator />
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#faf8f3' } }} />
      <WelcomeModal
        visible={welcomeState === 'show'}
        onContinue={markWelcomeSeen}
        onSkipAll={async () => { await setSkipAll(true); await markWelcomeSeen(); }}
      />
    </>
  );
}

export default function RootLayout() {
  const { isTablet } = useTablet();

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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <StatusBarBackdrop />
        <ClerkProvider
          publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
          tokenCache={tokenCache}
        >
          <HouseholdProvider>
            <MemberFilterProvider>
              <PendingRemovalProvider>
                <ToastProvider>
                  <ConfirmProvider>
                    <SpotlightTipProvider>
                      <NavigationGuard />
                    </SpotlightTipProvider>
                  </ConfirmProvider>
                </ToastProvider>
              </PendingRemovalProvider>
            </MemberFilterProvider>
          </HouseholdProvider>
        </ClerkProvider>
        <AnimatedSplash />
      </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
