import * as Haptics from 'expo-haptics';

export function useHaptics() {
  const light = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Light);
  const medium = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Medium);
  const heavy = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Heavy);
  const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  const warning = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  const error = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

  return { light, medium, heavy, success, warning, error };
}
