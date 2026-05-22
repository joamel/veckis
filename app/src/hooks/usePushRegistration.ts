import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@clerk/clerk-expo';
import { useApiClient } from '../api/client';
import { registerForPush } from '../lib/registerPush';

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
 * Once the user is signed in, registers this device's push token with the
 * backend. Runs once per session; the dedicated notification modal can re-run
 * registration manually (and surface errors) via registerForPush.
 */
export function usePushRegistration(): void {
  const { isSignedIn } = useAuth();
  const client = useApiClient();
  const done = useRef(false);

  useEffect(() => {
    if (!isSignedIn || done.current) return;
    done.current = true;
    registerForPush(client).then(res => {
      if (res.status !== 'ok') done.current = false; // allow a manual retry later
    });
  }, [isSignedIn, client]);
}
