import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

interface NotifData {
  type?: string;
  entryId?: string;
  choreId?: string;
  listId?: string;
  householdId?: string;
}

/** Map a tapped notification's data payload to the relevant screen. */
function routeForNotification(data: NotifData | undefined): void {
  if (!data?.type) return;
  switch (data.type) {
    case 'activityReminder':
      router.push('/(tabs)/schedule');
      break;
    case 'choreOverdue':
      router.push('/(tabs)/chores');
      break;
    case 'listCleared':
      router.push(data.listId ? `/shopping/${data.listId}` : '/(tabs)/shopping');
      break;
    case 'newMember':
      router.push('/(tabs)/settings');
      break;
  }
}

/**
 * Routes the user to the relevant screen when they tap a push notification —
 * both for taps while the app runs and for a cold start (app opened by tapping
 * a notification while it was killed). Dedupes by notification identifier so a
 * single tap never navigates twice. Must be mounted inside the router context.
 */
export function useNotificationRouting(): void {
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    const handle = (res: Notifications.NotificationResponse) => {
      const id = res.notification.request.identifier;
      if (id && id === lastId.current) return;
      lastId.current = id;
      routeForNotification(res.notification.request.content.data as NotifData);
    };

    // Cold start: app was launched by tapping a notification while killed.
    Notifications.getLastNotificationResponseAsync().then(res => {
      if (res) handle(res);
    });

    // Tapped while the app is running or backgrounded.
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);
}
