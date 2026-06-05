import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SecureStore from '../src/lib/secureStorage';
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
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

// Lock app text to designed size regardless of OS "larger text" setting.
// Tablet sizing is handled separately via useTablet().fs() so we don't lose tablet scaling.
(Text as unknown as { defaultProps?: { allowFontScaling?: boolean } }).defaultProps =
  (Text as unknown as { defaultProps?: { allowFontScaling?: boolean } }).defaultProps || {};
(Text as unknown as { defaultProps: { allowFontScaling?: boolean } }).defaultProps.allowFontScaling = false;
(TextInput as unknown as { defaultProps?: { allowFontScaling?: boolean } }).defaultProps =
  (TextInput as unknown as { defaultProps?: { allowFontScaling?: boolean } }).defaultProps || {};
(TextInput as unknown as { defaultProps: { allowFontScaling?: boolean } }).defaultProps.allowFontScaling = false;

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
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: '#111827', zIndex: 1000 }}
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
  // Visa välkomst-modalen EN gång efter att användaren har signat in OCH valt
  // hushåll. Flagga sparas i SecureStore (seen-welcome-tip). Tips blockeras
  // via welcomeReady-gaten i providern tills användaren har dismissat modalen.
  const [welcomeState, setWelcomeState] = useState<'loading' | 'show' | 'done'>('loading');

  useEffect(() => {
    if (!isLoaded || householdLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inSetup = segments[0] === 'household';
    // Publika sidor — NavigationGuard ska inte tvinga inloggning där.
    // /install: APK-nedladdning + PWA-instruktioner.
    // /privacy, /terms: juridiska sidor som måste vara läsbara utan konto.
    // Cast:ar segments[0] till string eftersom Expo Routers auto-genererade
    // typer inte plockar upp nya filer förrän en build körts.
    const root = segments[0] as string;
    const isPublic = root === 'install' || root === 'privacy' || root === 'terms';
    if (isPublic) return;

    if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (isSignedIn && inAuthGroup) {
      router.replace(householdId ? '/(tabs)/schedule' : '/household/setup');
    } else if (isSignedIn && inSetup && householdId) {
      router.replace('/(tabs)/schedule');
    } else if (isSignedIn && !inAuthGroup && !householdId && !inSetup) {
      router.replace('/household/setup');
    }
  }, [isLoaded, isSignedIn, householdId, householdLoading, segments]);

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
      <Stack screenOptions={{ headerShown: false }} />
      <WelcomeModal
        visible={welcomeState === 'show'}
        onContinue={markWelcomeSeen}
        onSkipAll={async () => { await setSkipAll(true); await markWelcomeSeen(); }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
