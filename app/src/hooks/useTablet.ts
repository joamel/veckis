import { useWindowDimensions } from 'react-native';

export function useTablet() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 600;
  // Earlier 1.2x felt smaller than the phone visually because px-based card
  // and icon sizes didn't compensate. Bump tablet to 1.6x; larger tablets (>=900px) to 1.8x.
  const largeTablet = width >= 900;
  const scale = largeTablet ? 1.8 : isTablet ? 1.6 : 1;
  const fs = (n: number) => Math.round(n * scale);
  const sp = (n: number) => Math.round(n * scale);
  return { isTablet, scale, fs, sp };
}
