import { useCallback } from 'react';
import { Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { common } from '../lib/svenska';

export type ImageSource = 'camera' | 'library';

/**
 * Frågar om kamera-/bildbehörighet innan picker öppnas. Svarar true om den
 * är beviljad.
 *
 * iOS kastar "Missing camera permission" om launchCameraAsync anropas utan
 * beviljad behörighet — App Review nekade 2.2.0 (6) för det. Systemfrågan
 * visas dessutom bara en gång: har man nekat svarar requestXxx direkt med
 * canAskAgain=false, och då är Inställningar enda vägen tillbaka. Därför
 * erbjuds en genväg dit i stället för en toast som inte leder någonstans.
 */
export function useImagePermission(): (source: ImageSource) => Promise<boolean> {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const str = common.permissions;

  return useCallback(async (source: ImageSource) => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.granted) return true;
    const texts = source === 'camera' ? str.camera : str.photos;
    if (perm.canAskAgain) {
      // Nyss nekat i systemfrågan — ett eget ark ovanpå vore tjat.
      showToast(texts.denied, 'neutral');
      return false;
    }
    confirm({
      title: texts.blockedTitle,
      message: texts.blockedMessage,
      buttons: [
        { label: str.openSettings, onPress: () => { Linking.openSettings(); } },
        { label: common.actions.cancel, style: 'cancel' },
      ],
    });
    return false;
  }, [confirm, showToast, str]);
}
