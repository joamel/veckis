import type { StyleProp, ViewStyle } from 'react-native';

export type AppleSignInButtonProps = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

// Sign in with Apple finns bara på iOS — se AppleSignInButton.ios.tsx. På
// Android och webb renderas inget, och eftersom Metro väljer .ios-filen per
// plattform hamnar expo-apple-authentication aldrig i de bundlarna.
export function AppleSignInButton(_props: AppleSignInButtonProps) {
  return null;
}
