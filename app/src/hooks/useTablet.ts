import { useWindowDimensions } from 'react-native';

export function useTablet() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;
  const scale = isTablet ? 1.2 : 1;
  const fs = (n: number) => Math.round(n * scale);
  const sp = (n: number) => Math.round(n * scale);
  return { isTablet, scale, fs, sp };
}
