import { Platform } from 'react-native';

/**
 * Check if running on web platform (React Native Web).
 * Platform.OS type doesn't include 'web', so we cast to check it.
 */
export const isWeb = () => (Platform.OS as string) === 'web';

/**
 * iOS PWA på Safari returnerar Platform.OS === 'web', inte 'ios'.
 * KeyboardAvoidingView behöver 'padding' på båda för korrekt beteende.
 */
export const isIOSLike =
  Platform.OS === 'ios' ||
  (isWeb() &&
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/.test(navigator.userAgent));

export const kavBehavior: 'padding' | 'height' = isIOSLike ? 'padding' : 'height';
