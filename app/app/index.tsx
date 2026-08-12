import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../src/context/ThemeContext';

// Entry point — NavigationGuard in _layout.tsx handles the actual redirect
export default function Index() {
  const { colors: c } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background }}>
      <ActivityIndicator size="large" color={c.primary} />
    </View>
  );
}
