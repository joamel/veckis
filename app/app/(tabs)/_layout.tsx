import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePushRegistration } from '../../src/hooks/usePushRegistration';
import { useNotificationRouting } from '../../src/hooks/useNotificationRouting';
import { useTablet } from '../../src/hooks/useTablet';
import { common } from '../../src/lib/svenska';
import { RECIPE_FOCUS_EXPERIMENT } from '../../src/lib/features';

export default function TabLayout() {
  usePushRegistration();
  useNotificationRouting();
  const { fs, sp } = useTablet();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4e7a5e',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
        tabBarLabelStyle: { fontSize: fs(11) },
        tabBarStyle: { height: sp(60) + insets.bottom, paddingBottom: insets.bottom },
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
      {/* Recept-flik — bara synlig i recept-fokus-experimentet. Rutten finns
          alltid (menyns receptväljare pushar hit) men döljs ur baren när av. */}
      <Tabs.Screen
        name="recipes"
        options={{
          title: common.tabs.recipes,
          href: RECIPE_FOCUS_EXPERIMENT ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Kalender + Sysslor — döljs ur baren i experimentet men rutterna lämnas
          kvar så deep-links/notiser fortsätter fungera (reversibelt via flaggan). */}
      <Tabs.Screen
        name="schedule"
        options={{
          title: common.tabs.schedule,
          href: RECIPE_FOCUS_EXPERIMENT ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chores"
        options={{
          title: common.tabs.chores,
          href: RECIPE_FOCUS_EXPERIMENT ? null : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle-outline" size={size} color={color} />
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
