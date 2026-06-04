// Plattformsdetektering för install-sidan. Kör bara på web — native app har
// redan installerat sig själv så vi behöver inget där.
//
// Strategi: titta på user agent. UA är inte 100% tillförlitlig (kan spoofs)
// men funkar för en hjälp-sida — användaren har inget att tjäna på att lura
// sin egen install-guide.

export type InstallTarget =
  | 'android-chrome'  // Android med Chrome/Edge/Brave/Samsung Internet → PWA-prompt + APK
  | 'android-other'   // Android utan stöd för PWA-prompt → bara APK
  | 'ios-safari'      // iOS Safari → manuell "Lägg till på hemskärmen"
  | 'ios-other'       // iOS andra browsers (Chrome iOS är Safari under huven) → samma
  | 'desktop-chromium'// Chrome/Edge/Brave desktop → PWA-prompt via address-bar
  | 'desktop-firefox' // Firefox desktop → ingen PWA-install
  | 'desktop-safari'  // Safari på Mac → ingen PWA-install
  | 'desktop-other'   // okänd desktop
  | 'unknown';        // SSR / utan navigator

/**
 * Bestäm install-target från en user agent + ev. maxTouchPoints. Ren funktion
 * så den är trivial att testa — `detectInstallTarget()` (utan args) plockar
 * upp navigator-state automatiskt och delegerar hit.
 */
export function detectInstallTargetFor(ua: string | undefined, maxTouchPoints = 0): InstallTarget {
  if (!ua) return 'unknown';
  const lc = ua.toLowerCase();
  const isAndroid = /android/.test(lc);
  const isIOS = /iphone|ipad|ipod/.test(lc) || (/(macintosh).*safari/.test(lc) && maxTouchPoints > 1);
  const isFirefox = /firefox\//.test(lc);
  const isSafari = /safari\//.test(lc) && !/chrome|crios|edg|opr/.test(lc);
  // Chromium-baserade browsers stödjer beforeinstallprompt och PWA-install.
  const isChromium = /chrome|crios|edg|opr|samsungbrowser/.test(lc);

  if (isAndroid) return isChromium ? 'android-chrome' : 'android-other';
  if (isIOS) return /safari/.test(lc) && !/crios|fxios|edgios/.test(lc) ? 'ios-safari' : 'ios-other';
  if (isFirefox) return 'desktop-firefox';
  if (isSafari) return 'desktop-safari';
  if (isChromium) return 'desktop-chromium';
  return 'desktop-other';
}

export function detectInstallTarget(): InstallTarget {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'unknown';
  return detectInstallTargetFor(navigator.userAgent, navigator.maxTouchPoints);
}

/** True om webbappen redan körs som installerad PWA (display-mode standalone). */
export function isAlreadyInstalled(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    // iOS Safari specific:
    || (window.navigator as { standalone?: boolean }).standalone === true;
}
