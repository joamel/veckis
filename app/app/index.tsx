import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { useAuth } from '@clerk/expo';
import { useTheme } from '../src/context/ThemeContext';
import { useHousehold } from '../src/context/HouseholdContext';
import { WebLanding } from '../src/components/WebLanding';
import { Pressable } from '../src/components/Pressable';
import { common } from '../src/lib/svenska';

const SLOW_AFTER_MS = 15000;

// Entry point. På webben ser en utloggad besökare den publika landningssidan
// (marknadsföring + Googles OAuth-verifiering kräver publik hemsida). Native +
// inloggade hanteras av NavigationGuard i _layout.tsx (redirect till login/tabs).
//
// Snurran här får aldrig vara en återvändsgränd: misslyckas hämtningen av
// hushållet (dött nät, utgången inloggning) redirectar NavigationGuard inte
// alls. Därför visas ett besked och en väg vidare.
export default function Index() {
  const { colors: c } = useTheme();
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { loadFailed, loadFailReason, refresh } = useHousehold();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (Platform.OS as any === 'web' && isLoaded && !isSignedIn) {
    return <WebLanding />;
  }

  const sessionExpired = !!isSignedIn && loadFailed && loadFailReason === 'session';
  const message = sessionExpired
    ? common.startup.sessionExpired
    : isSignedIn && loadFailed ? common.startup.failed
    : slow ? common.startup.slow
    : null;

  // Blir Clerk aldrig klar, eller nekar servern sessionen, hjälper en omstart
  // (då läser Clerk in sessionen på nytt och loggar ut om den verkligen gått ut).
  const restart = () => {
    if (Platform.OS === 'web') { (globalThis as any).location?.reload?.(); return; }
    Updates.reloadAsync().catch(() => {});
  };
  const retry = () => {
    if (isLoaded && !sessionExpired) { refresh(); return; }
    restart();
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background, gap: 16, padding: 24 }}>
      {!sessionExpired && <ActivityIndicator size="large" color={c.primary} />}
      {message && <Text style={{ fontSize: 15, color: c.textMuted, textAlign: 'center' }}>{message}</Text>}
      {message && (
        <View style={{ gap: 10, alignItems: 'center' }}>
          <Pressable onPress={retry} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: c.primary }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{sessionExpired ? common.startup.restart : common.startup.retry}</Text>
          </Pressable>
          {isSignedIn && (
            <Pressable onPress={() => signOut()} style={{ paddingHorizontal: 20, paddingVertical: 10 }}>
              <Text style={{ color: c.primary, fontWeight: '600' }}>{common.startup.signInAgain}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
