// Bygger delbar URL för en invite-kod och triggar plattformsspecifik share.
//
// På web (PWA): Web Share API om browsern stödjer, annars Clipboard +
// "länk kopierad"-toast som fallback. På native: react-native Share-API.
import { Clipboard, Platform, Share } from 'react-native';

// Domänen där PWA hostas. Kan flyttas till en env var senare när vi byter
// till custom domain — för nu hardcoded.
const WEB_BASE_URL = 'https://veckis-web.onrender.com';

export function buildInviteUrl(code: string): string {
  return `${WEB_BASE_URL}/household/setup?code=${encodeURIComponent(code)}`;
}

interface ShareResult {
  /** 'shared' | 'copied' — så caller kan visa rätt toast. */
  outcome: 'shared' | 'copied';
}

/**
 * Försök öppna systemets share-sheet. Om browsern saknar Web Share API
 * (Safari på äldre macOS, Firefox på desktop, etc.) faller vi tillbaka
 * till clipboard. Caller får veta utfallet och kan ge rätt feedback.
 */
export async function shareInviteLink(
  householdName: string,
  code: string,
): Promise<ShareResult> {
  const url = buildInviteUrl(code);
  const message = `Gå med i ${householdName} på Veckis — öppna länken:\n${url}`;

  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ title: 'Veckis-inbjudan', text: message, url });
        return { outcome: 'shared' };
      } catch (err) {
        // Användaren avbröt eller browsern blockerade — falla tillbaka till copy.
        if (err instanceof Error && err.name === 'AbortError') {
          return { outcome: 'shared' }; // ingen toast vid abort
        }
      }
    }
    Clipboard.setString(url);
    return { outcome: 'copied' };
  }

  // Native: använd RN Share, som öppnar systemets share-sheet.
  await Share.share({ message, url, title: 'Veckis-inbjudan' });
  return { outcome: 'shared' };
}
