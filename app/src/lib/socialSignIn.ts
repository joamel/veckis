// Native Google-inloggning på iOS kräver ett eget iOS-klient-id
// (EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID) — utan det kastar Clerks hook direkt.
// Tills id:t finns döljs Google-knappen på iOS; e-post och Apple räcker där.
export function isGoogleSignInAvailable(os: string, iosClientId: string | undefined): boolean {
  if (os !== 'ios') return true;
  return !!iosClientId?.trim();
}
