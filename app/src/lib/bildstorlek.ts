/**
 * Uträkning av hur en bild ska skalas inför uppladdning. Ligger utanför
 * API-klienten för att kunna testas: orienteringslogiken är lätt att få
 * bakvänd, och felet syns inte — bilden blir bara onödigt stor.
 */

/** ImageManipulator tar bara en dimension i taget; den andra följer proportionerna. */
export type Resize = { width: number } | { height: number };

/**
 * Håller längsta sidan inom `max`. En bild som redan får plats skalas inte alls
 * (att skala upp gör den bara större utan att tillföra något).
 *
 * `max` bör vara 1568 för bilder som ska tolkas av Claude — modellen skalar ner
 * allt däröver ändå, så större bild kostar bara överföringstid och tokens.
 */
export function passaInom(bredd: number, höjd: number, max: number): Resize {
  const liggande = bredd >= höjd;
  const längsta = liggande ? bredd : höjd;
  const mål = Math.min(längsta, max);
  return liggande ? { width: mål } : { height: mål };
}
