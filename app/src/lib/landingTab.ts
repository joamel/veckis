// Favorit-landningssida: vilken flik appen ska öppna på efter inloggning.
// Sparas per enhet i SecureStore (inte per hushåll — det är ett personligt val).
import * as SecureStore from './secureStorage';

const ALL_LANDING_TABS = [
  { key: 'shopping', labelKey: 'shopping', icon: 'cart-outline' },
  { key: 'menu', labelKey: 'menu', icon: 'restaurant-outline' },
  { key: 'recipes', labelKey: 'recipes', icon: 'book-outline' },
] as const;

export type LandingTabKey = (typeof ALL_LANDING_TABS)[number]['key'];

export const LANDING_TABS = ALL_LANDING_TABS;

const STORE_KEY = 'preferred-landing-tab';
export const DEFAULT_LANDING_TAB: LandingTabKey = 'menu';

export async function getLandingTab(): Promise<LandingTabKey> {
  try {
    const v = await SecureStore.getItemAsync(STORE_KEY);
    // Ett sparat val som pekar på en borttagen flik faller tillbaka till default.
    return LANDING_TABS.some(t => t.key === v) ? (v as LandingTabKey) : DEFAULT_LANDING_TAB;
  } catch {
    return DEFAULT_LANDING_TAB;
  }
}

export async function setLandingTab(tab: LandingTabKey): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, tab);
}
