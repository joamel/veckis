import { useWindowDimensions } from 'react-native';

export function useTablet() {
  const { width } = useWindowDimensions();
  return width >= 600;
}
