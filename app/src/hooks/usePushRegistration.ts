import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useAuth } from '@clerk/clerk-expo';
import { useApiClient } from '../api/client';

// Foreground behaviour: show a banner + play sound when a push arrives while
// the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Once the user is signed in, requests notification permission, fetches this
 * device's Expo push token and registers it with the backend. Safe to call from
 * the authenticated layout — runs once per session and silently no-ops on
 * simulators or when permission is denied.
 */
export function usePushRegistration(): void {
  const { isSignedIn } = useAuth();
  const client = useApiClient();
  const done = useRef(false);

  useEffect(() => {
    if (!isSignedIn || done.current) return;
    done.current = true;

    (async () => {
      try {
        // Push tokens are only available on physical devices.
        if (!Device.isDevice) return;

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Standard',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const existing = await Notifications.getPermissionsAsync();
        let granted = existing.granted;
        if (!granted && existing.canAskAgain) {
          const req = await Notifications.requestPermissionsAsync();
          granted = req.granted;
        }
        if (!granted) { done.current = false; return; }

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        await client.registerPushToken(tokenData.data, Platform.OS);
      } catch (e) {
        // Non-fatal — user can still use the app without push.
        console.warn('Push registration failed:', e instanceof Error ? e.message : e);
        done.current = false;
      }
    })();
  }, [isSignedIn, client]);
}
