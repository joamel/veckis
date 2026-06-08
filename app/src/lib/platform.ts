import { Platform } from 'react-native';

/**
 * iOS PWA på Safari returnerar Platform.OS === 'web', inte 'ios'.
 * KeyboardAvoidingView behöver 'padding' på båda för korrekt beteende.
 */
export const isIOSLike =
  Platform.OS === 'ios' ||
  (Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/.test(navigator.userAgent));

export const kavBehavior: 'padding' | 'height' = isIOSLike ? 'padding' : 'height';
