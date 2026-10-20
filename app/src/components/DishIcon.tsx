import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { DISH_ICONS } from '../lib/dishIcons';

/**
 * Receptets matsymbol i platshållaren: en vit konturbild (Twemoji, CC-BY 4.0)
 * som färgas här, så den följer ljust och mörkt läge som appens egna ikoner.
 */
export function DishIcon({ emoji, size, color, style }: { emoji: string; size: number; color: string; style?: StyleProp<ImageStyle> }) {
  const source = DISH_ICONS[emoji];
  if (!source) return null;
  return <Image source={source} style={[{ width: size, height: size, tintColor: color }, style]} accessibilityElementsHidden importantForAccessibility="no" />;
}
