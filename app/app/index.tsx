import { ActivityIndicator, Platform, View } from 'react-native';
import { useAuth } from '@clerk/expo';
import { useTheme } from '../src/context/ThemeContext';
import { WebLanding } from '../src/components/WebLanding';

// Entry point. På webben ser en utloggad besökare den publika landningssidan
// (marknadsföring + Googles OAuth-verifiering kräver publik hemsida). Native +
// inloggade hanteras av NavigationGuard i _layout.tsx (redirect till login/tabs).
export default function Index() {
  const { colors: c } = useTheme();
  const { isLoaded, isSignedIn } = useAuth();

  if (Platform.OS === 'web' && isLoaded && !isSignedIn) {
    return <WebLanding />;
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background }}>
      <ActivityIndicator size="large" color={c.primary} />
    </View>
  );
}
