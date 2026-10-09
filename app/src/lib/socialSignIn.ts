// Native Google-inloggning på iOS kräver ett eget iOS-klient-id
// (EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID) — utan det kastar Clerks hook direkt.
// Tills id:t finns döljs Google-knappen på iOS; e-post och Apple räcker där.
//
// Dessutom måste iOS-bygget ha id:ts URL-schema i Info.plist, annars kraschar
// Googles bibliotek (ett native-undantag, inte ett JS-fel) vid tryck. Schemat
// kommer in vid bygget, medan id:t når appen via OTA — så knappen kräver ett
// bygge som är nytt nog: bygge 5 är det första med schemat.
export const FIRST_IOS_BUILD_WITH_GOOGLE = 5;

export function isGoogleSignInAvailable(
  os: string,
  iosClientId: string | undefined,
  iosBuildNumber?: string | null,
): boolean {
  if (os !== 'ios') return true;
  if (!iosClientId?.trim()) return false;
  const build = Number(iosBuildNumber);
  return Number.isFinite(build) && build >= FIRST_IOS_BUILD_WITH_GOOGLE;
}
