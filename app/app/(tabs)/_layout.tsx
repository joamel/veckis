import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePushRegistration } from '../../src/hooks/usePushRegistration';
import { useNotificationRouting } from '../../src/hooks/useNotificationRouting';
import { useTablet } from '../../src/hooks/useTablet';

export default function TabLayout() {
  usePushRegistration();
  useNotificationRouting();
  const { fs, sp } = useTablet();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4f46e5',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
        tabBarLabelStyle: { fontSize: fs(11) },
        tabBarStyle: { height: sp(60) },
        tabBarIconStyle: { marginTop: sp(2) },
      }}
    >
      <Tabs.Screen
        name="shopping"
        options={{
          title: 'Inköp',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Meny',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Kalender',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chores"
        options={{
          title: 'Sysslor',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Hushållet',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
