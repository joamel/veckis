import { Text, type StyleProp, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { recipes as str } from '../lib/svenska';

/** Är det taggen som ger receptkorten ett hjärta? */
export function isFavoriteTag(tag: string): boolean {
  return tag === str.tags.favorite;
}

/**
 * En taggs etikett i ett chip. Favorittaggen lagras som "favorit" men visas
 * som hjärta + "Favoriter", samma hjärta som på receptkorten — så det syns
 * att det är taggen som ger korten deras hjärta. Chippet måste vara en rad.
 */
export function TagLabel({ tag, style, iconColor }: { tag: string; style?: StyleProp<TextStyle>; iconColor: string }) {
  if (!isFavoriteTag(tag)) return <Text style={style}>{tag}</Text>;
  return (
    <>
      <Ionicons name="heart" size={12} color={iconColor} />
      <Text style={style}>{str.tags.favoriteLabel}</Text>
    </>
  );
}
