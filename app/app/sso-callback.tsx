import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useClerk } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/context/ThemeContext';

// Callback-route för Clerks OAuth-redirect-flöde (webb). Clerk skickar tillbaka
// användaren hit efter Google-inloggningen; handleRedirectCallback slutför
// sessionen och navigerar vidare (redirectUrlComplete = "/"). Publik route
// (se NavigationGuard). Träffas bara på webben — native använder useSSO.
export default function SSOCallback() {
  const { handleRedirectCallback } = useClerk();
  const router = useRouter();
  const { colors: c } = useTheme();

  useEffect(() => {
    handleRedirectCallback({}, async (to: string) => { router.replace(to as never); })
      .catch(() => router.replace('/'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background }}>
      <ActivityIndicator size="large" color={c.primary} />
    </View>
  );
}
