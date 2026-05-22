import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

export type PushRegisterStatus =
  | { status: 'ok'; token: string }
  | { status: 'denied' }       // user declined the OS permission
  | { status: 'unsupported' }  // simulator / no device
  | { status: 'error'; error: string };

interface TokenRegistrar {
  registerPushToken: (token: string, platform?: string) => Promise<unknown>;
}

/**
 * Requests notification permission (if needed), fetches this device's Expo push
 * token and registers it with the backend. Returns a precise status so the UI
 * can tell the user *why* push isn't working (denied, simulator, FCM/token
 * error, etc.) instead of failing silently.
 */
export async function registerForPush(client: TokenRegistrar): Promise<PushRegisterStatus> {
  try {
    if (!Device.isDevice) return { status: 'unsupported' };

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
    if (!granted) return { status: 'denied' };

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await client.registerPushToken(tokenData.data, Platform.OS);
    return { status: 'ok', token: tokenData.data };
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}
