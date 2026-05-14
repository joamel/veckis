import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HouseholdProvider, useHousehold } from '../src/context/HouseholdContext';
import { ToastProvider } from '../src/context/ToastContext';

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

function NavigationGuard() {
  const { isLoaded, isSignedIn } = useAuth();
  const { householdId, isLoading: householdLoading } = useHousehold();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded || householdLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inSetup = segments[0] === 'household';

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

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider
          publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
          tokenCache={tokenCache}
        >
          <HouseholdProvider>
            <ToastProvider>
              <NavigationGuard />
            </ToastProvider>
          </HouseholdProvider>
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
