import { useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { AppleSignInButtonProps } from './AppleSignInButton';

// Apples egen knapp — App Store-reglerna kräver den i stället för en
// egenritad. Färg och hörnradie går bara att välja via buttonStyle/cornerRadius,
// och texten ("Fortsätt med Apple") lokaliseras av iOS efter appens språk.
export function AppleSignInButton({ onPress, style }: AppleSignInButtonProps) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAvailable).catch(() => setAvailable(false));
  }, []);

  if (!available) return null;
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={14}
      style={style}
      onPress={onPress}
    />
  );
}
