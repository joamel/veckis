import { ActivityIndicator, View } from 'react-native';

// Entry point — NavigationGuard in _layout.tsx handles the actual redirect
export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#4e7a5e" />
    </View>
  );
}
