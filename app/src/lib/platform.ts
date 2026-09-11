import { Platform } from 'react-native';

/**
 * Check if running on web platform (React Native Web).
 * Platform.OS type doesn't include 'web', so we cast to check it.
 */
export const isWeb = () => (Platform.OS as any) === 'web';

/**
 * iOS PWA på Safari returnerar Platform.OS as any === 'web', inte 'ios'.
 * KeyboardAvoidingView behöver 'padding' på båda för korrekt beteende.
 */
export const isIOSLike =
  Platform.OS as any === 'ios' ||
  (isWeb() &&
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/.test(navigator.userAgent));

export const kavBehavior: 'padding' | 'height' = isIOSLike ? 'padding' : 'height';

/**
 * Ska KeyboardAvoidingView vara på?
 *
 * Nej på Android: app.json sätter `softwareKeyboardLayoutMode: "pan"`, så
 * systemet panorerar redan hela fönstret när tangentbordet öppnas. En
 * KeyboardAvoidingView ovanpå det krymper innehållet EN GÅNG TILL, och
 * krympningen ligger kvar ett ögonblick när tangentbordet stängs — synligt som
 * ett tomrum under bottom-sheets.
 *
 * iOS panorerar inte av sig självt och behöver den fortfarande.
 */
export const kavEnabledPerPlattform = Platform.OS !== 'android';
