import { Linking } from 'react-native';
import * as SecureStore from './secureStorage';
import { INSTAGRAM_URL } from './storeLinks';
import { instagramPromo as str } from './svenska';
import { claimNudge } from './nudges';

const KEY = 'seen-instagram-after-planning';

/** Flaggorna bakom Instagram-tipsen — nollställs med "Visa introduktionen igen". */
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
export async function showInstagramTipOnce(confirm: Confirm): Promise<void> {
  if (!INSTAGRAM_URL) return;
  const seen = await SecureStore.getItemAsync(KEY).catch(() => '1');
  if (seen === '1') return;
  // Max en påminnelse per session — annars får det vänta (flaggan sätts inte).
  if (!claimNudge('instagram-card')) return;
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
