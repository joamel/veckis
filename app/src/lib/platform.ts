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

/**
 * 'padding' på alla plattformar.
 *
 * 'height' krympte containern på Android, och krympningen låg kvar ett ögonblick
 * efter att tangentbordet stängts — synligt som ett tomrum under bottom-sheets.
 * 'padding' skjuter i stället innehållet uppåt och nollställs rent när
 * tangentbordet försvinner.
 *
 * Att i stället stänga av KeyboardAvoidingView på Android (eftersom app.json
 * sätter softwareKeyboardLayoutMode 'pan') var FEL: pan gäller appens fönster,
 * och arken ligger i en <Modal> med eget fönster som inte panoreras. Utan KAV
 * lyfte de inte alls.
 */
export const kavBehavior: 'padding' | 'height' = 'padding';

