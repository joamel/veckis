import { Linking } from 'react-native';
import * as SecureStore from './secureStorage';
import { INSTAGRAM_URL } from './storeLinks';
import { instagramPromo as str } from './svenska';

const KEY = 'seen-instagram-after-planning';

/** Flaggorna bakom Instagram-tipsen — nollställs med "Återställ introduktionstips" i dev-läget. */
export const INSTAGRAM_TIP_FLAGS = [KEY, 'dismissed-instagram-menu-hint'] as const;

type Confirm = (opts: {
  title: string; message: string;
  buttons: { label: string; icon?: string; style?: 'cancel'; onPress?: () => void }[];
}) => void;

/**
 * "Snyggt planerat! Följ oss på Instagram" — EN gång per telefon, efter ett
 * bra ögonblick: en veckomall lagd på en vecka eller veckomenyn överförd till
 * inköpslistan. Flaggan sätts innan kortet visas, så det kan aldrig komma två
 * gånger även om två ögonblick sker tätt efter varandra.
 */
export async function showInstagramTipOnce(confirm: Confirm, enabled: boolean): Promise<void> {
  if (!enabled || !INSTAGRAM_URL) return;
  const seen = await SecureStore.getItemAsync(KEY).catch(() => '1');
  if (seen === '1') return;
  await SecureStore.setItemAsync(KEY, '1').catch(() => {});
  const url = INSTAGRAM_URL;
  // Efter notisen ("Vecka 44 är planerad"), inte ovanpå den.
  setTimeout(() => confirm({
    title: str.afterTemplateTitle,
    message: str.afterTemplateMessage,
    buttons: [
      { label: str.follow, icon: 'logo-instagram', onPress: () => { void Linking.openURL(url).catch(() => {}); } },
      { label: str.afterTemplateLater, style: 'cancel' },
    ],
  }), 900);
}
