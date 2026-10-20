// Matsymbolerna som platshållaren för recept utan bild kan visa — Twemoji
// (CC-BY 4.0) omgjorda till konturer, se backend/scripts/build-dish-icons.ts.
// AI:n väljer bland exakt de här (backend/src/lib/dishIcon.ts), och appen har
// en bild per symbol (app/src/lib/dishIcons.ts, genererad).
export const DISH_ICON_EMOJIS = [
  // Rätter
  '🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🥘', '🍲', '🫕', '🥣', '🥗',
  '🍝', '🍜', '🍛', '🍚', '🍙', '🍘', '🍱', '🍣', '🍤', '🍥', '🍢', '🥟', '🥠', '🥡', '🍳',
  '🥞', '🧇', '🥐', '🥖', '🍞', '🫓', '🥨', '🥯', '🧀', '🥚', '🍖', '🍗', '🥩', '🥓', '🥫',
  '🍿', '🧈',
  // Fisk och skaldjur
  '🐟', '🦐', '🦞', '🦀', '🦑', '🦪', '🐙',
  // Grönsaker
  '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🫘', '🥜',
  '🌰', '🫚', '🫛', '🍅', '🫒',
  // Frukt och bär
  '🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🫐',
  '🥝', '🥥',
  // Sött
  '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🥮',
  '🍡',
  // Dryck
  '🥛', '☕', '🫖', '🍵', '🍷', '🍸', '🍹', '🍺', '🥂', '🥃', '🥤', '🧋', '🧃', '🧉',
  // Reserv
  '🍽️',
] as const;

export type DishIconEmoji = typeof DISH_ICON_EMOJIS[number];

export const DISH_ICON_FALLBACK: DishIconEmoji = '🍽️';

export function isDishIconEmoji(e: string | null | undefined): e is DishIconEmoji {
  return !!e && (DISH_ICON_EMOJIS as readonly string[]).includes(e);
}
