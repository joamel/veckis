// Generella ikoner för inköpslistor i den nya designen, i stället för emoji —
// färgemoji krockar med den gröna paletten.
//
// Sparas i listans befintliga emoji-fält som en kort kod ("i:korg"), så det
// behövs varken migration eller backendändring. Backenden tar högst 8 tecken
// (z.string().max(8) i routes/shopping.ts), därför är koderna korta. Gamla
// listor har kvar sin emoji.

export type ListIkonNamn =
  | 'cart-outline' | 'basket-outline' | 'bag-handle-outline' | 'storefront-outline'
  | 'restaurant-outline' | 'leaf-outline' | 'fish-outline' | 'cafe-outline'
  | 'sparkles-outline' | 'gift-outline' | 'home-outline' | 'paw-outline'
  | 'medkit-outline' | 'cube-outline';

export const LIST_IKONER: readonly { kod: string; ikon: ListIkonNamn }[] = [
  { kod: 'i:vagn', ikon: 'cart-outline' },
  { kod: 'i:korg', ikon: 'basket-outline' },
  { kod: 'i:pase', ikon: 'bag-handle-outline' },
  { kod: 'i:butik', ikon: 'storefront-outline' },
  { kod: 'i:mat', ikon: 'restaurant-outline' },
  { kod: 'i:blad', ikon: 'leaf-outline' },
  { kod: 'i:fisk', ikon: 'fish-outline' },
  { kod: 'i:kaffe', ikon: 'cafe-outline' },
  { kod: 'i:fest', ikon: 'sparkles-outline' },
  { kod: 'i:gava', ikon: 'gift-outline' },
  { kod: 'i:hem', ikon: 'home-outline' },
  { kod: 'i:djur', ikon: 'paw-outline' },
  { kod: 'i:vard', ikon: 'medkit-outline' },
  { kod: 'i:paket', ikon: 'cube-outline' },
];

/** Ikonen för en lista vars emoji-fält har en ikonkod, annars null
 *  (ingen ikon vald, eller en gammal emoji). */
export function listIkon(emoji: string | null | undefined): ListIkonNamn | null {
  if (!emoji) return null;
  return LIST_IKONER.find(i => i.kod === emoji)?.ikon ?? null;
}
