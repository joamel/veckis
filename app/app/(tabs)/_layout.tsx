import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GettingStartedOverlay } from '../../src/components/GettingStartedOverlay';
import { usePushRegistration } from '../../src/hooks/usePushRegistration';
import { useNotificationRouting } from '../../src/hooks/useNotificationRouting';
import { useTablet } from '../../src/hooks/useTablet';
import { common } from '../../src/lib/svenska';
import { useTheme } from '../../src/context/ThemeContext';
import { useDesign } from '../../src/context/DesignContext';
import { ny } from '../../src/lib/nyDesign';

export default function TabLayout() {
  usePushRegistration();
  useNotificationRouting();
  const { fs, sp } = useTablet();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  // Ny design (beta): mörk flikrad med lime för den aktiva fliken. Den tas
  // först nu, när alla flikar har den nya designen — annars blev det lapptäcke.
  const { nyDesign } = useDesign();
  return (
    <View style={{ flex: 1 }}>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: nyDesign ? ny.lime : c.primary,
        tabBarInactiveTintColor: nyDesign ? ny.flikInaktiv : c.textFaint,
        headerShown: false,
        tabBarLabelStyle: { fontSize: fs(11) },
        tabBarStyle: {
          height: sp(60) + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: nyDesign ? ny.skog : c.surface,
          borderTopColor: nyDesign ? ny.skog : c.surfaceSubtle,
        },
        sceneStyle: { backgroundColor: nyDesign ? ny.bakgrund : c.background },
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
    <GettingStartedOverlay />
    </View>
  );
}
