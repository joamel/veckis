import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePushRegistration } from '../../src/hooks/usePushRegistration';
import { useNotificationRouting } from '../../src/hooks/useNotificationRouting';
import { useTablet } from '../../src/hooks/useTablet';
import { common } from '../../src/lib/svenska';
import { useTheme } from '../../src/context/ThemeContext';

export default function TabLayout() {
  usePushRegistration();
  useNotificationRouting();
  const { fs, sp } = useTablet();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textFaint,
        headerShown: false,
        tabBarLabelStyle: { fontSize: fs(11) },
        tabBarStyle: {
          height: sp(60) + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: c.surface,
          borderTopColor: c.surfaceSubtle,
        },
        sceneStyle: { backgroundColor: c.background },
        tabBarIconStyle: { marginTop: sp(2) },
      }}
    >
      <Tabs.Screen
        name="shopping"
        options={{
          title: common.tabs.shopping,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: common.tabs.menu,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: common.tabs.recipes,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: common.tabs.settings,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
