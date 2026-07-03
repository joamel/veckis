// Favorit-landningssida: vilken flik appen ska öppna på efter inloggning.
// Sparas per enhet i SecureStore (inte per hushåll — det är ett personligt val).
import * as SecureStore from './secureStorage';

export const LANDING_TABS = [
  { key: 'shopping', labelKey: 'shopping', icon: 'cart-outline' },
  { key: 'menu', labelKey: 'menu', icon: 'restaurant-outline' },
  { key: 'schedule', labelKey: 'schedule', icon: 'calendar-outline' },
  { key: 'chores', labelKey: 'chores', icon: 'checkbox-outline' },
] as const;

export type LandingTabKey = (typeof LANDING_TABS)[number]['key'];

const STORE_KEY = 'preferred-landing-tab';
export const DEFAULT_LANDING_TAB: LandingTabKey = 'schedule';

export async function getLandingTab(): Promise<LandingTabKey> {
  try {
    const v = await SecureStore.getItemAsync(STORE_KEY);
    return LANDING_TABS.some(t => t.key === v) ? (v as LandingTabKey) : DEFAULT_LANDING_TAB;
  } catch {
    return DEFAULT_LANDING_TAB;
  }
}

export async function setLandingTab(tab: LandingTabKey): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, tab);
}
